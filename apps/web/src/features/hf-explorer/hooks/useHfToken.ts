// src/features/hf-explorer/hooks/useHfToken.ts
import { useState, useEffect, useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';

const STORAGE_KEY = 'hf_token_secure';

export function useHfToken() {
  const [token, setTokenState] = useState<string>(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) ?? '';
    } catch {
      return '';
    }
  });
  const [showToken, setShowToken] = useState(false);

  const setToken = useCallback((newToken: string) => {
    setTokenState(newToken);
    try {
      // Use sessionStorage instead of localStorage for better security
      // In production, use Tauri's secure storage plugin
      sessionStorage.setItem(STORAGE_KEY, newToken);
    } catch {
      // Storage not available
    }
    invoke('hf_set_token', { token: newToken }).catch(() => {});
  }, []);

  const clearToken = useCallback(() => {
    setToken('');
  }, [setToken]);

  return { token, setToken, showToken, setShowToken, clearToken };
}
