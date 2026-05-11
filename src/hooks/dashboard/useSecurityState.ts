import { useState, useCallback } from 'react';
import { 
  handlePinInput as handlePinInputHelper,
  updateApiKey as updateApiKeyHelper,
  clearApiKeys as clearApiKeysHelper,
  lockAllKeys as lockAllKeysHelper,
  toggleKeyLock as toggleKeyLockHelper,
} from '@/src/lib/state/pinHelpers';

export const useSecurityState = (
  initialKeys: Record<string, string>, 
  initialPin: string | null,
  onKeyUpdate?: (provider: string, key: string) => void
) => {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(initialKeys);
  const [securityPin, setSecurityPin] = useState<string | null>(initialPin);
  const [unlockedKeys, setUnlockedKeys] = useState<Set<string>>(new Set());
  const [pinModal, setPinModal] = useState<{ open: boolean; targetKey: string | null; mode: 'verify' | 'set'; value: string }>({
    open: false, targetKey: null, mode: 'verify', value: ''
  });

  const handlePinInput = useCallback((digit: string) => {
    handlePinInputHelper(digit, pinModal, setPinModal, unlockedKeys, setUnlockedKeys, securityPin, setSecurityPin);
  }, [pinModal, unlockedKeys, securityPin]);

  const updateApiKey = useCallback((provider: string, key: string) => {
    updateApiKeyHelper(setApiKeys, provider, key);
    if (onKeyUpdate) onKeyUpdate(provider, key);
  }, [onKeyUpdate]);

  const clearApiKeys = useCallback(() => {
    clearApiKeysHelper(setApiKeys);
  }, []);

  const lockAllKeys = useCallback(() => {
    lockAllKeysHelper(setUnlockedKeys);
  }, []);

  const toggleKeyLock = useCallback((provider: string) => {
    toggleKeyLockHelper(provider, setUnlockedKeys);
  }, []);

  return {
    apiKeys,
    setApiKeys,
    securityPin,
    setSecurityPin,
    unlockedKeys,
    setUnlockedKeys,
    pinModal,
    setPinModal,
    handlePinInput,
    updateApiKey,
    clearApiKeys,
    lockAllKeys,
    toggleKeyLock
  };
};
