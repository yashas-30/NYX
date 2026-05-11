import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { fetchQuota } from '../lib/api/usageClient';

export interface TokenUsage {
  used: number;
  total: number;
  remaining: number;
  usedUSD?: number;
  totalUSD?: number;
}

interface TokenUsageContextType {
  usage: Record<string, TokenUsage>; // key is provider
  updateUsage: (provider: string, tokens: number) => void;
  resetUsage: (provider: string) => void;
  setQuota: (provider: string, total: number) => void;
  refreshProviderQuota: (provider: string, apiKey: string) => Promise<void>;
}

const DEFAULT_QUOTAS: Record<string, number> = {
  gemini: 5000000,
  openrouter: 1000000,
  nvidia: 1000000,
  openai: 1000000,
  claude: 1000000,
  deepseek: 1000000,
  ollama: 10000000,
  lmstudio: 10000000,
  opencode: 1000000,
};

const TokenUsageContext = createContext<TokenUsageContextType | undefined>(undefined);

export const TokenUsageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usage, setUsage] = useState<Record<string, TokenUsage>>(() => {
    const saved = localStorage.getItem('llm_ref_token_usage');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse token usage', e);
      }
    }
    
    const initial: Record<string, TokenUsage> = {};
    Object.keys(DEFAULT_QUOTAS).forEach((provider) => {
      const total = DEFAULT_QUOTAS[provider];
      initial[provider] = { used: 0, total, remaining: total };
    });
    return initial;
  });

  useEffect(() => {
    localStorage.setItem('llm_ref_token_usage', JSON.stringify(usage));
  }, [usage]);

  const updateUsage = useCallback((provider: string, tokens: number) => {
    // Defer update to avoid "Cannot update a component while rendering" warning
    setTimeout(() => {
      setUsage(prev => {
        const current = prev[provider] || { 
          used: 0, 
          total: DEFAULT_QUOTAS[provider] || 1000000, 
          remaining: DEFAULT_QUOTAS[provider] || 1000000 
        };
        const newUsed = current.used + tokens;
        return {
          ...prev,
          [provider]: {
            ...current,
            used: newUsed,
            remaining: Math.max(0, current.total - newUsed)
          }
        };
      });
    }, 0);
  }, []);

  const resetUsage = useCallback((provider: string) => {
    setUsage(prev => {
      const current = prev[provider];
      if (!current) return prev;
      return {
        ...prev,
        [provider]: { ...current, used: 0, remaining: current.total }
      };
    });
  }, []);

  const setQuota = useCallback((provider: string, total: number) => {
    setUsage(prev => {
      const current = prev[provider] || { used: 0, total, remaining: total };
      return {
        ...prev,
        [provider]: { ...current, total, remaining: Math.max(0, total - current.used) }
      };
    });
  }, []);

  const refreshProviderQuota = useCallback(async (provider: string, apiKey: string) => {
    if (!apiKey) return;
    const { total, used, totalUSD, usedUSD } = await fetchQuota(provider, apiKey);
    if (total > 0) {
      setUsage(prev => {
        return {
          ...prev,
          [provider]: { total, used, remaining: Math.max(0, total - used), totalUSD, usedUSD }
        };
      });
    }
  }, []);

  return (
    <TokenUsageContext.Provider value={{ usage, updateUsage, resetUsage, setQuota, refreshProviderQuota }}>
      {children}
    </TokenUsageContext.Provider>
  );
};

export const useTokenUsage = () => {
  const context = useContext(TokenUsageContext);
  if (!context) throw new Error('useTokenUsage must be used within a TokenUsageProvider');
  return context;
};
