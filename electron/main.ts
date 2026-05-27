import { app, BrowserWindow, dialog, Tray, Menu, session, shell, nativeImage } from 'electron';
import { fork, ChildProcess } from 'child_process';
import * as path from 'path';
import * as net from 'net';
import Store from 'electron-store';
// @ts-ignore - electron-window-state is a CJS module using 'export =' which lacks an ES default export
import windowStateKeeper from 'electron-window-state';
import * as Sentry from '@sentry/electron/main';
import { autoUpdater } from 'electron-updater';
import { registerDialogHandlers } from './ipc/dialog';
import { registerVaultHandlers } from './ipc/vault';
import { registerWindowHandlers } from './ipc/window';
import { registerSystemHandlers } from './ipc/system';

// @ts-ignore - electron-store is a pure ESM package. When compiled to CJS, the import might resolve to a namespace object
const StoreConstructor = typeof Store === 'function' ? Store : (Store as any).default;
const store = new StoreConstructor();

// Initialize Sentry BEFORE app.whenReady()
if (process.env.NYX_SENTRY_DSN) {
  Sentry.init({
    dsn: process.env.NYX_SENTRY_DSN,
    environment: app.isPackaged ? 'production' : 'development',
    release: `nyx@${app.getVersion()}`,
    beforeSend(event) {
      // Respect user privacy: check opt-in setting
      if (!store.get('telemetryEnabled', false)) return null;
      return event;
    },
  });
}

// Single Instance Lock
const isSingleInstance = app.requestSingleInstanceLock();
if (!isSingleInstance) {
  app.quit();
  process.exit(0);
}

let mainWindow: BrowserWindow | null = null;
let tray: Tray | null = null;
let serverManager: ServerManager | null = null;

function waitForPort(port: number, host = '127.0.0.1', timeout = 30000): Promise<void> {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    function check() {
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for port ${port}`));
        return;
      }

      const socket = new net.Socket();
      socket.setTimeout(200);

      socket.on('connect', () => {
        socket.destroy();
        resolve();
      });

      socket.on('timeout', () => {
        socket.destroy();
        setTimeout(check, 100);
      });

      socket.on('error', () => {
        socket.destroy();
        setTimeout(check, 100);
      });

      socket.connect(port, host);
    }

    check();
  });
}

function findFreePort(startPort: number): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.listen(startPort, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address !== null ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on('error', () => {
      resolve(findFreePort(startPort + 1));
    });
  });
}

class ServerManager {
  private child: ChildProcess | null = null;
  private expressPort = 3000;
  private fastifyPort = 3001;
  private restartAttempts = 0;
  private restartDelay = 1000; // 1s
  private maxRestarts = 5;
  private serverPath = '';
  private isShuttingDown = false;
  private stderrBuffer: string[] = [];

  constructor() {
    let serverPath = path.join(app.getAppPath(), 'dist-server', 'server.cjs');
    if (serverPath.includes('app.asar')) {
      serverPath = serverPath.replace('app.asar', 'app.asar.unpacked');
    }
    this.serverPath = serverPath;
  }

  async start(): Promise<{ expressPort: number; fastifyPort: number }> {
    this.expressPort = await findFreePort(3000);
    this.fastifyPort = await findFreePort(this.expressPort + 1);

    await this.spawn();
    return { expressPort: this.expressPort, fastifyPort: this.fastifyPort };
  }

  private async spawn(): Promise<void> {
    if (this.isShuttingDown) return;

    console.log(`[Electron] Spawning server process from: ${this.serverPath}`);
    this.stderrBuffer = [];

    const serverEnv: Record<string, string> = {
      ...process.env,
      PORT: String(this.expressPort),
      FASTIFY_PORT: String(this.fastifyPort),
      NODE_ENV: app.isPackaged ? 'production' : 'development',
    };

    if (app.isPackaged) {
      serverEnv.NODE_PATH = path.join(app.getAppPath().replace('app.asar', 'app.asar.unpacked'), 'node_modules');
    }

    this.child = fork(this.serverPath, [], {
      env: serverEnv,
      silent: true, // pipe stdout/stderr manually
    });

    this.child.stdout?.on('data', (data) => {
      process.stdout.write(`[Server] ${data.toString()}`);
    });

    this.child.stderr?.on('data', (data) => {
      const msg = data.toString();
      process.stderr.write(`[Server ERROR] ${msg}`);
      this.stderrBuffer.push(msg);
      if (this.stderrBuffer.length > 25) {
        this.stderrBuffer.shift();
      }
    });

    this.child.on('exit', (code, signal) => {
      console.log(`[Electron] Server exited with code ${code}, signal ${signal}`);
      if (this.isShuttingDown) return;

      this.handleCrash();
    });

    // Wait for the port to accept connections
    await waitForPort(this.expressPort);
  }

  private handleCrash(): void {
    if (this.restartAttempts >= this.maxRestarts) {
      const errorDetails = this.stderrBuffer.join('') || 'No error details recorded.';
      dialog.showErrorBox(
        'Fatal Server Crash',
        `The NYX local server has repeatedly crashed. The application will now terminate.\n\nError details:\n${errorDetails}`
      );
      app.quit();
      return;
    }

    this.restartAttempts++;
    const delay = this.restartDelay;
    this.restartDelay *= 2; // exponential backoff: 1s, 2s, 4s, 8s, 16s

    console.warn(`[Electron] Server crashed. Restarting in ${delay}ms... (Attempt ${this.restartAttempts}/${this.maxRestarts})`);

    setTimeout(() => {
      this.spawn().catch((err) => {
        console.error('[Electron] Failed to restart server:', err);
      });
    }, delay);
  }

  async shutdown(): Promise<void> {
    this.isShuttingDown = true;
    if (this.child) {
      console.log('[Electron] Shutting down Node.js server child fork...');
      this.child.kill('SIGTERM');

      // Wait up to 10 seconds for child to exit gracefully
      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn('[Electron] Server child fork failed to exit gracefully. Force killing...');
          this.child?.kill('SIGKILL');
          resolve();
        }, 10000);

        this.child?.on('exit', () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }

    // Kill any distributed llama-server processes left in VRAM
    try {
      const { execSync } = require('child_process');
      if (process.platform === 'win32') {
        execSync('taskkill /f /im llama-server.exe', { stdio: 'ignore' });
        console.log('[Electron] Force cleaned up local GGUF llama-server.');
      } else {
        execSync('killall -9 llama-server', { stdio: 'ignore' });
        console.log('[Electron] Force cleaned up macOS/Linux GGUF llama-server.');
      }
    } catch { }
  }
}

async function bootApp() {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  serverManager = new ServerManager();
  const { expressPort } = await serverManager.start();

  createWindow(expressPort);
  createTray();
  createMenus();
  setupAutoUpdater();
}

function getAppIcon() {
  const isDev = !app.isPackaged;
  const iconExt = process.platform === 'win32' ? 'ico' : 'png';
  const iconName = `nyx-icon.${iconExt}`;
  
  const iconPath = isDev
    ? path.join(__dirname, '../public', iconName)
    : path.join(__dirname, '../dist', iconName);

  return nativeImage.createFromPath(iconPath);
}

function createWindow(expressPort: number) {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1440,
    defaultHeight: 900,
  });

  const preloadPath = path.join(__dirname, 'preload.cjs');
  console.log(`[Electron] Loading preload script from: ${preloadPath}`);

  mainWindow = new BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    title: 'NYX - Native Local Intelligence & Cloud Orchestration Platform',
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath,
    },
    icon: getAppIcon(),
  });

  mainWindowState.manage(mainWindow);

  // Set Content Security Policy dynamically
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = !app.isPackaged;
    const scriptSrc = isDev ? "'self' 'unsafe-inline'" : "'self'";
    const csp = `
      default-src 'self';
      script-src ${scriptSrc};
      style-src 'self' 'unsafe-inline' https://fonts.googleapis.com;
      font-src 'self' https://fonts.gstatic.com;
      connect-src 'self' http://localhost:* ws://localhost:* http://127.0.0.1:* ws://127.0.0.1:* https://*.googleapis.com https://*.huggingface.co https://*.openrouter.ai https://*.nvidia.com https://*.opencode.ai https://*.pollinations.ai;
      img-src 'self' data: https:;
      media-src 'self';
      frame-ancestors 'none';
      base-uri 'self';
    `.replace(/\s+/g, ' ').trim();

    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [csp],
      },
    });
  });

  // Load local server URL
  const targetUrl = `http://localhost:${expressPort}`;
  console.log(`[Electron] Loading browser window at: ${targetUrl}`);
  mainWindow.loadURL(targetUrl);

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  mainWindow.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Register all IPC Handlers
  registerDialogHandlers(mainWindow);
  registerVaultHandlers();
  registerWindowHandlers(mainWindow);
  registerSystemHandlers();
}

function createTray() {
  tray = new Tray(getAppIcon());

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show NYX',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      },
    },
    {
      label: 'Quick Prompt',
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send('navigate', '/coder');
      },
    },
    {
      label: 'GPU Status: Active',
      enabled: false,
    },
    { type: 'separator' },
    {
      label: 'Check for Updates...',
      click: () => {
        autoUpdater.checkForUpdatesAndNotify();
      },
    },
    {
      label: 'Quit NYX',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setToolTip('NYX Platform');
  tray.setContextMenu(contextMenu);
}

