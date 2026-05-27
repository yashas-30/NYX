import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { LOGS_DIR } from '../../lib/paths.ts';
import chokidar from 'chokidar';
import logger from '../../lib/logger.ts';
import { timingSafeEqual } from 'crypto';

export const adminRouter = Router();

function safeCompare(a: string, b: string): boolean {
  try {
    const bufA = Buffer.from(a);
    const bufB = Buffer.from(b);
    if (bufA.length !== bufB.length) return false;
    return timingSafeEqual(bufA, bufB);
  } catch {
    return false;
  }
}

adminRouter.get('/logs', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(404).send('Not Found');
  }
  const clientKey = (req.headers['x-admin-key'] || req.query.adminKey) as string | undefined;
  if (!clientKey || !safeCompare(clientKey, adminKey)) {
    return res.status(401).json({ error: 'Unauthorized: Invalid admin key' });
  }

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  const dateStr = new Date().toISOString().slice(0, 10);
  const logPath = path.join(LOGS_DIR, `nyx-${dateStr}.log`);

  res.write(`event: connected\ndata: ${JSON.stringify({ status: 'connected', logPath })}\n\n`);

  let filePosition = 0;
  try {
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      filePosition = stats.size; // start streaming from current end
    }
  } catch {}

  const readNewLogs = () => {
    try {
      if (!fs.existsSync(logPath)) return;
      const stats = fs.statSync(logPath);
      if (stats.size > filePosition) {
        const fd = fs.openSync(logPath, 'r');
        const buffer = Buffer.alloc(stats.size - filePosition);
        fs.readSync(fd, buffer, 0, buffer.length, filePosition);
        fs.closeSync(fd);

        filePosition = stats.size;
        const newLines = buffer.toString('utf8').split('\n');
        for (const line of newLines) {
          const trimmed = line.trim();
          if (trimmed) {
            res.write(`event: log\ndata: ${trimmed}\n\n`);
          }
        }
      }
    } catch (err: any) {
      res.write(`event: error\ndata: ${JSON.stringify({ error: err.message })}\n\n`);
    }
  };

  let watcher: any = null;
  try {
    if (!fs.existsSync(LOGS_DIR)) {
      fs.mkdirSync(LOGS_DIR, { recursive: true });
    }
    watcher = chokidar.watch(logPath, {
      persistent: true,
      ignoreInitial: true,
      usePolling: false
    });
    watcher.on('change', () => {
      readNewLogs();
    });
  } catch (err: any) {
    logger.error({ err }, 'Failed to start chokidar watcher for logs');
  }

  req.on('close', () => {
    if (watcher) {
      watcher.close();
    }
  });
});
