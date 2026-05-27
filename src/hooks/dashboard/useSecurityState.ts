import { useState, useCallback } from 'react';
import { 
  updateApiKey as updateApiKeyHelper,
  clearApiKeys as clearApiKeysHelper,
} from '@src/shared/state/apiKeyHelpers';

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  openrouter: 'https://openrouter.ai/api/v1',
  nvidia: 'https://integrate.api.nvidia.com/v1',
  opencode: 'https://opencode.ai/zen/v1',
  openai: 'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com',
  deepseek: 'https://api.deepseek.com/v1',
  groq: 'https://api.groq.com/openai/v1',
  mistral: 'https://api.mistral.ai/v1',
  together: 'https://api.together.ai/v1',
};

export const useSecurityState = (
  initialKeys: Record<string, string>, 
  onKeyUpdate?: (provider: string, key: string) => void
) => {
  const [apiKeys, setApiKeys] = useState<Record<string, string>>(initialKeys);
  const [gatewayUrls, setGatewayUrls] = useState<Record<string, string>>({});

  const updateApiKey = useCallback((provider: string, key: string) => {
    updateApiKeyHelper(setApiKeys, provider, key);
    if (onKeyUpdate) onKeyUpdate(provider, key);
  }, [onKeyUpdate]);

  const clearApiKeys = useCallback(() => {
    clearApiKeysHelper(setApiKeys);
  }, []);

  const updateGatewayUrl = useCallback((provider: string, url: string) => {
    setGatewayUrls(prev => ({ ...prev, [provider]: url }));
  }, []);

  const getGatewayUrl = useCallback((provider: string): string => {
    return gatewayUrls[provider] || DEFAULT_GATEWAY_URLS[provider] || '';
  }, [gatewayUrls]);

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