function createMenus() {
  const template: any[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Open Workspace',
          accelerator: 'CmdOrCtrl+O',
          click: () => {
            mainWindow?.webContents.send('navigate', '/settings');
          },
        },
        {
          label: 'Settings',
          accelerator: 'CmdOrCtrl+,',
          click: () => {
            mainWindow?.webContents.send('navigate', '/settings');
          },
        },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'Model',
      submenu: [
        {
          label: 'Registry',
          accelerator: 'CmdOrCtrl+M',
          click: () => {
            mainWindow?.webContents.send('navigate', '/settings');
          },
        },
        {
          label: 'Unload Current Model',
          click: () => {
            mainWindow?.webContents.send('model:unload');
          },
        },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'forceReload' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'Documentation',
          click: async () => {
            await shell.openExternal('https://github.com/yashas-30/NYX');
          },
        },
        {
          label: 'Report Issue',
          click: async () => {
            await shell.openExternal('https://github.com/yashas-30/NYX/issues');
          },
        },
        { role: 'about' },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

function setupAutoUpdater() {
  autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1000); // 4 hours

  autoUpdater.on('update-available', (info) => {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'info',
        title: 'Update Available',
        message: `NYX version ${info.version} is available and downloading in the background.`,
        buttons: ['OK'],
      });
    }
  });

  autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) {
      dialog.showMessageBox(mainWindow, {
        type: 'question',
        title: 'Update Ready',
        message: `NYX version ${info.version} has finished downloading. Restart now to apply?`,
        buttons: ['Restart Now', 'Later'],
        defaultId: 0,
        cancelId: 1,
      }).then((res) => {
        if (res.response === 0) {
          autoUpdater.quitAndInstall();
        }
      });
    }
  });
}

app.on('ready', bootApp);

app.on('window-all-closed', () => {
  app.quit();
});

app.on('before-quit', async (e) => {
  if (serverManager) {
    e.preventDefault();
    await serverManager.shutdown();
    app.exit(0);
  }
});
