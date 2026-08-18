import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { fetchQuota } from '@src/infrastructure/api/usageClient';

export interface TokenUsage {
  used: number;
  total: number;
  remaining: number;
  usedUSD?: number;
  totalUSD?: number;
}

export interface ProviderFeedback {
  thumbsUp: number;
  thumbsDown: number;
}

interface TokenUsageContextType {
  usage: Record<string, TokenUsage>; // key is provider
  feedback: Record<string, ProviderFeedback>;
  updateUsage: (provider: string, tokens: number) => void;
  resetUsage: (provider: string) => void;
  setQuota: (provider: string, total: number) => void;
  refreshProviderQuota: (provider: string, apiKey?: string) => Promise<void>;
  recordFeedback: (provider: string, type: 'up' | 'down') => void;
}

const DEFAULT_QUOTAS: Record<string, number> = {
  gemini: 5000000,
};

const TokenUsageContext = createContext<TokenUsageContextType | undefined>(undefined);

export const TokenUsageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [usage, setUsage] = useState<Record<string, TokenUsage>>(() => {
    const saved = localStorage.getItem('llm_ref_token_usage');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e: any) {
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

  const [feedback, setFeedback] = useState<Record<string, ProviderFeedback>>(() => {
    const saved = localStorage.getItem('llm_ref_provider_feedback');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e: any) {
        console.error('Failed to parse provider feedback', e);
      }
    }
    return {};
  });

  useEffect(() => {
    localStorage.setItem('llm_ref_token_usage', JSON.stringify(usage));
  }, [usage]);

  useEffect(() => {
    localStorage.setItem('llm_ref_provider_feedback', JSON.stringify(feedback));
  }, [feedback]);

  const recordFeedback = useCallback((provider: string, type: 'up' | 'down') => {
    setFeedback((prev) => {
      const current = prev[provider] || { thumbsUp: 0, thumbsDown: 0 };
      const updated = {
        ...current,
        thumbsUp: type === 'up' ? current.thumbsUp + 1 : current.thumbsUp,
        thumbsDown: type === 'down' ? current.thumbsDown + 1 : current.thumbsDown,
      };
      return { ...prev, [provider]: updated };
    });
  }, []);

  const updateUsage = useCallback((provider: string, tokens: number) => {
    // Defer update to avoid "Cannot update a component while rendering" warning
    setTimeout(() => {
      setUsage((prev) => {
        const current = prev[provider] || {
          used: 0,
          total: DEFAULT_QUOTAS[provider] || 1000000,
          remaining: DEFAULT_QUOTAS[provider] || 1000000,
        };
        const newUsed = current.used + tokens;
        return {
          ...prev,
          [provider]: {
            ...current,
            used: newUsed,
            remaining: Math.max(0, current.total - newUsed),
          },
        };
      });
    }, 0);
  }, []);

  const resetUsage = useCallback((provider: string) => {
    setUsage((prev) => {
      const current = prev[provider];
      if (!current) return prev;
      return {
        ...prev,
        [provider]: { ...current, used: 0, remaining: current.total },
      };
    });
  }, []);

  const setQuota = useCallback((provider: string, total: number) => {
    setUsage((prev) => {
      const current = prev[provider] || { used: 0, total, remaining: total };
      return {
        ...prev,
        [provider]: { ...current, total, remaining: Math.max(0, total - current.used) },
      };
    });
  }, []);

  const refreshProviderQuota = useCallback(async (provider: string, apiKey?: string) => {
    const { total, used, totalUSD, usedUSD } = await fetchQuota(provider, apiKey);
    if (total !== null && used !== null && total > 0) {
      setUsage((prev) => {
        return {
          ...prev,
          [provider]: { total, used, remaining: Math.max(0, total - used), totalUSD, usedUSD },
        };
      });
    }
  }, []);

  const value = React.useMemo(
    () => ({ usage, feedback, updateUsage, resetUsage, setQuota, refreshProviderQuota, recordFeedback }),
    [usage, feedback, updateUsage, resetUsage, setQuota, refreshProviderQuota, recordFeedback]
  );

  return (
    <TokenUsageContext.Provider value={value}>
      {children}
    </TokenUsageContext.Provider>
  );
};

export const useTokenUsage = () => {
  const context = useContext(TokenUsageContext);
  if (!context) throw new Error('useTokenUsage must be used within a TokenUsageProvider');
  return context;
};
