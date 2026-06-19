import chokidar, { FSWatcher } from 'chokidar';
import { WebSocket } from 'ws';
import logger from '../../lib/logger.js';
import path from 'path';

export class WorkspaceWatcher {
  private static instance: WorkspaceWatcher;
  private watcher: FSWatcher | null = null;
  private clients: Set<WebSocket> = new Set();
  private currentPath: string | null = null;

  private constructor() {}

  public static getInstance(): WorkspaceWatcher {
    if (!WorkspaceWatcher.instance) {
      WorkspaceWatcher.instance = new WorkspaceWatcher();
    }
    return WorkspaceWatcher.instance;
  }

  public addClient(ws: WebSocket) {
    this.clients.add(ws);

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message.toString());
        if (data.action === 'watch' && data.path) {
          this.watch(data.path);
        }
      } catch (err) {
        logger.error({ err }, '[WorkspaceWatcher] Failed to parse message');
      }
    });

    ws.on('close', () => {
      this.clients.delete(ws);
    });
  }

  public watch(workspacePath: string) {
    if (this.currentPath === workspacePath) return;

    if (this.watcher) {
      this.watcher.close();
    }

    this.currentPath = workspacePath;
    this.watcher = chokidar.watch(workspacePath, {
      ignored: [/(^|[\/\\])\../, '**/node_modules/**', '**/dist/**', '**/build/**'],
      persistent: true,
      ignoreInitial: true,
    });

    this.watcher
      .on('add', (filePath: string) =>
        this.broadcast({ type: 'file_added', path: this.getRelative(filePath) })
      )
      .on('unlink', (filePath: string) =>
        this.broadcast({ type: 'file_removed', path: this.getRelative(filePath) })
      )
      .on('addDir', (dirPath: string) =>
        this.broadcast({ type: 'dir_added', path: this.getRelative(dirPath) })
      )
      .on('unlinkDir', (dirPath: string) =>
        this.broadcast({ type: 'dir_removed', path: this.getRelative(dirPath) })
      )
      .on('change', (filePath: string) =>
        this.broadcast({ type: 'file_changed', path: this.getRelative(filePath) })
      );

    logger.info(`[WorkspaceWatcher] Started watching: ${workspacePath}`);
  }

  private getRelative(fullPath: string): string {
    if (!this.currentPath) return fullPath;
    return path.relative(this.currentPath, fullPath).replace(/\\/g, '/');
  }

  private broadcast(payload: any) {
    const msg = JSON.stringify(payload);
    for (const client of this.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(msg);
      }
    }
  }

  public dispose() {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
    this.clients.clear();
  }
}

export const workspaceWatcher = WorkspaceWatcher.getInstance();
