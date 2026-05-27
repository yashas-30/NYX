"use strict";
const electron = require("electron");
const child_process = require("child_process");
const path = require("path");
const net = require("net");
const Store = require("electron-store");
const windowStateKeeper = require("electron-window-state");
const Sentry = require("@sentry/electron/main");
const electronUpdater = require("electron-updater");
const fs = require("fs");
const zod = require("zod");
const os = require("os");
function _interopNamespaceDefault(e) {
  const n = Object.create(null, { [Symbol.toStringTag]: { value: "Module" } });
  if (e) {
    for (const k in e) {
      if (k !== "default") {
        const d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: () => e[k]
        });
      }
    }
  }
  n.default = e;
  return Object.freeze(n);
}
const path__namespace = /* @__PURE__ */ _interopNamespaceDefault(path);
const net__namespace = /* @__PURE__ */ _interopNamespaceDefault(net);
const Sentry__namespace = /* @__PURE__ */ _interopNamespaceDefault(Sentry);
const fs__namespace = /* @__PURE__ */ _interopNamespaceDefault(fs);
const os__namespace = /* @__PURE__ */ _interopNamespaceDefault(os);
function registerDialogHandlers(window) {
  electron.ipcMain.handle("dialog:open-directory", async () => {
    try {
      const result = await electron.dialog.showOpenDialog(window, {
        properties: ["openDirectory"],
        title: "Select Active Codebase Workspace"
      });
      return { success: true, data: result.canceled ? null : result.filePaths[0] };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
const StoreKeySchema = zod.z.object({ provider: zod.z.string().min(1), key: zod.z.string().min(1) });
const GetKeySchema = zod.z.object({ provider: zod.z.string().min(1) });
const DeleteKeySchema = zod.z.object({ provider: zod.z.string().min(1) });
const VAULT_FILE_PATH = path__namespace.join(electron.app.getPath("userData"), "secure-vault.json");
function checkEncryptionSafety() {
  if (!electron.safeStorage.isEncryptionAvailable()) {
    const choice = electron.dialog.showMessageBoxSync({
      type: "error",
      title: "Keychain Access Required",
      message: "NYX needs access to your system keychain to securely store API keys.",
      buttons: ["Open System Settings", "Quit App"],
      defaultId: 1,
      cancelId: 1
    });
    if (choice === 0) {
      if (process.platform === "win32") {
        require("electron").shell.openExternal("ms-settings:privacy-credentialmanager");
      } else if (process.platform === "darwin") {
        require("electron").shell.openExternal("x-apple.systempreferences:com.apple.preference.security");
      }
    }
    electron.app.quit();
    process.exit(1);
    return false;
  }
  return true;
}
function loadVault() {
  try {
    if (fs__namespace.existsSync(VAULT_FILE_PATH)) {
      return JSON.parse(fs__namespace.readFileSync(VAULT_FILE_PATH, "utf8"));
    }
  } catch (err) {
    console.error("Failed to read vault file:", err);
  }
  return {};
}
function saveVault(data) {
  try {
    fs__namespace.writeFileSync(VAULT_FILE_PATH, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error("Failed to write vault file:", err);
  }
}
function registerVaultHandlers() {
  electron.ipcMain.handle("vault:store-key", async (_event, raw) => {
    checkEncryptionSafety();
    try {
      const { provider, key } = StoreKeySchema.parse(raw);
      const encryptedBuffer = electron.safeStorage.encryptString(key);
      const encryptedHex = encryptedBuffer.toString("hex");
      const vault = loadVault();
      vault[provider] = encryptedHex;
      saveVault(vault);
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("vault:get-key", async (_event, raw) => {
    checkEncryptionSafety();
    try {
      const { provider } = GetKeySchema.parse(raw);
      const vault = loadVault();
      const encryptedHex = vault[provider];
      if (!encryptedHex) {
        return { success: true, data: null };
      }
      const encryptedBuffer = Buffer.from(encryptedHex, "hex");
      const decrypted = electron.safeStorage.decryptString(encryptedBuffer);
      return { success: true, data: decrypted };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("vault:delete-key", async (_event, raw) => {
    checkEncryptionSafety();
    try {
      const { provider } = DeleteKeySchema.parse(raw);
      const vault = loadVault();
      if (vault[provider]) {
        delete vault[provider];
        saveVault(vault);
      }
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("vault:list-keys", async () => {
    checkEncryptionSafety();
    try {
      const vault = loadVault();
      return { success: true, data: Object.keys(vault) };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
function registerWindowHandlers(window) {
  electron.ipcMain.handle("window:minimize", async () => {
    try {
      window.minimize();
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("window:maximize", async () => {
    try {
      if (window.isMaximized()) {
        window.unmaximize();
      } else {
        window.maximize();
      }
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("window:close", async () => {
    try {
      window.close();
      return { success: true, data: null };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
function registerSystemHandlers() {
  electron.ipcMain.handle("system:gpu-info", async () => {
    try {
      const info = await electron.app.getGPUInfo("basic");
      return { success: true, data: info };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("system:info", async () => {
    try {
      const info = {
        platform: os__namespace.platform(),
        arch: os__namespace.arch(),
        cpus: os__namespace.cpus().length,
        totalmem: os__namespace.totalmem(),
        freemem: os__namespace.freemem(),
        versions: {
          node: process.versions.node,
          chrome: process.versions.chrome,
          electron: process.versions.electron,
          app: electron.app.getVersion()
        }
      };
      return { success: true, data: info };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
  electron.ipcMain.handle("system:get-userdata", async () => {
    try {
      return { success: true, data: electron.app.getPath("userData") };
    } catch (err) {
      return { success: false, error: err.message };
    }
  });
}
const StoreConstructor = typeof Store === "function" ? Store : Store.default;
const store = new StoreConstructor();
if (process.env.NYX_SENTRY_DSN) {
  Sentry__namespace.init({
    dsn: process.env.NYX_SENTRY_DSN,
    environment: electron.app.isPackaged ? "production" : "development",
    release: `nyx@${electron.app.getVersion()}`,
    beforeSend(event) {
      if (!store.get("telemetryEnabled", false)) return null;
      return event;
    }
  });
}
const isSingleInstance = electron.app.requestSingleInstanceLock();
if (!isSingleInstance) {
  electron.app.quit();
  process.exit(0);
}
let mainWindow = null;
let tray = null;
let serverManager = null;
function waitForPort(port, host = "127.0.0.1", timeout = 3e4) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();
    function check() {
      if (Date.now() - startTime > timeout) {
        reject(new Error(`Timeout waiting for port ${port}`));
        return;
      }
      const socket = new net__namespace.Socket();
      socket.setTimeout(200);
      socket.on("connect", () => {
        socket.destroy();
        resolve();
      });
      socket.on("timeout", () => {
        socket.destroy();
        setTimeout(check, 100);
      });
      socket.on("error", () => {
        socket.destroy();
        setTimeout(check, 100);
      });
      socket.connect(port, host);
    }
    check();
  });
}
function findFreePort(startPort) {
  return new Promise((resolve) => {
    const server = net__namespace.createServer();
    server.listen(startPort, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address !== null ? address.port : startPort;
      server.close(() => resolve(port));
    });
    server.on("error", () => {
      resolve(findFreePort(startPort + 1));
    });
  });
}
class ServerManager {
  constructor() {
    this.child = null;
    this.expressPort = 3e3;
    this.fastifyPort = 3001;
    this.restartAttempts = 0;
    this.restartDelay = 1e3;
    this.maxRestarts = 5;
    this.serverPath = "";
    this.isShuttingDown = false;
    this.stderrBuffer = [];
    let serverPath = path__namespace.join(electron.app.getAppPath(), "dist-server", "server.cjs");
    if (serverPath.includes("app.asar")) {
      serverPath = serverPath.replace("app.asar", "app.asar.unpacked");
    }
    this.serverPath = serverPath;
  }
  async start() {
    this.expressPort = await findFreePort(3e3);
    this.fastifyPort = await findFreePort(this.expressPort + 1);
    await this.spawn();
    return { expressPort: this.expressPort, fastifyPort: this.fastifyPort };
  }
  async spawn() {
    if (this.isShuttingDown) return;
    console.log(`[Electron] Spawning server process from: ${this.serverPath}`);
    this.stderrBuffer = [];
    const serverEnv = {
      ...process.env,
      PORT: String(this.expressPort),
      FASTIFY_PORT: String(this.fastifyPort),
      NODE_ENV: electron.app.isPackaged ? "production" : "development"
    };
    if (electron.app.isPackaged) {
      serverEnv.NODE_PATH = path__namespace.join(electron.app.getAppPath().replace("app.asar", "app.asar.unpacked"), "node_modules");
    }
    this.child = child_process.fork(this.serverPath, [], {
      env: serverEnv,
      silent: true
      // pipe stdout/stderr manually
    });
    this.child.stdout?.on("data", (data) => {
      process.stdout.write(`[Server] ${data.toString()}`);
    });
    this.child.stderr?.on("data", (data) => {
      const msg = data.toString();
      process.stderr.write(`[Server ERROR] ${msg}`);
      this.stderrBuffer.push(msg);
      if (this.stderrBuffer.length > 25) {
        this.stderrBuffer.shift();
      }
    });
    this.child.on("exit", (code, signal) => {
      console.log(`[Electron] Server exited with code ${code}, signal ${signal}`);
      if (this.isShuttingDown) return;
      this.handleCrash();
    });
    await waitForPort(this.expressPort);
  }
  handleCrash() {
    if (this.restartAttempts >= this.maxRestarts) {
      const errorDetails = this.stderrBuffer.join("") || "No error details recorded.";
      electron.dialog.showErrorBox(
        "Fatal Server Crash",
        `The NYX local server has repeatedly crashed. The application will now terminate.

Error details:
${errorDetails}`
      );
      electron.app.quit();
      return;
    }
    this.restartAttempts++;
    const delay = this.restartDelay;
    this.restartDelay *= 2;
    console.warn(`[Electron] Server crashed. Restarting in ${delay}ms... (Attempt ${this.restartAttempts}/${this.maxRestarts})`);
    setTimeout(() => {
      this.spawn().catch((err) => {
        console.error("[Electron] Failed to restart server:", err);
      });
    }, delay);
  }
  async shutdown() {
    this.isShuttingDown = true;
    if (this.child) {
      console.log("[Electron] Shutting down Node.js server child fork...");
      this.child.kill("SIGTERM");
      await new Promise((resolve) => {
        const timeout = setTimeout(() => {
          console.warn("[Electron] Server child fork failed to exit gracefully. Force killing...");
          this.child?.kill("SIGKILL");
          resolve();
        }, 1e4);
        this.child?.on("exit", () => {
          clearTimeout(timeout);
          resolve();
        });
      });
    }
    try {
      const { execSync } = require("child_process");
      if (process.platform === "win32") {
        execSync("taskkill /f /im llama-server.exe", { stdio: "ignore" });
        console.log("[Electron] Force cleaned up local GGUF llama-server.");
      } else {
        execSync("killall -9 llama-server", { stdio: "ignore" });
        console.log("[Electron] Force cleaned up macOS/Linux GGUF llama-server.");
      }
    } catch {
    }
  }
}
async function bootApp() {
  electron.app.on("second-instance", () => {
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
  const isDev = !electron.app.isPackaged;
  const iconExt = process.platform === "win32" ? "ico" : "png";
  const iconName = `nyx-icon.${iconExt}`;
  const iconPath = isDev ? path__namespace.join(__dirname, "../public", iconName) : path__namespace.join(__dirname, "../dist", iconName);
  return electron.nativeImage.createFromPath(iconPath);
}
function createWindow(expressPort) {
  const mainWindowState = windowStateKeeper({
    defaultWidth: 1440,
    defaultHeight: 900
  });
  const preloadPath = path__namespace.join(__dirname, "preload.cjs");
  console.log(`[Electron] Loading preload script from: ${preloadPath}`);
  mainWindow = new electron.BrowserWindow({
    x: mainWindowState.x,
    y: mainWindowState.y,
    width: mainWindowState.width,
    height: mainWindowState.height,
    title: "NYX - Native Local Intelligence & Cloud Orchestration Platform",
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      preload: preloadPath
    },
    icon: getAppIcon()
  });
  mainWindowState.manage(mainWindow);
  electron.session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    const isDev = !electron.app.isPackaged;
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
    `.replace(/\s+/g, " ").trim();
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        "Content-Security-Policy": [csp]
      }
    });
  });
  const targetUrl = `http://localhost:${expressPort}`;
  console.log(`[Electron] Loading browser window at: ${targetUrl}`);
  mainWindow.loadURL(targetUrl);
  mainWindow.once("ready-to-show", () => {
    mainWindow?.show();
  });
  mainWindow.webContents.setWindowOpenHandler((details) => {
    electron.shell.openExternal(details.url);
    return { action: "deny" };
  });
  mainWindow.on("closed", () => {
    mainWindow = null;
  });
  registerDialogHandlers(mainWindow);
  registerVaultHandlers();
  registerWindowHandlers(mainWindow);
  registerSystemHandlers();
}
function createTray() {
  tray = new electron.Tray(getAppIcon());
  const contextMenu = electron.Menu.buildFromTemplate([
    {
      label: "Show NYX",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
      }
    },
    {
      label: "Quick Prompt",
      click: () => {
        mainWindow?.show();
        mainWindow?.focus();
        mainWindow?.webContents.send("navigate", "/coder");
      }
    },
    {
      label: "GPU Status: Active",
      enabled: false
    },
    { type: "separator" },
    {
      label: "Check for Updates...",
      click: () => {
        electronUpdater.autoUpdater.checkForUpdatesAndNotify();
      }
    },
    {
      label: "Quit NYX",
      click: () => {
        electron.app.quit();
      }
    }
  ]);
  tray.setToolTip("NYX Platform");
  tray.setContextMenu(contextMenu);
}
function createMenus() {
  const template = [
    {
      label: "File",
      submenu: [
        {
          label: "Open Workspace",
          accelerator: "CmdOrCtrl+O",
          click: () => {
            mainWindow?.webContents.send("navigate", "/settings");
          }
        },
        {
          label: "Settings",
          accelerator: "CmdOrCtrl+,",
          click: () => {
            mainWindow?.webContents.send("navigate", "/settings");
          }
        },
        { type: "separator" },
        { role: "quit" }
      ]
    },
    {
      label: "Model",
      submenu: [
        {
          label: "Registry",
          accelerator: "CmdOrCtrl+M",
          click: () => {
            mainWindow?.webContents.send("navigate", "/settings");
          }
        },
        {
          label: "Unload Current Model",
          click: () => {
            mainWindow?.webContents.send("model:unload");
          }
        }
      ]
    },
    {
      label: "View",
      submenu: [
        { role: "reload" },
        { role: "forceReload" },
        { role: "toggleDevTools" },
        { type: "separator" },
        { role: "resetZoom" },
        { role: "zoomIn" },
        { role: "zoomOut" }
      ]
    },
    {
      label: "Help",
      submenu: [
        {
          label: "Documentation",
          click: async () => {
            await electron.shell.openExternal("https://github.com/yashas-30/NYX");
          }
        },
        {
          label: "Report Issue",
          click: async () => {
            await electron.shell.openExternal("https://github.com/yashas-30/NYX/issues");
          }
        },
        { role: "about" }
      ]
    }
  ];
  electron.Menu.setApplicationMenu(electron.Menu.buildFromTemplate(template));
}
function setupAutoUpdater() {
  electronUpdater.autoUpdater.checkForUpdatesAndNotify();
  setInterval(() => {
    electronUpdater.autoUpdater.checkForUpdatesAndNotify();
  }, 4 * 60 * 60 * 1e3);
  electronUpdater.autoUpdater.on("update-available", (info) => {
    if (mainWindow) {
      electron.dialog.showMessageBox(mainWindow, {
        type: "info",
        title: "Update Available",
        message: `NYX version ${info.version} is available and downloading in the background.`,
        buttons: ["OK"]
      });
    }
  });
  electronUpdater.autoUpdater.on("update-downloaded", (info) => {
    if (mainWindow) {
      electron.dialog.showMessageBox(mainWindow, {
        type: "question",
        title: "Update Ready",
        message: `NYX version ${info.version} has finished downloading. Restart now to apply?`,
        buttons: ["Restart Now", "Later"],
        defaultId: 0,
        cancelId: 1
      }).then((res) => {
        if (res.response === 0) {
          electronUpdater.autoUpdater.quitAndInstall();
        }
      });
    }
  });
}
electron.app.on("ready", bootApp);
electron.app.on("window-all-closed", () => {
  electron.app.quit();
});
electron.app.on("before-quit", async (e) => {
  if (serverManager) {
    e.preventDefault();
    await serverManager.shutdown();
    electron.app.exit(0);
  }
});
