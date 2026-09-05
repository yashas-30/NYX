// src/features/hf-explorer/components/CloudProviderList.tsx
import React, { useMemo } from 'react';
import { Cloud } from '@phosphor-icons/react';
import { AVAILABLE_MODELS } from '../../../shared/config/models';
import { ProviderIcon } from '../../../shared/components/ui/ProviderIcon';
import { useNyxStore } from '../../../shared/store/useNyxStore';

export interface CloudProviderItem {
  id: string;
  name: string;
  description: string;
}

export const CLOUD_PROVIDERS: CloudProviderItem[] = [
  { id: 'gemini', name: 'Google Gemini', description: 'Gemini 2.5 Flash, Pro, Thinking & Vision' },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    description: 'Universal API gateway for frontier models',
  },
  {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    description: 'Accelerated microservices for enterprise AI',
  },
  { id: 'groq', name: 'Groq (LPU)', description: 'Ultra-fast LPU inference engine' },
  { id: 'mistral', name: 'Mistral AI', description: 'Frontier European open & commercial models' },
];

interface CloudProviderListProps {
  selectedProvider: string;
  onSelectProvider: (providerId: string) => void;
  searchQuery: string;
}

export const CloudProviderList: React.FC<CloudProviderListProps> = ({
  selectedProvider,
  onSelectProvider,
  searchQuery,
}) => {
  const apiKeys = useNyxStore((s) => s.apiKeys);

  // Group models by provider to get counts and search matches
  const providerModels = useMemo(() => {
    const map: Record<string, typeof AVAILABLE_MODELS> = {};
    for (const p of CLOUD_PROVIDERS) {
      map[p.id] = AVAILABLE_MODELS.filter(
        (m) => m.provider === p.id || (p.id === 'nvidia-nim' && m.provider === 'nvidia')
      );
    }
    return map;
  }, []);

  const query = searchQuery.toLowerCase().trim();

  // Filter providers by name, description, or if their models match the search query
  const filteredProviders = useMemo(() => {
    if (!query) return CLOUD_PROVIDERS;
    return CLOUD_PROVIDERS.filter((p) => {
      const nameMatch = p.name.toLowerCase().includes(query) || p.id.toLowerCase().includes(query);
      const descMatch = p.description.toLowerCase().includes(query);
      const modelsMatch = (providerModels[p.id] || []).some(
        (m) =>
          m.name.toLowerCase().includes(query) ||
          m.id.toLowerCase().includes(query) ||
          (m.description && m.description.toLowerCase().includes(query))
      );
      return nameMatch || descMatch || modelsMatch;
    });
  }, [query, providerModels]);

  if (filteredProviders.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <Cloud size={32} weight="duotone" className="text-muted-foreground/40" />
        <div className="text-sm font-semibold text-foreground">
          No cloud providers matching &ldquo;{query}&rdquo;
        </div>
        <div className="text-xs text-muted-foreground max-w-[240px]">
          Try searching for Gemini, OpenRouter, NVIDIA, Groq, or Mistral.
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar divide-y divide-border/40">
      {filteredProviders.map((p) => {
        const isSelected = selectedProvider === p.id;
        const count = providerModels[p.id]?.length || 0;

        // Check if API key is configured
        const hasKey = Boolean(
          (p.id === 'gemini' ? apiKeys?.['gemini'] || apiKeys?.['google'] : apiKeys?.[p.id])?.trim()
        );

        return (
          <div
            key={p.id}
            onClick={() => onSelectProvider(p.id)}
            className={`px-3.5 py-3 flex items-center justify-between gap-3 transition-all cursor-pointer select-none ${
              isSelected
                ? 'bg-primary/10 border-l-2 border-primary'
                : 'hover:bg-muted/40 border-l-2 border-transparent'
            }`}
          >
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0">
                <ProviderIcon provider={p.id} size={14} />
              </div>
              <div
                className={`text-[13px] font-medium truncate font-mono ${
                  isSelected ? 'text-primary font-bold' : 'text-foreground'
                }`}
              >
                {p.name}
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {/* API Key Status Dot */}
              <div
                className={`w-1.5 h-1.5 rounded-full ${
                  hasKey
                    ? 'bg-emerald-400 shadow-[0_0_6px_rgba(52,211,153,0.8)]'
                    : 'bg-muted-foreground/30'
                }`}
                title={hasKey ? 'API Key Configured' : 'No API Key Configured'}
              />

              {/* Model count */}
              <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-mono">
                {count} {count === 1 ? 'model' : 'models'}
              </span>
            </div>
          </div>
        );
      })}
    </div>
  );
};
