import { contextBridge, ipcRenderer } from 'electron';
import { z } from 'zod';

type Result<T> = { success: true; data: T } | { success: false; error: string };

const VALID_CHANNELS = [
  'dialog:open-directory',
  'vault:store-key',
  'vault:get-key',
  'vault:delete-key',
  'vault:list-keys',
  'window:minimize',
  'window:maximize',
  'window:close',
  'system:gpu-info',
  'system:info',
  'system:get-userdata'
] as const;

type ValidChannel = typeof VALID_CHANNELS[number];

// ─────────────────────────────────────────────────────────────────────────────
// Per-channel argument schemas
// ─────────────────────────────────────────────────────────────────────────────
const channelSchemas: Partial<Record<ValidChannel, z.ZodTypeAny>> = {
  'vault:store-key': z.tuple([
    z.object({
      provider: z.string().min(1).max(64),
      key: z.string().min(1).max(512)
    })
  ]),
  'vault:get-key': z.tuple([
    z.object({ provider: z.string().min(1).max(64) })
  ]),
  'vault:delete-key': z.tuple([
    z.object({ provider: z.string().min(1).max(64) })
  ]),
  'vault:list-keys': z.tuple([]),
  'dialog:open-directory': z.tuple([]),
  'window:minimize': z.tuple([]),
  'window:maximize': z.tuple([]),
  'window:close': z.tuple([]),
  'system:gpu-info': z.tuple([]),
  'system:info': z.tuple([]),
  'system:get-userdata': z.tuple([]),
};

function validateArgs(channel: ValidChannel, args: unknown[]): void {
  const schema = channelSchemas[channel];
  if (!schema) return; // No schema = pass through

  // Deep-clone args to strip any prototype pollution
  let cloned: unknown[];
  try {
    cloned = structuredClone(args);
  } catch {
    cloned = JSON.parse(JSON.stringify(args));
  }

  const result = schema.safeParse(cloned);
  if (!result.success) {
    throw new Error(
      `IPC arg validation failed for channel "${channel}": ${result.error.issues.map(i => i.message).join(', ')}`
    );
  }
}

const api = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron,
  },
  invoke: async (channel: string, ...args: unknown[]): Promise<Result<any>> => {
    if (!VALID_CHANNELS.includes(channel as ValidChannel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    const validChannel = channel as ValidChannel;
    // Validate and sanitize args before sending to main process
    validateArgs(validChannel, args);
    return ipcRenderer.invoke(validChannel, ...structuredClone(args));
  },
  send: (channel: string, ...args: unknown[]): void => {
    if (!VALID_CHANNELS.includes(channel as ValidChannel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    const validChannel = channel as ValidChannel;
    validateArgs(validChannel, args);
    ipcRenderer.send(validChannel, ...structuredClone(args));
  },
  // Secure, high-level typed API methods for React
  getUserDataPath: async (): Promise<string> => {
    const res = await ipcRenderer.invoke('system:get-userdata');
    if (res.success) return res.data;
    throw new Error(res.error || 'Failed to get userData path');
  },
  showOpenDirectory: async (): Promise<string | null> => {
    const res = await ipcRenderer.invoke('dialog:open-directory');
    if (res.success) return res.data;
    throw new Error(res.error || 'Failed to select active workspace');
  },
  onNavigate: (callback: (path: string) => void): (() => void) => {
    const handler = (_event: Electron.IpcRendererEvent, path: string) => {
      if (typeof path === 'string') callback(path);
    };
    ipcRenderer.on('navigate', handler);
    return () => {
      ipcRenderer.removeListener('navigate', handler);
    };
  },
  onModelUnload: (callback: () => void): (() => void) => {
    const handler = () => {
      callback();
    };
    ipcRenderer.on('model:unload', handler);
    return () => {
      ipcRenderer.removeListener('model:unload', handler);
    };
  },
};

contextBridge.exposeInMainWorld('nyxIPC', api);
export type NyxIPC = typeof api;
