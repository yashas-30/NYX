import { ipcMain, app } from 'electron';
import * as os from 'os';

type Result<T> = { success: true; data: T } | { success: false; error: string };

export function registerSystemHandlers(): void {
  ipcMain.handle('system:gpu-info', async (): Promise<Result<any>> => {
    try {
      const info = await app.getGPUInfo('basic');
      return { success: true, data: info };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('system:info', async (): Promise<Result<any>> => {
    try {
      const info = {
        platform: os.platform(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalmem: os.totalmem(),
        freemem: os.freemem(),
        versions: {
          node: process.versions.node,
          chrome: process.versions.chrome,
          electron: process.versions.electron,
          app: app.getVersion(),
        },
      };
      return { success: true, data: info };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });

  ipcMain.handle('system:get-userdata', async (): Promise<Result<string>> => {
    try {
      return { success: true, data: app.getPath('userData') };
    } catch (err) {
      return { success: false, error: (err as Error).message };
    }
  });
}
