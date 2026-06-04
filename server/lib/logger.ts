import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

// Inline computation of LOGS_DIR to avoid circular dependency with paths.ts
const _isProd = process.env.NODE_ENV === 'production' || process.env.IS_PACKAGED === 'true';

// fallow-ignore-next-line code-duplication
function _findProjectRoot(): string {
  if (process.env.NYX_WORKSPACE_ROOT) {
    return path.resolve(process.env.NYX_WORKSPACE_ROOT);
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

const _appStateDir = _isProd
  ? path.join(os.homedir(), '.nyx')
  : path.join(_findProjectRoot(), '.nyx-state');

const LOGS_DIR = path.join(_appStateDir, '.nyx-logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Get daily log file path
const getLogFilePath = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `nyx-${dateStr}.log`);
};

// Use synchronous streams instead of pino.transport() worker threads.
// pino.transport() spawns workers that can't resolve module paths inside
// an esbuild bundle — pino.multistream() with fs streams works everywhere.
let logStream: pino.MultiStreamRes;
try {
  const fileStream = fs.createWriteStream(getLogFilePath(), { flags: 'a' });
  logStream = pino.multistream([
    { stream: fileStream, level: (process.env.LOG_LEVEL as pino.Level) || 'info' },
    { stream: process.stdout, level: (process.env.LOG_LEVEL as pino.Level) || 'info' },
  ]);
} catch {
  // Fallback: stdout only if log dir creation fails
  logStream = pino.multistream([{ stream: process.stdout, level: 'info' }]);
}

// Configure base pino logger
const logger: any = pino(
  {
    level: process.env.LOG_LEVEL || 'info',
    timestamp: () => `,"time":${Date.now()}`,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    redact: {
      paths: [
        'req.headers.authorization',
        'req.body.apiKey',
        'request.headers.authorization',
        'request.body.apiKey',
        'apiKey',
        'authorization',
        'secret',
        'password',
      ],
      censor: '[REDACTED]',
    },
  },
  logStream
);

export default logger;
