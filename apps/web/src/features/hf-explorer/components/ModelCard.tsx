// src/features/hf-explorer/components/ModelCard.tsx
// LM Studio-style high-density model card for the left explorer panel
import React, { useMemo } from 'react';
import { CheckCircle, DownloadSimple } from '@phosphor-icons/react';
import {
  parseModelId,
  getRelativeTime,
  formatCount,
  getModelHardwareCompatibility,
} from '../lib/utils';
import { getCapabilityTags, getArchitectureName, extractParameterCount } from '../lib/capabilities';
import { HfAuthorAvatar } from './HfAuthorAvatar';
import type { HfModelResult, HardwareSpecs } from '../types';

interface ModelCardProps {
  model: HfModelResult;
  isSelected: boolean;
  hardware?: HardwareSpecs | null;
  onSelect: (id: string) => void;
}

// Verified creator cache directly against Hugging Face live organization API
const VERIFIED_ORG_CACHE = new Map<string, boolean>();

function useIsCreatorVerified(creator: string): boolean {
  const [verified, setVerified] = React.useState<boolean>(() => {
    return VERIFIED_ORG_CACHE.get(creator.toLowerCase()) ?? false;
  });

  React.useEffect(() => {
    if (!creator) return;
    const key = creator.toLowerCase();
    if (VERIFIED_ORG_CACHE.has(key)) {
      setVerified(VERIFIED_ORG_CACHE.get(key)!);
      return;
    }

    let isMounted = true;
    fetch(`https://huggingface.co/api/organizations/${encodeURIComponent(creator)}/overview`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const isV = Boolean(data?.isVerified);
        VERIFIED_ORG_CACHE.set(key, isV);
        if (isMounted) setVerified(isV);
      })
      .catch(() => {
        VERIFIED_ORG_CACHE.set(key, false);
      });

    return () => {
      isMounted = false;
    };
  }, [creator]);

  return verified;
}

export function ModelCard({ model, isSelected, hardware, onSelect }: ModelCardProps) {
  const modelId = model?.id || '';
  const { creator, name } = parseModelId(modelId);
  const relTime = getRelativeTime(model?.last_modified);

  // Verified creator check from live Hugging Face org API
  const isVerified = useIsCreatorVerified(creator);

  // Hardware compatibility calculation for this specific device
  const hwFit = useMemo(() => {
    return getModelHardwareCompatibility(modelId, model.tags, model.numParameters, hardware);
  }, [modelId, model.tags, model.numParameters, hardware]);

  // Extract accurate parameters and architecture from live HF metadata
  const paramCount = useMemo(() => {
    return extractParameterCount(modelId, model.tags, model.numParameters, model.gguf);
  }, [modelId, model.tags, model.numParameters, model.gguf]);

  const archName = useMemo(() => {
    return getArchitectureName(modelId, model.tags, model.config, model.gguf);
  }, [modelId, model.tags, model.config, model.gguf]);

  // Extract accurate capability pills (max 2 for sleek display)
  const caps = useMemo(() => {
    const hasMmproj = model.siblings?.some((s) => s.rfilename.toLowerCase().includes('mmproj'));
    return getCapabilityTags(modelId, model.tags, model.pipeline_tag, hasMmproj, {
      gguf: model.gguf,
      config: model.config,
    }).slice(0, 2);
  }, [modelId, model.tags, model.pipeline_tag, model.siblings, model.gguf, model.config]);

  return (
    <button
      onClick={() => onSelect(model.id)}
      aria-label={`Select ${model.id}`}
      aria-selected={isSelected}
      className={`w-full text-left p-3 cursor-pointer transition-colors duration-150 flex items-start gap-2.5 border-b border-border ${
        isSelected
          ? 'bg-muted border-l-2 border-l-primary text-foreground'
          : 'bg-transparent hover:bg-muted/40 text-foreground/90'
      }`}
    >
      {/* Official Creator Avatar */}
      <div className="shrink-0 mt-0.5">
        <HfAuthorAvatar creator={creator} avatarUrl={model.authorData?.avatarUrl} size={36} />
      </div>

      {/* Content Body */}
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        {/* Row 1: Model Name + Verified + Param Count */}
        <div className="flex items-center justify-between gap-1.5">
          <div className="flex items-center gap-1 min-w-0 flex-1">
            <span className="text-[13px] font-bold text-foreground truncate">{name}</span>
            {isVerified && (
              <CheckCircle size={13} weight="fill" className="text-primary shrink-0" />
            )}
          </div>

          {/* Param Badge (e.g. 7B, 14B) */}
          {paramCount && (
            <span className="text-[10px] font-mono font-bold px-1.5 py-0.5 rounded bg-muted border border-border text-foreground shrink-0">
              {paramCount}
            </span>
          )}
        </div>

        {/* Row 2: Architecture + Capability Badges */}
        <div className="flex items-center gap-1 flex-nowrap overflow-hidden">
          <span className="text-[10px] font-medium text-muted-foreground truncate">
            {creator} • {archName}
          </span>

          {caps.map((c) => (
            <span
              key={c.label}
              className="text-[9px] font-semibold px-1.5 py-0.5 rounded bg-muted/60 border border-border/50 text-muted-foreground shrink-0"
            >
              {c.label}
            </span>
          ))}
        </div>

        {/* Row 3: Device Hardware Fit Indicator + Downloads + Time */}
        <div className="flex items-center justify-between mt-0.5 gap-1.5">
          {/* Hardware Fit badge */}
          {hwFit ? (
            <span
              className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border shrink-0 ${
                hwFit.color === 'emerald'
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                  : hwFit.color === 'blue'
                    ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                    : 'bg-red-500/10 text-red-400 border-red-500/20'
              }`}
            >
              {hwFit.badge}
            </span>
          ) : (
            <span className="text-[9px] font-medium text-muted-foreground/60">GGUF</span>
          )}

          {/* Downloads & Updated */}
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <DownloadSimple size={10} />
              {formatCount(model.downloads)}
            </span>
            <span>•</span>
            <span>{relTime?.replace('Updated ', '') || ''}</span>
          </div>
        </div>
      </div>
    </button>
  );
}
