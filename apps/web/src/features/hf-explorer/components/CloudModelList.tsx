// src/features/hf-explorer/components/CloudModelList.tsx
import React, { useMemo } from 'react';
import { Cloud, Sparkle, Brain, Wrench, Globe } from '@phosphor-icons/react';
import { AVAILABLE_MODELS } from '../../../shared/config/models';
import type { ModelOption } from '../../../types';
import { ProviderIcon, getProviderLabel } from '../../../shared/components/ui/ProviderIcon';

interface CloudModelListProps {
  selectedModelId: string | null;
  selectedProvider: string;
  onSelectProvider: (provider: string) => void;
  searchQuery: string;
  onSelect: (model: ModelOption) => void;
}

const CLOUD_PROVIDERS = [
  { id: 'all', label: 'All Providers' },
  { id: 'gemini', label: 'Google Gemini' },
  { id: 'openrouter', label: 'OpenRouter' },
  { id: 'nvidia-nim', label: 'NVIDIA NIM' },
  { id: 'groq', label: 'Groq (LPU)' },
  { id: 'mistral', label: 'Mistral AI' },
];

export const CloudModelList: React.FC<CloudModelListProps> = ({
  selectedModelId,
  selectedProvider,
  onSelectProvider,
  searchQuery,
  onSelect,
}) => {
  // Filter out local on-device models
  const cloudModels = useMemo(() => {
    return AVAILABLE_MODELS.filter((m) => m.provider !== 'nyx-native');
  }, []);

  // Filter models by search query and selected provider
  const filteredModels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    return cloudModels.filter((m) => {
      const matchesProvider = selectedProvider === 'all' || m.provider === selectedProvider;
      if (!matchesProvider) return false;
      if (!q) return true;
      return (
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        m.provider.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
      );
    });
  }, [cloudModels, selectedProvider, searchQuery]);

  // Provider model counts
  const providerCounts = useMemo(() => {
    const counts: Record<string, number> = { all: cloudModels.length };
    for (const m of cloudModels) {
      counts[m.provider] = (counts[m.provider] || 0) + 1;
    }
    return counts;
  }, [cloudModels]);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* ── Scrollable Models List ───────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar divide-y divide-border/40">
        {filteredModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 text-center gap-3">
            <Cloud size={32} weight="duotone" className="text-muted-foreground/40" />
            <div className="text-sm font-semibold text-foreground">
              {searchQuery
                ? `No cloud models matching "${searchQuery}"`
                : 'No models found for this provider'}
            </div>
            <div className="text-xs text-muted-foreground max-w-[240px]">
              Try selecting a different provider below or clearing the search filter.
            </div>
          </div>
        ) : (
          filteredModels.map((m) => {
            const isSelected = selectedModelId === m.id;

            return (
              <div
                key={`${m.provider}:${m.id}`}
                onClick={() => onSelect(m)}
                className={`p-3.5 flex flex-col gap-2 transition-all cursor-pointer select-none ${
                  isSelected
                    ? 'bg-primary/10 border-l-2 border-primary'
                    : 'hover:bg-muted/40 border-l-2 border-transparent'
                }`}
              >
                {/* Top row: Provider icon, name, status badge */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 flex items-start gap-2.5">
                    <div className="w-6 h-6 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
                      <ProviderIcon provider={m.provider} size={14} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div
                        className={`text-[13px] font-bold truncate font-mono ${
                          isSelected ? 'text-primary' : 'text-foreground'
                        }`}
                        title={m.name}
                      >
                        {m.name}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 truncate font-mono mt-0.5">
                        {getProviderLabel(m.provider)} · {m.id}
                      </div>
                    </div>
                  </div>

                  {m.status && (
                    <span className="shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider bg-white/5 border border-white/10 text-muted-foreground font-mono">
                      {m.status}
                    </span>
                  )}
                </div>

                {/* Bottom row: Capabilities & Specs */}
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground font-mono">
                  {m.specs?.contextWindow && <span>{m.specs.contextWindow.split(' ')[0]} ctx</span>}
                  {m.capabilities?.vision && (
                    <>
                      <span>•</span>
                      <span className="text-purple-400 flex items-center gap-0.5">
                        <Sparkle size={10} weight="fill" />
                        Vision
                      </span>
                    </>
                  )}
                  {m.capabilities?.reasoning && (
                    <>
                      <span>•</span>
                      <span className="text-blue-400 flex items-center gap-0.5">
                        <Brain size={10} weight="fill" />
                        Thinking
                      </span>
                    </>
                  )}
                  {m.capabilities?.toolCalling && (
                    <>
                      <span>•</span>
                      <span className="text-emerald-400 flex items-center gap-0.5">
                        <Wrench size={10} weight="fill" />
                        Tools
                      </span>
                    </>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ── Providers Section Under Model List ────────────────────────── */}
      <div className="shrink-0 border-t border-border bg-[#09090b] p-2.5 flex flex-col gap-1.5">
        <div className="flex items-center justify-between px-1">
          <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider font-mono flex items-center gap-1.5">
            <Globe size={11} className="text-primary" />
            Cloud Providers
          </span>
          <span className="text-[10px] font-mono text-muted-foreground/60">
            {filteredModels.length} models
          </span>
        </div>

        {/* Provider Pills / Buttons Grid */}
        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          {CLOUD_PROVIDERS.map((p) => {
            const isSelected = selectedProvider === p.id;
            const count = providerCounts[p.id] ?? 0;

            return (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectProvider(p.id)}
                className={`flex items-center justify-between px-2.5 py-1.5 rounded-lg text-[11px] font-mono transition-all cursor-pointer ${
                  isSelected
                    ? 'bg-primary text-primary-foreground font-bold shadow-sm ring-1 ring-primary/40'
                    : 'bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10'
                }`}
              >
                <div className="flex items-center gap-1.5 truncate">
                  {p.id !== 'all' && <ProviderIcon provider={p.id} size={12} />}
                  <span className="truncate">{p.label}</span>
                </div>
                <span
                  className={`text-[9px] px-1 py-0.2 rounded-full font-bold ml-1 shrink-0 ${
                    isSelected
                      ? 'bg-primary-foreground/20 text-primary-foreground'
                      : 'bg-white/5 text-muted-foreground'
                  }`}
                >
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
};
