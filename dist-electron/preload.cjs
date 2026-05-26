"use strict";
const electron = require("electron");
const zod = require("zod");
const VALID_CHANNELS = [
  "dialog:open-directory",
  "vault:store-key",
  "vault:get-key",
  "vault:delete-key",
  "vault:list-keys",
  "window:minimize",
  "window:maximize",
  "window:close",
  "system:gpu-info",
  "system:info",
  "system:get-userdata"
];
const channelSchemas = {
  "vault:store-key": zod.z.tuple([
    zod.z.object({
      provider: zod.z.string().min(1).max(64),
      key: zod.z.string().min(1).max(512)
    })
  ]),
  "vault:get-key": zod.z.tuple([
    zod.z.object({ provider: zod.z.string().min(1).max(64) })
  ]),
  "vault:delete-key": zod.z.tuple([
    zod.z.object({ provider: zod.z.string().min(1).max(64) })
  ]),
  "vault:list-keys": zod.z.tuple([]),
  "dialog:open-directory": zod.z.tuple([]),
  "window:minimize": zod.z.tuple([]),
  "window:maximize": zod.z.tuple([]),
  "window:close": zod.z.tuple([]),
  "system:gpu-info": zod.z.tuple([]),
  "system:info": zod.z.tuple([]),
  "system:get-userdata": zod.z.tuple([])
};
function validateArgs(channel, args) {
  const schema = channelSchemas[channel];
  if (!schema) return;
  let cloned;
  try {
    cloned = structuredClone(args);
  } catch {
    cloned = JSON.parse(JSON.stringify(args));
  }
  const result = schema.safeParse(cloned);
  if (!result.success) {
    throw new Error(
      `IPC arg validation failed for channel "${channel}": ${result.error.issues.map((i) => i.message).join(", ")}`
    );
  }
}
const api = {
  platform: process.platform,
  versions: {
    node: process.versions.node,
    chrome: process.versions.chrome,
    electron: process.versions.electron
  },
  invoke: async (channel, ...args) => {
    if (!VALID_CHANNELS.includes(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    const validChannel = channel;
    validateArgs(validChannel, args);
    return electron.ipcRenderer.invoke(validChannel, ...structuredClone(args));
  },
  send: (channel, ...args) => {
    if (!VALID_CHANNELS.includes(channel)) {
      throw new Error(`Blocked IPC channel: ${channel}`);
    }
    const validChannel = channel;
    validateArgs(validChannel, args);
    electron.ipcRenderer.send(validChannel, ...structuredClone(args));
  },
  // Secure, high-level typed API methods for React
  getUserDataPath: async () => {
    const res = await electron.ipcRenderer.invoke("system:get-userdata");
    if (res.success) return res.data;
    throw new Error(res.error || "Failed to get userData path");
  },
  showOpenDirectory: async () => {
    const res = await electron.ipcRenderer.invoke("dialog:open-directory");
    if (res.success) return res.data;
    throw new Error(res.error || "Failed to select active workspace");
  },
  onNavigate: (callback) => {
    const handler = (_event, path) => {
      if (typeof path === "string") callback(path);
    };
    electron.ipcRenderer.on("navigate", handler);
    return () => {
      electron.ipcRenderer.removeListener("navigate", handler);
    };
  },
  onModelUnload: (callback) => {
    const handler = () => {
      callback();
    };
    electron.ipcRenderer.on("model:unload", handler);
    return () => {
      electron.ipcRenderer.removeListener("model:unload", handler);
    };
  }
};
electron.contextBridge.exposeInMainWorld("nyxIPC", api);
