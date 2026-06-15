import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { ModelOption } from '@src/types';

export interface ModelUsage {
  rpmUsed: number;
  tpmUsed: number;
  rpdUsed: number;
}

export type LimitReason = 'ok' | 'rpm' | 'tpm' | 'rpd';

export interface UsageState {
  lastResetDate: string; // YYYY-MM-DD
  lastResetMinute: number; // Unix timestamp in minutes
  usage: Record<string, ModelUsage>; // key is `${modelId}_${apiKey || 'default'}`
  
  recordUsage: (modelId: string, apiKey: string | undefined, tokens: number) => void;
  checkLimit: (modelId: string, apiKey: string | undefined, limits?: ModelOption['limits']) => LimitReason;
  setLimitHit: (modelId: string, apiKey: string | undefined, reason: 'rpm' | 'tpm' | 'rpd', limits: ModelOption['limits']) => void;
  refreshLimits: () => void;
  resetLimitForModel: (modelId: string, apiKey: string | undefined) => void;
}

const getUsageKey = (modelId: string, apiKey: string | undefined) => {
  // Use a hash or just the key itself if it's short, but for simplicity and safety against long keys, we can just use the raw key since it's local storage
  return `${modelId}_${apiKey || 'default'}`;
};

export const useUsageStore = create<UsageState>()(
  persist(
    (set, get) => ({
      lastResetDate: new Date().toISOString().split('T')[0],
      lastResetMinute: Math.floor(Date.now() / 60000),
      usage: {},

      refreshLimits: () => {
        const now = new Date();
        const currentDate = now.toISOString().split('T')[0];
        const currentMinute = Math.floor(now.getTime() / 60000);
        
        set((state) => {
          let needsUpdate = false;
          const newUsage = { ...state.usage };

          const isNewDay = state.lastResetDate !== currentDate;
          const isNewMinute = state.lastResetMinute !== currentMinute;

          if (isNewDay) {
            for (const key in newUsage) {
              newUsage[key] = { rpmUsed: 0, tpmUsed: 0, rpdUsed: 0 };
            }
            needsUpdate = true;
          } else if (isNewMinute) {
            for (const key in newUsage) {
              newUsage[key] = { ...newUsage[key], rpmUsed: 0, tpmUsed: 0 };
            }
            needsUpdate = true;
          }

          if (needsUpdate) {
            return {
              lastResetDate: currentDate,
              lastResetMinute: currentMinute,
              usage: newUsage,
            };
          }
          return state;
        });
      },

      recordUsage: (modelId: string, apiKey: string | undefined, tokens: number) => {
        get().refreshLimits();
        set((state) => {
          const key = getUsageKey(modelId, apiKey);
          const currentUsage = state.usage[key] || { rpmUsed: 0, tpmUsed: 0, rpdUsed: 0 };
          return {
            usage: {
              ...state.usage,
              [key]: {
                rpmUsed: currentUsage.rpmUsed + 1,
                tpmUsed: currentUsage.tpmUsed + tokens,
                rpdUsed: currentUsage.rpdUsed + 1,
              },
            },
          };
        });
      },

      checkLimit: (modelId: string, apiKey: string | undefined, limits?: ModelOption['limits']): LimitReason => {
        get().refreshLimits();
        if (!limits) return 'ok';
        
        const key = getUsageKey(modelId, apiKey);
        const currentUsage = get().usage[key] || { rpmUsed: 0, tpmUsed: 0, rpdUsed: 0 };
        
        if (limits.rpm && currentUsage.rpmUsed >= limits.rpm) return 'rpm';
        if (limits.tpm !== null && limits.tpm !== undefined && currentUsage.tpmUsed >= limits.tpm) return 'tpm';
        if (limits.rpd && currentUsage.rpdUsed >= limits.rpd) return 'rpd';
        
        return 'ok';
      },

      setLimitHit: (modelId: string, apiKey: string | undefined, reason: 'rpm' | 'tpm' | 'rpd', limits: ModelOption['limits']) => {
        if (!limits) return;
        get().refreshLimits();
        set((state) => {
          const key = getUsageKey(modelId, apiKey);
          const currentUsage = state.usage[key] || { rpmUsed: 0, tpmUsed: 0, rpdUsed: 0 };
          
          return {
            usage: {
              ...state.usage,
              [key]: {
                ...currentUsage,
                rpmUsed: reason === 'rpm' && limits.rpm ? Math.max(currentUsage.rpmUsed, limits.rpm) : currentUsage.rpmUsed,
                tpmUsed: reason === 'tpm' && limits.tpm ? Math.max(currentUsage.tpmUsed, limits.tpm) : currentUsage.tpmUsed,
                rpdUsed: reason === 'rpd' && limits.rpd ? Math.max(currentUsage.rpdUsed, limits.rpd) : currentUsage.rpdUsed,
              }
            }
          }
        });
      },

      resetLimitForModel: (modelId: string, apiKey: string | undefined) => {
        set((state) => {
          const key = getUsageKey(modelId, apiKey);
          const newUsage = { ...state.usage };
          delete newUsage[key];
          return {
            usage: newUsage
          };
        });
      }
    }),
    {
      name: 'nyx-model-usage-storage',
    }
  )
);
