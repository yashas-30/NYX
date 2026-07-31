// src/features/hf-explorer/components/ModelCard.tsx
import React, { useState, useMemo } from 'react';
import { ArrowDown, Heart, Lock, Clock, Scales, Database } from '@phosphor-icons/react';
import { parseModelId, formatCount, getRelativeTime, getParameterCount } from '../lib/utils';
import type { HfModelResult } from '../types';

interface ModelCardProps {
  model: HfModelResult;
  onSelect: (id: string) => void;
}

const TASK_LABELS: Record<string, string> = {
  'text-generation':              'Text Gen',
  'image-text-to-text':           'Vision LM',
  'text-to-image':                'Text→Image',
  'image-to-image':               'Img→Img',
  'feature-extraction':           'Embeddings',
  'question-answering':           'QnA',
  'text-classification':          'Classify',
  'automatic-speech-recognition': 'ASR',
  'text-to-speech':               'TTS',
  'fill-mask':                    'Fill Mask',
  'translation':                  'Translation',
  'summarization':                'Summarize',
  'sentence-similarity':          'Similarity',
  'depth-estimation':             'Depth Est.',
  'object-detection':             'Object Det.',
  'image-segmentation':           'Segmentation',
  'reinforcement-learning':       'RL',
};

function getFormat(id: string, tags: string[]): string {
  const lower = id.toLowerCase();
  const t = (tags || []).map(x => x.toLowerCase());
  if (t.includes('whisper') || lower.includes('whisper')) return 'GGUF';
  if (t.includes('onnx') || lower.includes('onnx')) return 'ONNX';
  if (t.includes('safetensors')) return 'Safetensors';
  return 'GGUF';
}

function getFormatStyle(format: string): string {
  const lower = format.toLowerCase();
  if (lower.includes('gguf')) {
    return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  }
  if (lower.includes('safetensors')) {
    return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
  }
  if (lower.includes('onnx')) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  }
  return 'bg-white/[0.04] text-white/80 border-white/[0.08]';
}

function getTask(pipelineTag?: string, tags?: string[]): string | null {
  if (pipelineTag && TASK_LABELS[pipelineTag]) return TASK_LABELS[pipelineTag];
  for (const t of tags || []) {
    if (TASK_LABELS[t]) return TASK_LABELS[t];
  }
  return null;
}

function getTaskStyle(task: string): string {
  const lower = task.toLowerCase();
  if (lower.includes('text gen') || lower.includes('generation')) {
    return 'bg-orange-500/10 text-orange-400 border-orange-500/20';
  }
  if (lower.includes('vision') || lower.includes('vl') || lower.includes('multimodal')) {
    return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  }
  if (lower.includes('image') || lower.includes('diffusion') || lower.includes('img') || lower.includes('→image')) {
    return 'bg-violet-500/10 text-violet-400 border-violet-500/20';
  }
  if (lower.includes('embedding') || lower.includes('similarity') || lower.includes('feature')) {
    return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
  }
  if (lower.includes('speech') || lower.includes('asr') || lower.includes('tts') || lower.includes('audio')) {
    return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  }
  return 'bg-white/[0.04] text-white/60 border-white/[0.06]';
}

function getLicense(tags: string[]): string | null {
  for (const t of tags || []) {
    if (t.startsWith('license:')) {
      const lic = t.replace('license:', '').replace(/-/g, ' ');
      const clean = lic.toUpperCase();
      return clean.length > 14 ? clean.slice(0, 12) + '…' : clean;
    }
  }
  return null;
}

function HfAvatar({ org, avatarUrl }: { org: string; avatarUrl?: string }) {
  const [imgFailed, setImgFailed] = useState(false);
  const [src, setSrc] = useState(
    avatarUrl
      ? (avatarUrl.startsWith('http') ? avatarUrl : `https://huggingface.co${avatarUrl}`)
      : `https://huggingface.co/${org}.png?size=80`
  );
  const [stage, setStage] = useState(0);

  const handleError = () => {
    if (stage === 0) {
      setStage(1);
      setSrc(`https://huggingface.co/${org}.png?size=80`);
    } else if (stage === 1) {
      setStage(2);
      setSrc(`https://github.com/${org}.png?size=80`);
    } else {
      setImgFailed(true);
    }
  };

  const initials = org
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w: string) => w[0].toUpperCase())
    .join('') || org.substring(0, 2).toUpperCase();

  const gradient = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < org.length; i++) {
      hash = org.charCodeAt(i) + ((hash << 5) - hash);
    }
    const colorPairs = [
      'from-indigo-500/20 to-purple-500/20 text-indigo-300 border-indigo-500/30',
      'from-blue-500/20 to-cyan-500/20 text-blue-300 border-blue-500/30',
      'from-emerald-500/20 to-teal-500/20 text-emerald-300 border-emerald-500/30',
      'from-amber-500/20 to-orange-500/20 text-amber-300 border-amber-500/30',
      'from-pink-500/20 to-rose-500/20 text-pink-300 border-pink-500/30',
      'from-fuchsia-500/20 to-violet-500/20 text-fuchsia-300 border-fuchsia-500/30',
      'from-sky-500/20 to-indigo-500/20 text-sky-300 border-sky-500/30',
      'from-violet-500/20 to-purple-600/20 text-violet-300 border-violet-500/30',
    ];
    return colorPairs[Math.abs(hash) % colorPairs.length];
  }, [org]);

  return (
    <div className={`w-6 h-6 rounded-md overflow-hidden shrink-0 flex items-center justify-center relative border font-mono text-[9px] font-bold bg-gradient-to-br transition-all duration-300 ${imgFailed ? gradient : 'bg-black/30 border-white/[0.08] text-white/50'}`}>
      {!imgFailed && (
        <img
          src={src}
          alt={org}
          onError={handleError}
          className="w-full h-full object-cover relative z-10"
          loading="lazy"
        />
      )}
      <span className="absolute inset-0 flex items-center justify-center pointer-events-none select-none z-0">
        {initials}
      </span>
    </div>
  );
}

