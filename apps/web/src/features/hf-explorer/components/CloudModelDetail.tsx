// src/features/hf-explorer/components/CloudModelDetail.tsx
import React from 'react';
import {
  Cloud,
  CheckCircle,
  WarningCircle,
  Sparkle,
  Brain,
  Wrench,
  Key,
  PaperPlaneRight,
  ShieldCheck,
  Lightning,
} from '@phosphor-icons/react';
import type { ModelOption } from '../../../types';
import { ProviderIcon, getProviderLabel } from '../../../shared/components/ui/ProviderIcon';
import { useNyxStore } from '../../../stores/useNyxStore';
import { toast } from 'sonner';

interface CloudModelDetailProps {
  model: ModelOption;
}

export const CloudModelDetail: React.FC<CloudModelDetailProps> = ({ model }) => {
  const apiKeys = useNyxStore((s) => s.apiKeys);
  const currentModel = useNyxStore((s) => s.currentModel);
  const setCurrentModel = useNyxStore((s) => s.setCurrentModel);
  const setCloudModelId = useNyxStore((s) => s.setCloudModelId);
  const setActiveMode = useNyxStore((s) => s.setActiveMode);

  // Check if API key exists for this provider
  const providerKey =
    apiKeys?.[model.provider] || (model.provider === 'gemini' ? apiKeys?.['google'] : undefined);
  const hasKey = Boolean(providerKey && providerKey.trim().length > 0);

  const isActiveModel = currentModel?.id === model.id && currentModel?.provider === model.provider;

  const handleSelectModel = () => {
    setCurrentModel(model);
    setCloudModelId(model.id);
    toast.success(`Active model set to ${model.name}`);
  };

  const handleStartChatting = () => {
    setCurrentModel(model);
    setCloudModelId(model.id);
    setActiveMode('chat');
    toast.success(`Switched to Chat with ${model.name}`);
  };

  return (
    <div className="flex flex-col h-full bg-[#000000] overflow-y-auto custom-scrollbar text-[#e2e8f0]">
      {/* ── Header ────────────────────────────────────────────────────── */}
      <div className="p-6 border-b border-white/10 flex flex-col gap-5 bg-[#09090b]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-primary shadow-inner">
              <ProviderIcon provider={model.provider} size={24} />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-foreground tracking-tight font-mono">
                  {model.name}
                </h1>
                {isActiveModel ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active Chat Model
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 border border-white/10 text-muted-foreground">
                    Cloud Frontier
                  </span>
                )}
              </div>
              <div className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                Provider: {getProviderLabel(model.provider)} · ID: {model.id}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleSelectModel}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[12px] font-bold transition-all cursor-pointer ${
                isActiveModel
                  ? 'bg-emerald-500/20 border border-emerald-500/30 text-emerald-300'
                  : 'bg-white/5 border border-white/10 text-foreground hover:bg-white/10'
              }`}
            >
              <CheckCircle size={14} weight={isActiveModel ? 'fill' : 'bold'} />
              <span>{isActiveModel ? 'Current Model' : 'Set as Active'}</span>
            </button>

            <button
              type="button"
              onClick={handleStartChatting}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[12px] font-bold transition-all cursor-pointer shadow-lg shadow-primary/20"
            >
              <PaperPlaneRight size={14} weight="bold" />
              <span>Chat Now</span>
            </button>
          </div>
        </div>

        {/* Badges row */}
        <div className="flex flex-wrap gap-2 text-[11px] font-mono">
          {model.specs?.contextWindow && (
            <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-foreground">
              Context: {model.specs.contextWindow}
            </span>
          )}
          {model.specs?.maxOutput && (
            <span className="px-2.5 py-1 rounded bg-white/5 border border-white/10 text-foreground">
              Max Output: {model.specs.maxOutput}
            </span>
          )}
          {model.capabilities?.vision && (
            <span className="px-2.5 py-1 rounded bg-purple-500/15 border border-purple-500/30 text-purple-300 font-semibold flex items-center gap-1">
              <Sparkle size={11} weight="fill" />
              Multimodal Vision
            </span>
          )}
          {model.capabilities?.reasoning && (
            <span className="px-2.5 py-1 rounded bg-blue-500/15 border border-blue-500/30 text-blue-300 font-semibold flex items-center gap-1">
              <Brain size={11} weight="fill" />
              Hybrid Reasoning
            </span>
          )}
          {model.capabilities?.toolCalling && (
            <span className="px-2.5 py-1 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-semibold flex items-center gap-1">
              <Wrench size={11} weight="fill" />
              Tool Calling
            </span>
          )}
        </div>
      </div>

      {/* ── Body ──────────────────────────────────────────────────────── */}
      <div className="p-6 flex flex-col gap-6">
        {/* Description */}
        {model.description && (
          <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-2">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
              Overview
            </span>
            <p className="text-xs text-muted-foreground leading-relaxed">{model.description}</p>
          </div>
        )}

        {/* API Key Status Banner */}
        <div className="p-4 rounded-xl bg-[#09090b] border border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className={`w-9 h-9 rounded-lg flex items-center justify-center ${
                hasKey
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
              }`}
            >
              <Key size={18} weight="duotone" />
            </div>
            <div>
              <div className="text-xs font-bold font-mono text-foreground">
                {hasKey ? 'API Key Configured' : 'API Key Required'}
              </div>
              <div className="text-[11px] text-muted-foreground">
                {hasKey
                  ? `Authenticated for ${getProviderLabel(model.provider)}`
                  : `Add your ${getProviderLabel(model.provider)} API key in Settings > API Keys`}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setActiveMode('settings')}
            className="px-3 py-1.5 rounded-lg text-[11px] font-mono font-bold bg-white/5 border border-white/10 hover:bg-white/10 text-foreground transition-all cursor-pointer"
          >
            Manage Keys
          </button>
        </div>

        {/* Specifications Grid */}
        {model.specs && (
          <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-3">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
              Model Specifications
            </span>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-white/5 text-[11px] font-mono">
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Context Window</div>
                <div className="text-foreground font-bold">{model.specs.contextWindow}</div>
              </div>
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Max Output Length</div>
                <div className="text-foreground font-bold">{model.specs.maxOutput}</div>
              </div>
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Modality</div>
                <div className="text-foreground font-bold">{model.specs.modality}</div>
              </div>
            </div>
          </div>
        )}

        {/* Rate Limits */}
        {model.limits && (
          <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center gap-1.5">
              <Lightning size={14} className="text-amber-400" weight="fill" />
              <span className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
                Provider Rate Limits
              </span>
            </div>
            <div className="grid grid-cols-3 gap-3 pt-2 border-t border-white/5 text-[11px] font-mono">
              {typeof model.limits.rpm === 'number' && (
                <div>
                  <div className="text-muted-foreground/60 text-[10px]">RPM (Req / Min)</div>
                  <div className="text-foreground font-bold">{model.limits.rpm}</div>
                </div>
              )}
              {typeof model.limits.tpm === 'number' && (
                <div>
                  <div className="text-muted-foreground/60 text-[10px]">TPM (Tokens / Min)</div>
                  <div className="text-foreground font-bold">
                    {model.limits.tpm >= 1000000
                      ? `${(model.limits.tpm / 1000000).toFixed(1)}M`
                      : `${model.limits.tpm / 1000}K`}
                  </div>
                </div>
              )}
              {typeof model.limits.rpd === 'number' && (
                <div>
                  <div className="text-muted-foreground/60 text-[10px]">RPD (Req / Day)</div>
                  <div className="text-foreground font-bold">{model.limits.rpd}</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Key Features */}
        {model.features && model.features.length > 0 && (
          <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-3">
            <span className="text-xs font-bold text-foreground uppercase tracking-wider font-mono">
              Capabilities & Architecture
            </span>
            <ul className="space-y-1.5 pt-2 border-t border-white/5">
              {model.features.map((feat, i) => (
                <li key={i} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <ShieldCheck size={14} className="text-primary mt-0.5 shrink-0" weight="bold" />
                  <span>{feat}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Pros & Cons */}
        {(model.pros || model.cons) && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {model.pros && model.pros.length > 0 && (
              <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-2">
                <span className="text-xs font-bold text-emerald-400 uppercase tracking-wider font-mono">
                  Strengths
                </span>
                <ul className="space-y-1.5 pt-2 border-t border-white/5">
                  {model.pros.map((pro, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-emerald-400 font-bold">•</span>
                      <span>{pro}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {model.cons && model.cons.length > 0 && (
              <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-2">
                <span className="text-xs font-bold text-amber-400 uppercase tracking-wider font-mono">
                  Considerations
                </span>
                <ul className="space-y-1.5 pt-2 border-t border-white/5">
                  {model.cons.map((con, i) => (
                    <li key={i} className="text-xs text-muted-foreground flex items-start gap-2">
                      <span className="text-amber-400 font-bold">•</span>
                      <span>{con}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
