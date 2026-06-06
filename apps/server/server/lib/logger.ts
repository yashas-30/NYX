// @ts-nocheck
import pino from 'pino';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { createStream } from 'rotating-file-stream';
import pretty from 'pino-pretty';
import { env } from '../config/env.js';
import { getRequestId } from './context.js';

// Inline computation of LOGS_DIR to avoid circular dependency with paths.ts
const _isProd = env.NODE_ENV === 'production' || env.IS_PACKAGED;

function _findProjectRoot(): string {
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

const _appStateDir = _isProd
  ? path.join(os.homedir(), '.nyx')
  : path.join(_findProjectRoot(), '.nyx-state');

const LOGS_DIR = path.join(_appStateDir, '.nyx-logs');
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Log rotation: Daily logs with 30-day retention
const rotatingStream = createStream((time, index) => {
  if (!time) return 'nyx.log';
  const d = time instanceof Date ? time : new Date(time);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `nyx-${year}-${month}-${day}.log`;
}, {
  interval: '1d',
  path: LOGS_DIR,
  maxFiles: 30,
});

const logLevel = (env.LOG_LEVEL as pino.Level) || 'info';

let logStream: pino.MultiStreamRes;
try {
  const streams: pino.StreamEntry[] = [];

  if (env.NODE_ENV === 'development') {
    const prettyStream = pretty({
      colorize: true,
      translateTime: 'yyyy-mm-dd HH:MM:ss.l',
      ignore: 'pid,hostname',
    });
    streams.push({ stream: prettyStream, level: logLevel });
  } else {
    streams.push({ stream: process.stdout, level: logLevel });
  }

  // File stream (JSON formatted always)
  streams.push({ stream: rotatingStream, level: logLevel });

  logStream = pino.multistream(streams);
} catch {
  // Fallback: stdout only if log dir creation fails
  logStream = pino.multistream([{ stream: process.stdout, level: logLevel }]);
}

// Exported sanitizeLog function for explicit usage
export function sanitizeLog(obj: any): any {
  if (typeof obj === 'string') {
    return obj.replace(/key=([A-Za-z0-9_-]{20,})/g, 'key=***REDACTED***');
  }
  if (typeof obj === 'object' && obj !== null) {
    try {
      const str = JSON.stringify(obj);
      return JSON.parse(str.replace(/key=([A-Za-z0-9_-]{20,})/g, 'key=***REDACTED***'));
    } catch {
      return obj;
    }
  }
  return obj;
}

// Configure base pino logger
const logger = pino(
  {
    level: env.LOG_LEVEL || 'info',
    timestamp: () => `,"time":${Date.now()}`,
    formatters: {
      level: (label) => {
        return { level: label };
      },
    },
    mixin() {
      const requestId = getRequestId();
      return requestId ? { requestId } : {};
    },
    hooks: {
      logMethod(inputArgs, method) {
        // Redact deep string values and keys from all args
        const sanitizedArgs = inputArgs.map(arg => sanitizeLog(arg));
        return method.apply(this, sanitizedArgs);
      }
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
        'token',
      ],
      censor: '[REDACTED]',
    },
  },
  logStream
);

// Override console methods to use sanitizeLog to prevent external libraries from leaking
const originalConsoleLog = console.log;
const originalConsoleError = console.error;
const originalConsoleWarn = console.warn;
const originalConsoleInfo = console.info;

console.log = (...args) => originalConsoleLog(...args.map(a => sanitizeLog(a)));
console.error = (...args) => originalConsoleError(...args.map(a => sanitizeLog(a)));
console.warn = (...args) => originalConsoleWarn(...args.map(a => sanitizeLog(a)));
console.info = (...args) => originalConsoleInfo(...args.map(a => sanitizeLog(a)));

// Child logger utility for creating context-aware sub-loggers
export function childLogger(contextName: string, extraData?: Record<string, any>) {
  return logger.child({ context: contextName, ...extraData });
}

export default logger;
