import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import { LOGS_DIR } from '../lib/paths.ts';

export const adminRouter = Router();

adminRouter.get('/logs', (req, res) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    return res.status(404).send('Not Found');
  }
  const clientKey = req.headers['x-admin-key'] || req.query.adminKey;
  if (clientKey !== adminKey) {
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

  const interval = setInterval(() => {
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
  }, 1000);

  req.on('close', () => {
    clearInterval(interval);
  });
});
