const { app, BrowserWindow, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const net = require('net');

// Set NODE_ENV to production if running inside packaged executable
if (app.isPackaged) {
  process.env.NODE_ENV = 'production';
  process.env.IS_PACKAGED = 'true';
} else {
  process.env.NODE_ENV = 'development';
  process.env.IS_PACKAGED = 'false';
}

let mainWindow = null;
let expressPort = 3000;
let fastifyPort = 3001;

/**
 * Finds a free TCP port starting from a baseline port
 */
function findFreePort(startPort) {
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

/**
 * Polls a port until it is open and accepting TCP connections
 */
function waitForPort(port, host = '127.0.0.1', timeout = 30000) {
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

async function bootApp() {
  console.log('[Electron] Resolving available network ports...');
  
  // Resolve separate free ports for Express and Fastify
  expressPort = await findFreePort(3000);
  fastifyPort = await findFreePort(expressPort + 1);
  
  console.log(`[Electron] Selected Ports: Express = ${expressPort}, Fastify = ${fastifyPort}`);
  
  // Inject resolved ports into environment variables for the server bootstrap
  process.env.PORT = String(expressPort);
  process.env.FASTIFY_PORT = String(fastifyPort);

  // Import our compiled server script. This boots both Express and Fastify.
  try {
    const serverPath = path.join(__dirname, '../dist-server/server.js');
    console.log(`[Electron] Launching background servers from: ${serverPath}`);
    const serverUrl = require('url').pathToFileURL(serverPath).href;
    import(serverUrl);
    
    console.log(`[Electron] Waiting for background server on port ${expressPort}...`);
    await waitForPort(expressPort);
    console.log('[Electron] Background server is ready!');
  } catch (err) {
    console.error('[Electron] Failed to start background servers:', err);
    dialog.showErrorBox('Background Server Error', `Failed to start NYX local server: ${err.message}`);
    app.quit();
    return;
  }

  createWindow();
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    title: "NYX - Native Local Intelligence & Cloud Orchestration Platform",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    },
    icon: path.join(__dirname, '../public/nyx-icon.png')
  });

  // Load local server URL
  const targetUrl = `http://localhost:${expressPort}`;
  console.log(`[Electron] Loading browser window at: ${targetUrl}`);
  mainWindow.loadURL(targetUrl);

  // Focus app window on start
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// Boot app when ready
app.on('ready', bootApp);

app.on('window-all-closed', () => {
  console.log('[Electron] All windows closed, shutting down...');
  app.quit();
});

app.on('will-quit', () => {
  console.log('[Electron] Performing final resource clean-up...');
  
  // Force-kill any local GGUF llama-server processes left running in VRAM/CPU
  try {
    const { execSync } = require('child_process');
    if (process.platform === 'win32') {
      execSync('taskkill /f /im llama-server.exe', { stdio: 'ignore' });
      console.log('[Electron] Successfully cleaned up GGUF server processes.');
    }
  } catch (e) {
    // silently catch if no active model process is running
  }
});
