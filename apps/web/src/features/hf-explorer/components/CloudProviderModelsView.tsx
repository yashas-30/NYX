// src/features/hf-explorer/components/CloudProviderModelsView.tsx
import React, { useMemo, useState } from 'react';
import {
  Cloud,
  CheckCircle,
  Sparkle,
  Brain,
  Wrench,
  PaperPlaneRight,
  ShieldCheck,
  WarningCircle,
  CaretDown,
  CaretUp,
} from '@phosphor-icons/react';
import { AVAILABLE_MODELS } from '../../../shared/config/models';
import type { ModelOption } from '../../../types';
import { ProviderIcon, getProviderLabel } from '../../../shared/components/ui/ProviderIcon';
import { useNyxStore } from '../../../shared/store/useNyxStore';
import { CLOUD_PROVIDERS } from './CloudProviderList';
import { toast } from 'sonner';

interface CloudProviderModelsViewProps {
  providerId: string;
  searchQuery?: string;
}

export const CloudProviderModelsView: React.FC<CloudProviderModelsViewProps> = ({
  providerId,
  searchQuery = '',
}) => {
  const apiKeys = useNyxStore((s) => s.apiKeys);
  const currentModel = useNyxStore((s) => s.currentModel);
  const setCurrentModel = useNyxStore((s) => s.setCurrentModel);
  const setCloudModelId = useNyxStore((s) => s.setCloudModelId);
  const setActiveMode = useNyxStore((s) => s.setActiveMode);

  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const providerInfo = useMemo(() => {
    return (
      CLOUD_PROVIDERS.find((p) => p.id === providerId) || {
        id: providerId,
        name: getProviderLabel(providerId),
        description: 'Frontier Cloud AI Models',
      }
    );
  }, [providerId]);

  // Check if API key exists for this provider
  const providerKey =
    providerId === 'gemini' ? apiKeys?.['gemini'] || apiKeys?.['google'] : apiKeys?.[providerId];
  const hasKey = Boolean(providerKey && providerKey.trim().length > 0);

  // Models belonging to this provider
  const models = useMemo(() => {
    return AVAILABLE_MODELS.filter(
      (m) =>
        (m.provider === providerId || (providerId === 'nvidia-nim' && m.provider === 'nvidia')) &&
        m.provider !== 'nyx-native'
    );
  }, [providerId]);

  // Filter models by search query if provided
  const filteredModels = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return models;
    return models.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.id.toLowerCase().includes(q) ||
        (m.description && m.description.toLowerCase().includes(q))
    );
  }, [models, searchQuery]);

  const handleSelectModel = (model: ModelOption) => {
    setCurrentModel(model);
    setCloudModelId(model.id);
    toast.success(`Active model set to ${model.name}`);
  };

  const handleStartChatting = (model: ModelOption) => {
    setCurrentModel(model);
    setCloudModelId(model.id);
    setActiveMode('chat');
    toast.success(`Switched to Chat with ${model.name}`);
  };

  return (
    <div className="flex flex-col h-full bg-[#000000] overflow-y-auto custom-scrollbar text-[#e2e8f0]">
      {/* ── Provider Header ─────────────────────────────────────────── */}
      <div className="p-6 border-b border-white/10 flex flex-col gap-4 bg-[#09090b]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-primary shadow-inner shrink-0">
              <ProviderIcon provider={providerId} size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h1 className="text-xl font-bold text-foreground tracking-tight font-mono">
                  {providerInfo.name}
                </h1>
                <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground">
                  {models.length} {models.length === 1 ? 'Model' : 'Models'} Available
                </span>
              </div>
              <div className="text-[12px] text-muted-foreground mt-0.5">
                {providerInfo.description}
              </div>
            </div>
          </div>

          {/* API Key Status Pill */}
          <div className="flex items-center gap-2">
            {hasKey ? (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/25 text-emerald-400 text-xs font-mono font-medium">
                <ShieldCheck size={15} weight="fill" />
                <span>API Key Configured</span>
              </div>
            ) : (
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/25 text-amber-400 text-xs font-mono font-medium">
                <WarningCircle size={15} weight="fill" />
                <span>No API Key Configured</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Models List for this Provider ──────────────────────────── */}
      <div className="p-6 flex flex-col gap-4 flex-1">
        {filteredModels.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 text-center gap-3 text-muted-foreground">
            <Cloud size={32} weight="duotone" className="opacity-40" />
            <div className="text-sm font-semibold text-foreground">
              {searchQuery
                ? `No models matching "${searchQuery}" for ${providerInfo.name}`
                : 'No models found for this provider'}
            </div>
          </div>
        ) : (
          filteredModels.map((m) => {
            const isActive = currentModel?.id === m.id;
            const isExpanded = expandedModelId === m.id;
            const isVision = Boolean((m as any).capabilities?.vision);
            const isReasoning = Boolean(
              (m as any).capabilities?.reasoning || (m as any).supportsThinking
            );
            const isTools = Boolean((m as any).capabilities?.toolCalling);

            return (
              <div
                key={m.id}
                className={`rounded-xl border transition-all duration-200 bg-[#09090b] ${
                  isActive
                    ? 'border-primary/50 shadow-md shadow-primary/5'
                    : 'border-white/10 hover:border-white/20'
                }`}
              >
                <div className="p-5 flex flex-col gap-3.5">
                  {/* Top Row: Title, Capabilities & Active Badge */}
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="flex items-center gap-2.5 flex-wrap min-w-0">
                      <h3 className="text-base font-bold font-mono text-foreground tracking-tight">
                        {m.name}
                      </h3>
                      <span className="text-[11px] font-mono text-muted-foreground/70">{m.id}</span>

                      {/* Real Capabilities Badges */}
                      <div className="flex items-center gap-1.5 ml-1 flex-wrap">
                        {isVision && (
                          <span
                            title="Multimodal Vision Enabled"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-purple-500/10 border border-purple-500/25 text-purple-300 text-[10px] font-mono font-medium"
                          >
                            <Sparkle size={11} weight="fill" />
                            Vision
                          </span>
                        )}

                        {isReasoning && (
                          <span
                            title="Deep Reasoning & Extended Thinking"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/25 text-blue-300 text-[10px] font-mono font-medium"
                          >
                            <Brain size={11} weight="fill" />
                            Thinking
                          </span>
                        )}

                        {isTools && (
                          <span
                            title="Native Function & Tool Calling"
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/25 text-emerald-300 text-[10px] font-mono font-medium"
                          >
                            <Wrench size={11} weight="fill" />
                            Tools
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Active Status Badge */}
                    {isActive && (
                      <span className="shrink-0 inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Active Chat Model
                      </span>
                    )}
                  </div>

                  {/* Specifications row */}
                  <div className="flex items-center gap-2 flex-wrap text-[11px] font-mono">
                    {m.specs?.contextWindow && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-foreground font-semibold">
                        Context: {m.specs.contextWindow}
                      </span>
                    )}
                    {m.specs?.maxOutput && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">
                        Max Output: {m.specs.maxOutput}
                      </span>
                    )}
                    {m.specs?.modality && (
                      <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10 text-muted-foreground">
                        Modality: {m.specs.modality}
                      </span>
                    )}
                  </div>

                  {/* Description */}
                  {m.description && (
                    <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>
                  )}

                  {/* Action Buttons Row */}
                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setExpandedModelId(isExpanded ? null : m.id)}
                      className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 cursor-pointer font-mono"
                    >
                      {isExpanded ? <CaretUp size={12} /> : <CaretDown size={12} />}
                      <span>{isExpanded ? 'Hide Details' : 'View Architecture & Specs'}</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleSelectModel(m)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer font-mono ${
                          isActive
                            ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                            : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
                        }`}
                      >
                        <CheckCircle size={13} weight={isActive ? 'fill' : 'bold'} />
                        <span>{isActive ? 'Current Model' : 'Set as Active'}</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleStartChatting(m)}
                        className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-xs font-bold transition-all cursor-pointer shadow-md shadow-primary/20 font-mono"
                      >
                        <PaperPlaneRight size={13} weight="fill" />
                        <span>Start Chat</span>
                      </button>
                    </div>
                  </div>

                  {/* Expanded Details: Features, Strengths, Considerations */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-white/10 flex flex-col gap-3 text-xs">
                      {m.features && m.features.length > 0 && (
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-muted-foreground">
                            Architectural Highlights
                          </span>
                          <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-foreground/80">
                            {m.features.map((f, i) => (
                              <li key={i}>{f}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {m.pros && m.pros.length > 0 && (
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-emerald-400">
                            Strengths
                          </span>
                          <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-emerald-300/90">
                            {m.pros.map((p, i) => (
                              <li key={i}>{p}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {m.cons && m.cons.length > 0 && (
                        <div>
                          <span className="text-[10px] font-mono font-bold uppercase tracking-wider text-rose-400">
                            Considerations
                          </span>
                          <ul className="list-disc list-outside ml-4 mt-1 space-y-0.5 text-rose-300/90">
                            {m.cons.map((c, i) => (
                              <li key={i}>{c}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
