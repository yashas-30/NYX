import pino from 'pino';
import fs from 'fs';
import path from 'path';

const LOGS_DIR = path.join(process.cwd(), '.nyx-logs');

// Ensure log directory exists
if (!fs.existsSync(LOGS_DIR)) {
  fs.mkdirSync(LOGS_DIR, { recursive: true });
}

// Get daily log file path
const getLogFilePath = (): string => {
  const dateStr = new Date().toISOString().slice(0, 10);
  return path.join(LOGS_DIR, `nyx-${dateStr}.log`);
};

// Create custom formatter to output plain values
const transport = pino.transport({
  targets: [
    {
      target: 'pino/file',
      options: { destination: getLogFilePath(), append: true },
      level: process.env.LOG_LEVEL || 'info',
    },
    {
      target: 'pino/file', // Output plain NDJSON to console
      options: { destination: 1 }, // 1 is stdout
      level: process.env.LOG_LEVEL || 'info',
    }
  ]
});

// Configure base pino logger
const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  timestamp: () => `,"time":${Date.now()}`,
  formatters: {
    level: (label) => {
      return { level: label };
    }
  }
}, transport);

export default logger;
