import { Dispatch, SetStateAction } from 'react';
import { toast } from '@src/components/ui/sonner';

export const updateApiKey = (
  setApiKeys: Dispatch<SetStateAction<Record<string, string>>>,
  provider: string,
  key: string
): void => {
  setApiKeys((prev) => ({ ...prev, [provider]: key }));

  // Also store in Electron secure safeStorage keychain if available
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    (window as any).nyxIPC.invoke('vault:store-key', { provider, key })
      .then((res: any) => {
        if (!res.success) {
          toast.error(`Failed to secure key in system keychain: ${res.error}`);
        }
      })
      .catch((err: any) => {
        console.error('[Vault] Store key IPC failed:', err);
      });
  }
};

export const clearApiKeys = (setApiKeys: Dispatch<SetStateAction<Record<string, string>>>): void => {
  setApiKeys({});
  localStorage.removeItem('llm_ref_api_keys');

  // Also clear from Electron secure safeStorage keychain if available
  if (typeof window !== 'undefined' && (window as any).nyxIPC) {
    const ipc = (window as any).nyxIPC;
    ipc.invoke('vault:list-keys')
      .then((res: any) => {
        if (res.success && Array.isArray(res.data)) {
          for (const provider of res.data) {
            ipc.invoke('vault:delete-key', { provider }).catch(() => {});
          }
        }
      })
      .catch((err: any) => {
        console.error('[Vault] Clear keys IPC failed:', err);
      });
  }

  toast.success('All API keys removed from secure storage');
};
