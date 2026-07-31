// src/features/hf-explorer/components/DownloadRow.tsx
import React from 'react';
import { Pause, Play, X, ArrowClockwise } from '@phosphor-icons/react';
import { formatSize, formatEta, formatSpeed } from '../lib/utils';
import type { DownloadState } from '../types';

interface DownloadRowProps {
  modelId: string;
  download: DownloadState;
  onPause: () => void;
  onResume: () => void;
  onCancel: () => void;
}

export function DownloadRow({ modelId, download, onPause, onResume, onCancel }: DownloadRowProps) {
  const displayName = modelId.split('/').pop() ?? modelId;
  
  // Detect if this is a companion/support file download (not a loadable model)
  const lName = displayName.toLowerCase();
  const isCompanion = lName === 'ae.safetensors' || lName === 'vae.safetensors' ||
    lName.startsWith('clip_l') || lName.startsWith('clip_g') || lName.startsWith('t5xxl') || lName.startsWith('t5-xxl');


  const progressBarColor =
    download.status === 'error'
      ? 'bg-red-500/80'
      : download.status === 'completed'
        ? 'bg-emerald-500/80'
        : download.status === 'paused'
          ? 'bg-amber-500/80'
          : 'bg-white';

  return (
    <div className="flex flex-col gap-1.5 px-4 py-2.5 bg-black border border-white/[0.06] rounded-xl">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="text-xs font-semibold truncate text-white" title={modelId}>
            {displayName}
          </span>
          {isCompanion && (
            <span className="text-[8px] font-bold text-violet-400 bg-violet-500/10 border border-violet-500/20 px-1.5 py-0.5 rounded shrink-0">
              Companion
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[10px] text-[#71717a] tabular-nums flex items-center gap-2">
            {download.status === 'error' ? (
              <span className="text-red-400 font-semibold truncate max-w-[200px]" title={download.error}>
                {download.error || 'Download error'}
              </span>
            ) : download.status === 'completed' ? (
              <span className="text-emerald-400 font-semibold">Done</span>
            ) : (
              <>
                <span>
                  {formatSize(download.downloaded)} / {formatSize(download.total)} · {download.progress.toFixed(0)}%
                </span>
                {download.status === 'downloading' && (download.speed || download.eta) && (
                  <span className="text-[#52525b]">
                    ({download.speed ? formatSpeed(download.speed) : ''}
                    {download.speed && download.eta ? ' · ' : ''}
                    {download.eta ? formatEta(download.eta) : ''})
                  </span>
                )}
              </>
            )}
          </span>

          {download.status === 'paused' && (
            <button
              onClick={onResume}
              className="p-1 hover:bg-white/[0.08] rounded-md transition-colors text-emerald-400"
              aria-label="Resume download"
              title="Resume download"
            >
              <Play size={12} weight="fill" />
            </button>
          )}

          {download.status === 'error' && (
            <button
              onClick={onResume}
              className="p-1 hover:bg-white/[0.08] rounded-md transition-colors text-emerald-400 flex items-center gap-1 text-[10px] font-bold border border-emerald-500/25 bg-emerald-500/5 px-2 py-0.5"
              aria-label="Retry download"
              title="Retry download"
            >
              <ArrowClockwise size={11} weight="bold" />
              <span>Retry</span>
            </button>
          )}

          {download.status === 'downloading' && (
            <button
              onClick={onPause}
              className="p-1 hover:bg-white/[0.08] rounded-md transition-colors text-amber-400"
              aria-label="Pause download"
              title="Pause download"
            >
              <Pause size={12} weight="fill" />
            </button>
          )}

          <button
            onClick={onCancel}
            className="p-1 hover:bg-white/[0.08] rounded-md transition-colors text-[#52525b] hover:text-red-400"
            aria-label="Dismiss or cancel download"
            title="Dismiss / Cancel download"
          >
            <X size={12} weight="bold" />
          </button>
        </div>
      </div>

      <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${progressBarColor}`}
          style={{ width: `${Math.max(download.progress, download.status === 'error' ? 100 : 0)}%` }}
          role="progressbar"
          aria-valuenow={download.progress}
          aria-valuemin={0}
          aria-valuemax={100}
        />
      </div>
    </div>
  );
}
