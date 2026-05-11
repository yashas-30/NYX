import { Dispatch, SetStateAction } from 'react';
import { toast } from 'sonner';

export type PinModalState = {
  open: boolean;
  targetKey: string | null;
  mode: 'verify' | 'set';
  value: string;
};

export const handlePinInput = (
  digit: string,
  pinModal: PinModalState,
  setPinModal: Dispatch<SetStateAction<PinModalState>>,
  unlockedKeys: Set<string>,
  setUnlockedKeys: Dispatch<SetStateAction<Set<string>>>,
  securityPin: string | null,
  setSecurityPin: Dispatch<SetStateAction<string | null>>
) => {
  setPinModal((prev) => {
    const newValue = (prev.value + digit).slice(0, 6);

    if (newValue.length === 6) {
      if (prev.mode === 'set') {
        setSecurityPin(newValue);
        localStorage.setItem('llm_ref_security_pin', newValue);
        if (prev.targetKey) setUnlockedKeys(new Set([...unlockedKeys, prev.targetKey]));
        toast.success('Security PIN established');
        return { ...prev, open: false, value: '' };
      }

      if (newValue === securityPin) {
        if (prev.targetKey) setUnlockedKeys(new Set([...unlockedKeys, prev.targetKey]));
        toast.success('Field unlocked');
        return { ...prev, open: false, value: '' };
      }

      toast.error('Incorrect PIN');
      return { ...prev, value: '' };
    }

    return { ...prev, value: newValue };
  });
};

export const updateApiKey = (
  setApiKeys: Dispatch<SetStateAction<Record<string, string>>>,
  provider: string,
  key: string
) => {
  setApiKeys((prev) => ({ ...prev, [provider]: key }));
};

export const clearApiKeys = (setApiKeys: Dispatch<SetStateAction<Record<string, string>>>) => {
  setApiKeys({});
  localStorage.removeItem('llm_ref_api_keys');
  toast.success('All API keys removed from storage');
};

export const lockAllKeys = (setUnlockedKeys: Dispatch<SetStateAction<Set<string>>>) => {
  setUnlockedKeys(new Set());
};

export const toggleKeyLock = (
  provider: string,
  setUnlockedKeys: Dispatch<SetStateAction<Set<string>>>
) => {
  setUnlockedKeys((prev) => {
    const next = new Set(prev);
    if (next.has(provider)) {
      next.delete(provider);
    } else {
      next.add(provider);
    }
    return next;
  });
};
