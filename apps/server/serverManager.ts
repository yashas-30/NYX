import fs from 'fs/promises';
import { readFileSync, unlinkSync, existsSync } from 'fs';
import path from 'path';
import { spawn, ChildProcess } from 'child_process';
import crypto from 'crypto';
import http from 'http';

interface ServerInfo {
  pid: number;
  socketPath?: string;
  port?: number;
  startedAt: string;
  apiVersion: string;
  projectHash: string;
  configHash: string;
}

const SERVER_API_VERSION = "1.2.0";
const WORKSPACE_DIR = path.resolve(process.cwd(), '../..'); // Root of turbo workspace if run from apps/server
const NYX_DIR = path.join(WORKSPACE_DIR, '.nyx');
const PID_FILE = path.join(NYX_DIR, 'server.json');

function generateHash(data: string): string {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export async function startDevApp(config: any = {}) {
  await fs.mkdir(NYX_DIR, { recursive: true });
  
  const projectHash = generateHash(WORKSPACE_DIR);
  const configHash = generateHash(JSON.stringify(config));
  
  let serverInfo = await discoverExistingServer();

  if (serverInfo) {
    const isHealthy = await isServerHealthy(serverInfo);
    const isCompatible = verifyCompatibility(serverInfo, projectHash, configHash);

    if (isHealthy && isCompatible) {
      console.log('✅ Discovered existing compatible dev server. Reconnecting...');
      setupParentLifecycleHandlers(null, serverInfo);
      return;
    } else {
      console.log('⚠️ Existing server is stale or incompatible. Cleaning up...');
      await cleanupStaleServer(serverInfo);
    }
  }

  console.log('🚀 Spawning new dev server...');
  serverInfo = await spawnNewServer(projectHash, configHash);
  await registerServer(serverInfo);
}

async function discoverExistingServer(): Promise<ServerInfo | null> {
  try {
    const data = await fs.readFile(PID_FILE, 'utf-8');
    const serverInfo: ServerInfo = JSON.parse(data);
    
    try {
      process.kill(serverInfo.pid, 0);
      return serverInfo;
    } catch (e) {
      return null;
    }
  } catch (e) {
    return null;
  }
}

function isServerHealthy(info: ServerInfo): Promise<boolean> {
  return new Promise((resolve) => {
    const options: http.RequestOptions = {
      path: '/api/v1/health', // Use existing health endpoint or a custom one
      method: 'GET',
      timeout: 2000,
    };
    
    if (info.socketPath) {
      options.socketPath = info.socketPath;
    } else if (info.port) {
      options.host = '127.0.0.1';
      options.port = info.port;
    }

    const req = http.request(options, (res) => {
      resolve(res.statusCode === 200);
    });

    req.on('error', () => resolve(false));
    req.on('timeout', () => {
      req.destroy();
      resolve(false);
    });
    req.end();
  });
}

function verifyCompatibility(info: ServerInfo, projectHash: string, configHash: string): boolean {
  if (info.apiVersion !== SERVER_API_VERSION) return false;
  if (info.projectHash !== projectHash) return false;
  // Config hash mismatch could just trigger a reload, but for simplicity we spawn a new one
  if (info.configHash !== configHash) return false;
  return true;
}

async function cleanupStaleServer(info: ServerInfo) {
  try {
    process.kill(info.pid, 'SIGTERM');
    await new Promise(res => setTimeout(res, 1000));
    try {
      process.kill(info.pid, 'SIGKILL');
    } catch (e) {}
  } catch (e) {}

  try { await fs.unlink(PID_FILE); } catch(e) {}
  if (info.socketPath) {
    try { await fs.unlink(info.socketPath); } catch(e) {}
  }
}

async function spawnNewServer(projectHash: string, configHash: string): Promise<ServerInfo> {
  // To avoid Vite Windows Proxy issues with pipes, we can allocate a dynamic port or use 3010
  const port = 3001; 

  const command = process.platform === 'win32' ? 'npx' : 'npx';
  const serverProcess = spawn(command, [
    'tsx', 'watch', '--ignore', '../web/**', 'server.ts'
  ], {
    shell: process.platform === 'win32',
    detached: false, 
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'development',
      NODE_OPTIONS: '--max-old-space-size=2048',
      NYX_PARENT_PID: process.pid.toString(),
      NYX_MANAGED_PORT: port.toString()
    }
  });

  serverProcess.on('error', (err) => {
    console.error('❌ Failed to spawn server:', err);
    process.exit(1);
  });

  serverProcess.on('exit', (code, signal) => {
    if (code !== 0) {
      console.error(`❌ Server exited with code ${code}, signal ${signal}`);
    }
  });

  const serverInfo: ServerInfo = {
    pid: serverProcess.pid!,
    port,
    startedAt: new Date().toISOString(),
    apiVersion: SERVER_API_VERSION,
    projectHash,
    configHash
  };

  let bound = false;
  for (let i = 0; i < 120; i++) { // Wait up to 60s — tsx + heavy imports take time
    if (await isServerHealthy(serverInfo)) {
      bound = true;
      break;
    }
    await new Promise(r => setTimeout(r, 500));
  }

  if (!bound) {
    console.warn('⚠️ Server health check timed out, but proceeding anyway.');
  }

  setupParentLifecycleHandlers(serverProcess, serverInfo);
  return serverInfo;
}

async function registerServer(info: ServerInfo) {
  await fs.writeFile(PID_FILE, JSON.stringify(info, null, 2));
}

function setupParentLifecycleHandlers(serverProcess: ChildProcess | null, info: ServerInfo) {
  const cleanup = () => {
    console.log('\nManager shutting down, sending shutdown signal to server...');
    try {
      if (serverProcess) {
        serverProcess.kill('SIGTERM');
      }
      if (existsSync(PID_FILE)) {
        unlinkSync(PID_FILE); 
      }
    } catch (e) {}
  };

  process.on('exit', cleanup);
  process.on('SIGINT', () => { cleanup(); process.exit(0); });
  process.on('SIGTERM', () => { cleanup(); process.exit(0); });
}

const isMainModule = import.meta.url.startsWith('file:') && 
  (process.argv[1] === new URL(import.meta.url).pathname || process.platform === 'win32');

if (isMainModule) {
  startDevApp().catch(err => {
    console.error(err);
    process.exit(1);
  });
}
