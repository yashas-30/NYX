import logger from './logger.js';
import path from 'path';
import os from 'os';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { env } from '../config/env.js';

// Check if running in production mode or packaged native app
export const isProd = env.NODE_ENV === 'production' || env.IS_PACKAGED;

// Helper to locate the project workspace root in development
// fallow-ignore-next-line code-duplication
function findProjectRoot(): string {
  if (env.NYX_WORKSPACE_ROOT) {
    return path.resolve(env.NYX_WORKSPACE_ROOT);
  }
  let dir =
    typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));
  for (let i = 0; i < 5; i++) {
    if (fs.existsSync(path.join(dir, 'package.json'))) {
      return dir;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return process.cwd();
}

// Base user data directory for NYX application state
export const APP_STATE_DIR = isProd
  ? path.join(os.homedir(), '.nyx')
  : path.join(findProjectRoot(), '.nyx-state');

// Specific sub-folders for keys, logs, models, and cache
export const VAULT_DIR = path.join(APP_STATE_DIR, '.nyx-keys');
export const LOGS_DIR = path.join(APP_STATE_DIR, '.nyx-logs');
export const MODELS_DIR = path.join(APP_STATE_DIR, '.nyx-models');
export const CACHE_DIR = path.join(APP_STATE_DIR, '.nyx-cache');
export const DB_FILE = path.join(APP_STATE_DIR, 'nyx.db');

function isSpawnable(cmd: string): boolean {
  try {
    const res = spawnSync(cmd, ['--version'], { timeout: 1000 });
    return !res.error;
  } catch {
    return false;
  }
}

/**
 * Locate the correct Python interpreter on the system.
 */
export function findPythonPath(): string {
  const defaultCommand = process.platform === 'win32' ? 'python' : 'python3';
  const candidates = [
    env.NYX_PYTHON_PATH,
    ...(process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']),
    path.join(os.homedir(), '.conda', 'envs', 'nyx', 'bin', 'python'),
    path.join(os.homedir(), 'miniconda3', 'envs', 'nyx', 'bin', 'python'),
    path.join(os.homedir(), '.conda', 'envs', 'nyx', 'python.exe'),
    path.join(os.homedir(), 'miniconda3', 'envs', 'nyx', 'python.exe'),
    path.join(os.homedir(), 'anaconda3', 'envs', 'nyx', 'python.exe'),
  ];

  const vscodeSettingsPath = path.join(findProjectRoot(), '.vscode', 'settings.json');
  if (fs.existsSync(vscodeSettingsPath)) {
    try {
      const vscodeSettings = JSON.parse(fs.readFileSync(vscodeSettingsPath, 'utf-8'));
      if (vscodeSettings['python.defaultInterpreterPath']) {
        candidates.unshift(vscodeSettings['python.defaultInterpreterPath']);
      }
    } catch {
      // Ignore settings parsing errors
    }
  }

  for (const c of candidates) {
    if (!c) continue;
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) {
        return c;
      }
    } else {
      if (isSpawnable(c)) {
        return c;
      }
    }
  }

  return defaultCommand;
}

// Ensure directories exist
const dirs = [APP_STATE_DIR, VAULT_DIR, LOGS_DIR, MODELS_DIR, CACHE_DIR];
dirs.forEach((dir) => {
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (e: any) {
      logger.error(`[Paths] Failed to create directory: ${dir}`, e);
    }
  }
});

// Workspace folder management
const CONFIG_FILE = path.join(APP_STATE_DIR, 'config.json');
let workspaceRoot = process.cwd();

/**
 * Load the saved workspace path from config.json
 */
export function loadWorkspaceRoot() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const config = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
      if (config.workspaceRoot && fs.existsSync(config.workspaceRoot)) {
        workspaceRoot = path.resolve(config.workspaceRoot);
        logger.info(`[Paths] Loaded workspace root: ${workspaceRoot}`);
      }
    }
  } catch (e: any) {
    logger.error('[Paths] Failed to load workspace config:', e);
  }
}

/**
 * Set and persist a new workspace path
 */
export function setWorkspaceRoot(newRoot: string): boolean {
  try {
    const resolved = path.resolve(newRoot);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      workspaceRoot = resolved;
      const config = fs.existsSync(CONFIG_FILE)
        ? JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'))
        : {};
      config.workspaceRoot = workspaceRoot;
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
      logger.info(`[Paths] Workspace root updated and saved: ${workspaceRoot}`);
      return true;
    }
  } catch (e: any) {
    logger.error(`[Paths] Failed to set workspace root to ${newRoot}:`, e);
  }
  return false;
}

/**
 * Get active workspace path
 */
export function getWorkspaceRoot(): string {
  return workspaceRoot;
}

// Load workspace at startup
loadWorkspaceRoot();