export function ModelCard({ model, onSelect }: ModelCardProps) {
  const modelId = model?.id || '';
  const tags = model?.tags || [];
  const { creator, name } = parseModelId(modelId);
  const params = getParameterCount(tags, model?.numParameters);
  const license = getLicense(tags);
  const format = getFormat(modelId, tags);
  const task = getTask(model?.pipeline_tag, tags);
  const isGated = Boolean(model?.gated) && model?.gated !== 'false';
  const relTime = getRelativeTime(model?.last_modified);

  const formatStyle = getFormatStyle(format);
  const taskStyle = task ? getTaskStyle(task) : '';

  return (
    <button
      onClick={() => onSelect(model.id)}
      className="group relative flex flex-col text-left w-full h-full justify-between rounded-xl border border-white/[0.05] bg-gradient-to-b from-zinc-900/30 to-zinc-950/60 hover:border-white/[0.16] hover:from-zinc-900/50 hover:to-zinc-950/85 transition-all duration-300 overflow-hidden p-5 gap-4 shadow-sm hover:shadow-md hover:shadow-violet-500/[0.005]"
      aria-label={`View ${model.id}`}
    >
      {/* Top Header Row — Creator / Format */}
      <div className="flex items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-2 min-w-0">
          <HfAvatar org={creator} avatarUrl={model.authorData?.avatarUrl} />
          <span className="text-[10px] font-mono text-zinc-400 group-hover:text-zinc-200 transition-colors truncate tracking-wider uppercase">
            {creator}
          </span>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {isGated && (
            <span title="Gated model" className="p-1 bg-amber-500/10 border border-amber-500/20 rounded">
              <Lock size={10} weight="fill" className="text-amber-400" />
            </span>
          )}
          <span className={`text-[9px] font-bold font-mono px-2 py-0.5 rounded-full border transition-transform duration-300 group-hover:scale-[1.03] ${formatStyle}`}>
            {format}
          </span>
        </div>
      </div>

      {/* Model Name */}
      <div className="flex-1 min-w-0 flex flex-col justify-center">
        <h3 className="text-[13px] font-bold text-zinc-100 group-hover:text-white tracking-tight leading-snug transition-colors break-words">
          {name}
        </h3>
      </div>

      {/* Metadata tags */}
      <div className="flex flex-wrap gap-1.5 items-center">
        {task && (
          <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[9px] font-semibold border leading-none uppercase tracking-wider font-mono ${taskStyle}`}>
            {task}
          </span>
        )}
        {params && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono bg-white/[0.03] text-zinc-400 border border-white/[0.05] leading-none group-hover:border-white/[0.08] transition-colors">
            <Database size={9} className="text-violet-400/80 group-hover:text-violet-400 transition-colors" /> {params}
          </span>
        )}
        {license && (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono bg-white/[0.03] text-zinc-500 border border-white/[0.05] leading-none group-hover:border-white/[0.08] transition-colors">
            <Scales size={9} className="text-amber-400/70 group-hover:text-amber-400 transition-colors" /> {license}
          </span>
        )}
      </div>

      {/* Footer statistics */}
      <div className="flex items-center gap-4 text-[10px] text-zinc-500 font-mono border-t border-white/[0.05] pt-3 w-full shrink-0">
        <span className="flex items-center gap-1 shrink-0" title="Downloads">
          <ArrowDown size={11} className="text-zinc-400 group-hover:text-sky-400 transition-colors" />
          <span className="tabular-nums text-zinc-400 group-hover:text-zinc-300 transition-colors">{formatCount(model.downloads)}</span>
        </span>
        <span className="flex items-center gap-1 shrink-0" title="Likes">
          <Heart size={11} className="text-zinc-400 group-hover:text-pink-500 transition-colors" weight="fill" />
          <span className="tabular-nums text-zinc-400 group-hover:text-zinc-300 transition-colors">{formatCount(model.likes)}</span>
        </span>
        {relTime && (
          <span className="ml-auto flex items-center gap-1 text-[9px] shrink-0 truncate text-zinc-600 group-hover:text-zinc-500 transition-colors" title="Last updated">
            <Clock size={10} className="text-zinc-600 group-hover:text-zinc-500 transition-colors" />
            {relTime.replace('Updated ', '')}
          </span>
        )}
      </div>
    </button>
  );
}
