// src/features/hf-explorer/components/ModelCard.tsx
// LM Studio-style horizontal model row for the left panel list
import React from 'react';
import { CheckCircle } from '@phosphor-icons/react';
import { parseModelId, getRelativeTime } from '../lib/utils';
import { HfAuthorAvatar } from './HfAuthorAvatar';
import type { HfModelResult } from '../types';

interface ModelCardProps {
  model: HfModelResult;
  isSelected: boolean;
  onSelect: (id: string) => void;
}

// Generate a concise description sentence matching LM Studio style
function getModelSummary(model: HfModelResult): string {
  const { creator, name } = parseModelId(model.id);
  const tags = (model.tags || []).map(t => t.toLowerCase());

  const sizeMatch = name.match(/(\d+(?:\.\d+)?[Bb])/);
  const params = sizeMatch ? sizeMatch[0].toUpperCase() : null;

  if (params && (tags.includes('text-generation') || model.pipeline_tag === 'text-generation')) {
    return `${name} is a ${params} model, but takes only about 4GB.`;
  }
  if (tags.includes('image-text-to-text') || model.pipeline_tag === 'image-text-to-text') {
    return `${name} multimodal vision model.`;
  }
  if (tags.includes('text-to-image') || model.pipeline_tag === 'text-to-image') {
    return `${name} text-to-image model.`;
  }
  if (params) {
    return `${name} ${params} optimized for local run.`;
  }
  return `${creator}/${name} model on Hugging Face.`;
}

export function ModelCard({ model, isSelected, onSelect }: ModelCardProps) {
  const modelId = model?.id || '';
  const { creator, name } = parseModelId(modelId);
  const relTime = getRelativeTime(model?.last_modified);
  const summary = getModelSummary(model);

  // Verified org check
  const isVerified = [
    'google', 'meta-llama', 'meta', 'microsoft', 'mistralai', 'qwen',
    'nvidia', 'openai', 'anthropic', 'stabilityai', 'deepseek-ai',
    'black-forest-labs', 'cohere', 'unsloth',
  ].includes(creator.toLowerCase());

  return (
    <button
      onClick={() => onSelect(model.id)}
      aria-label={`Select ${model.id}`}
      aria-selected={isSelected}
      style={{
        width: '100%',
        textAlign: 'left',
        background: isSelected ? '#2563eb' : 'transparent',
        border: 'none',
        borderBottom: '1px solid #1c1c1e',
        padding: '10px 14px',
        cursor: 'pointer',
        transition: 'background 0.1s',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
      }}
      onMouseEnter={e => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = '#202023';
      }}
      onMouseLeave={e => {
        if (!isSelected) (e.currentTarget as HTMLButtonElement).style.background = 'transparent';
      }}
    >
      {/* Official HF / GitHub avatar logo */}
      <HfAuthorAvatar creator={creator} avatarUrl={model.authorData?.avatarUrl} size={40} />

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        {/* Top row: Name + Verified checkmark */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
          <span style={{
            fontSize: 13,
            fontWeight: 700,
            color: isSelected ? '#ffffff' : '#f4f4f5',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}>
            {name}
          </span>
          {isVerified && (
            <CheckCircle
              size={14}
              weight="fill"
              style={{ color: isSelected ? '#93c5fd' : '#3b82f6', flexShrink: 0 }}
            />
          )}
        </div>

        {/* Second row: Summary description (left), Date (right) */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <span style={{
            fontSize: 11,
            color: isSelected ? 'rgba(255,255,255,0.75)' : '#71717a',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            flex: 1,
          }}>
            {summary}
          </span>
          <span style={{
            fontSize: 10,
            color: isSelected ? 'rgba(255,255,255,0.65)' : '#52525b',
            whiteSpace: 'nowrap',
            flexShrink: 0,
          }}>
            {relTime?.replace('Updated ', '') ?? ''}
          </span>
        </div>
      </div>
    </button>
  );
}
