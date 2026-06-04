import { useState, useCallback } from 'react';
import {
  updateApiKey as updateApiKeyHelper,
  clearApiKeys as clearApiKeysHelper,
} from '@src/shared/store/apiKeyHelpers';

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
};

export const useSecurityState = (
  initialKeys: Record<string, string>,
  onKeyUpdate?: (provider: string, key: string) => void
) => {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(initialKeys);
  const [gatewayUrls, setGatewayUrls] = useState<Record<string, string>>({});

  const updateApiKey = useCallback(
    (provider: string, key: string) => {
      updateApiKeyHelper(setApiKeys, provider, key)
        .then((success) => {
          if (success && onKeyUpdate) {
            onKeyUpdate(provider, key);
          }
        })
        .catch((err) => {
          console.error('[Vault] Failed to update API key:', err);
        });
    },
    [onKeyUpdate]
  );

  const clearApiKeys = useCallback(() => {
    clearApiKeysHelper(setApiKeys).catch((err) => {
      console.error('[Vault] Failed to clear API keys:', err);
    });
  }, []);

  const updateGatewayUrl = useCallback((provider: string, url: string) => {
    setGatewayUrls((prev) => ({ ...prev, [provider]: url }));
  }, []);

  const getGatewayUrl = useCallback(
    (provider: string): string => {
      return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
    },
    [gatewayUrls]
  );

  return {
    apiKeys,
    setApiKeys,
    gatewayUrls,
    getGatewayUrl,
    updateGatewayUrl,
    updateApiKey,
    clearApiKeys,
  };
};
