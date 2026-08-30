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

export function ModelCard({ model, isSelected, hardware, onSelect }: ModelCardProps) {
  const modelId = model?.id || '';
  const { creator, name } = parseModelId(modelId);
  const relTime = getRelativeTime(model?.last_modified);

  // Verified creator check
  const isVerified = [
    'google',
    'meta-llama',
    'meta',
    'microsoft',
    'mistralai',
    'qwen',
    'nvidia',
    'openai',
    'anthropic',
    'stabilityai',
    'deepseek-ai',
    'black-forest-labs',
    'cohere',
    'unsloth',
    'bartowski',
    'mradermacher',
  ].includes(creator.toLowerCase());

  // Hardware compatibility calculation for this specific device
  const hwFit = useMemo(() => {
    return getModelHardwareCompatibility(modelId, model.tags, model.numParameters, hardware);
  }, [modelId, model.tags, model.numParameters, hardware]);

  // Extract accurate parameters and architecture
  const paramCount = useMemo(() => {
    return extractParameterCount(modelId, model.tags, model.numParameters);
  }, [modelId, model.tags, model.numParameters]);

  const archName = useMemo(() => {
    return getArchitectureName(modelId, model.tags);
  }, [modelId, model.tags]);

  // Extract accurate capability pills (max 2 for sleek display)
  const caps = useMemo(() => {
    return getCapabilityTags(modelId, model.tags, model.pipeline_tag).slice(0, 2);
  }, [modelId, model.tags, model.pipeline_tag]);

  return (
    <button
      onClick={() => onSelect(model.id)}
      aria-label={`Select ${model.id}`}
      aria-selected={isSelected}
      style={{
        width: '100%',
        textAlign: 'left',
        background: isSelected ? '#1e3a8a' : 'transparent',
        border: 'none',
        borderBottom: '1px solid #1c1c1f',
        padding: '10px 12px',
        cursor: 'pointer',
        transition: 'background 0.12s ease',
        display: 'flex',
        alignItems: 'flex-start',
        gap: 10,
      }}
      onMouseEnter={(e) => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#1a1a1e';
      }}
      onMouseLeave={(e) => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {/* Official Creator Avatar */}
      <div style={{ flexShrink: 0, marginTop: 2 }}>
        <HfAuthorAvatar creator={creator} avatarUrl={model.authorData?.avatarUrl} size={36} />
      </div>

      {/* Content Body */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
        {/* Row 1: Model Name + Verified + Param Count */}
        <div
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, flex: 1 }}>
            <span
              style={{
                fontSize: 13,
                fontWeight: 700,
                color: isSelected ? '#ffffff' : '#f4f4f5',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              {name}
            </span>
            {isVerified && (
              <CheckCircle
                size={13}
                weight="fill"
                style={{ color: isSelected ? '#93c5fd' : '#3b82f6', flexShrink: 0 }}
              />
            )}
          </div>

          {/* Param Badge (e.g. 7B, 14B) */}
          {paramCount && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 4,
                background: isSelected ? 'rgba(255,255,255,0.15)' : '#27272a',
                color: isSelected ? '#ffffff' : '#e4e4e7',
                fontFamily: 'monospace',
                flexShrink: 0,
              }}
            >
              {paramCount}
            </span>
          )}
        </div>

        {/* Row 2: Architecture + Capability Badges */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 4,
            flexWrap: 'nowrap',
            overflow: 'hidden',
          }}
        >
          <span
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: isSelected ? '#bfdbfe' : '#71717a',
              whiteSpace: 'nowrap',
            }}
          >
            {creator} • {archName}
          </span>

          {caps.map((c) => (
            <span
              key={c.label}
              style={{
                fontSize: 9,
                fontWeight: 600,
                padding: '1px 5px',
                borderRadius: 3,
                background: isSelected ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)',
                color: isSelected ? '#ffffff' : '#a1a1aa',
                flexShrink: 0,
              }}
            >
              {c.label}
            </span>
          ))}
        </div>

        {/* Row 3: Device Hardware Fit Indicator (LM Studio style) + Downloads + Time */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 2,
            gap: 6,
          }}
        >
          {/* Hardware Fit badge */}
          {hwFit ? (
            <span
              style={{
                fontSize: 9,
                fontWeight: 700,
                padding: '1px 6px',
                borderRadius: 4,
                background:
                  hwFit.color === 'emerald'
                    ? 'rgba(16, 185, 129, 0.15)'
                    : hwFit.color === 'blue'
                      ? 'rgba(59, 130, 246, 0.15)'
                      : 'rgba(239, 68, 68, 0.15)',
                color:
                  hwFit.color === 'emerald'
                    ? '#34d399'
                    : hwFit.color === 'blue'
                      ? '#60a5fa'
                      : '#f87171',
                border: `1px solid ${
                  hwFit.color === 'emerald'
                    ? 'rgba(16, 185, 129, 0.3)'
                    : hwFit.color === 'blue'
                      ? 'rgba(59, 130, 246, 0.3)'
                      : 'rgba(239, 68, 68, 0.3)'
                }`,
                flexShrink: 0,
              }}
            >
              {hwFit.badge}
            </span>
          ) : (
            <span
              style={{
                fontSize: 9,
                fontWeight: 600,
                color: isSelected ? '#bfdbfe' : '#52525b',
              }}
            >
              GGUF
            </span>
          )}

          {/* Downloads & Updated */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              fontSize: 10,
              color: isSelected ? '#dbeafe' : '#71717a',
            }}
          >
            <span style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
