/**
 * Centralized IPC module for Tauri communication.
 * This ensures the frontend doesn't crash if it runs in a standard browser
 * (e.g., during Vite dev mode) and avoids race conditions by directly dynamic
 * importing `@tauri-apps/api/core` instead of relying on brittle globals.
 */

/**
 * Safely invokes a Tauri backend command.
 * If not running in Tauri, it logs a warning and returns `null` or an empty default,
 * avoiding "Cannot read properties of undefined (reading 'invoke')" crashes.
 */
export const safeInvoke = async <T = any>(cmd: string, args?: any): Promise<T> => {
  const isTauriEnv =
    typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window || '_tauri' in window);

  if (!isTauriEnv) {
    console.warn(`[IPC Fallback] Ignored invoke('${cmd}') because Tauri is not available.`);
    return null as unknown as T;
  }

  try {
    const tauriCore = await import('@tauri-apps/api/core');
    if (!tauriCore || typeof tauriCore.invoke !== 'function') {
      console.warn(`[IPC Fallback] Tauri core loaded but missing invoke for '${cmd}'.`);
      return null as unknown as T;
    }
    return await tauriCore.invoke<T>(cmd, args);
  } catch (err: any) {
    console.error(`[IPC Error] Failed to execute '${cmd}':`, err);
    throw err;
  }
};

/**
 * Synchronous check if the environment is Tauri.
 */
export const isTauri = (): boolean => {
  return typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window || '__TAURI_IPC__' in window || '_tauri' in window);
};
