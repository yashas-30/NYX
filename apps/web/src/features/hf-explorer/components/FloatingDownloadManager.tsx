// src/features/hf-explorer/components/FloatingDownloadManager.tsx
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  DownloadSimple,
  CheckCircle,
  Pause,
  Play,
  X,
  WarningCircle,
  Trash,
} from '@phosphor-icons/react';
import { useDownloadActions } from '../hooks/useHfDownloads';
import { formatSize, formatSpeed, formatEta } from '../lib/utils';
import type { DownloadState } from '../types';

interface FloatingDownloadManagerProps {
  downloads: Record<string, DownloadState>;
}

export const FloatingDownloadManager: React.FC<FloatingDownloadManagerProps> = ({ downloads }) => {
  const [isOpen, setIsOpen] = useState(false);
  const { handlePause, handleResume, handleCancel } = useDownloadActions();

  const downloadEntries = Object.entries(downloads).filter(([_, dl]) => dl && dl.status);

  if (downloadEntries.length === 0) {
    return null;
  }

  const activeCount = downloadEntries.filter(
    ([_, dl]) => dl.status === 'downloading' || dl.status === 'paused'
  ).length;
  const completedCount = downloadEntries.filter(([_, dl]) => dl.status === 'completed').length;
  const isAnyDownloading = downloadEntries.some(([_, dl]) => dl.status === 'downloading');

  const totalSpeed = downloadEntries
    .filter(([_, dl]) => dl.status === 'downloading')
    .reduce((acc, [_, dl]) => acc + (dl.speed || 0), 0);

  const overallProgress = Math.round(
    downloadEntries.reduce((acc, [_, dl]) => acc + (dl.progress || 0), 0) / downloadEntries.length
  );

  return (
    <div className="fixed bottom-6 right-6 z-50 select-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-14 right-0 w-[380px] max-w-[calc(100vw-32px)] bg-[#09090b] border border-white/10 rounded-2xl shadow-2xl shadow-black/95 p-4 flex flex-col gap-3 backdrop-blur-2xl"
            style={{
              boxShadow: '0 20px 50px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.08)',
            }}
          >
            {/* Header */}
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-2">
                <DownloadSimple size={15} weight="bold" className="text-primary" />
                <span className="text-[13px] font-bold text-foreground tracking-wide">
                  Downloads
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/10 text-muted-foreground font-semibold">
                  {downloadEntries.length}
                </span>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-white/10 transition-colors cursor-pointer"
                aria-label="Close download popover"
              >
                <X size={14} weight="bold" />
              </button>
            </div>

            {/* List of active/completed downloads */}
            <div className="flex flex-col gap-2.5 max-h-[320px] overflow-y-auto custom-scrollbar pr-1">
              {downloadEntries.map(([key, dl]) => {
                const parts = key.split('/');
                const filename = parts.pop() || key;
                const repo = parts.join('/');
                const isComplete = dl.status === 'completed';
                const isPaused = dl.status === 'paused';
                const isError = dl.status === 'error';

                return (
                  <div
                    key={key}
                    className="p-3 rounded-xl bg-[#121214] border border-white/5 flex flex-col gap-2 transition-all hover:border-white/15"
                  >
                    {/* File info row */}
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div
                          className="text-[12px] font-bold text-foreground truncate font-mono"
                          title={filename}
                        >
                          {filename}
                        </div>
                        {repo && (
                          <div
                            className="text-[10px] text-muted-foreground/60 truncate"
                            title={repo}
                          >
                            {repo}
                          </div>
                        )}
                      </div>

                      {/* Action buttons */}
                      <div className="flex items-center gap-1 shrink-0">
                        {!isComplete && (
                          <button
                            onClick={() => (isPaused ? handleResume(key) : handlePause(key))}
                            className="p-1 rounded hover:bg-white/10 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                            title={isPaused ? 'Resume' : 'Pause'}
                          >
                            {isPaused ? (
                              <Play size={12} weight="fill" />
                            ) : (
                              <Pause size={12} weight="fill" />
                            )}
                          </button>
                        )}
                        <button
                          onClick={() => handleCancel(key)}
                          className="p-1 rounded hover:bg-red-500/20 text-muted-foreground hover:text-red-400 transition-colors cursor-pointer"
                          title="Cancel & Remove"
                        >
                          <X size={12} weight="bold" />
                        </button>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 rounded-full ${
                          isComplete
                            ? 'bg-emerald-500'
                            : isError
                              ? 'bg-red-500'
                              : isPaused
                                ? 'bg-amber-500'
                                : 'bg-primary'
                        }`}
                        style={{ width: `${Math.min(100, Math.max(0, dl.progress))}%` }}
                      />
                    </div>

                    {/* Stats and status row */}
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground font-mono">
                      <span>
                        {dl.total > 0
                          ? `${formatSize(dl.downloaded)} / ${formatSize(dl.total)} (${Math.round(
                              dl.progress
                            )}%)`
                          : `${Math.round(dl.progress)}%`}
                      </span>

                      <div className="flex items-center gap-1">
                        {isComplete ? (
                          <span className="flex items-center gap-1 text-emerald-400 font-semibold">
                            <CheckCircle size={11} weight="fill" />
                            Complete
                          </span>
                        ) : isError ? (
                          <span className="flex items-center gap-1 text-red-400 font-semibold truncate max-w-[120px]">
                            <WarningCircle size={11} weight="fill" />
                            {dl.error || 'Failed'}
                          </span>
                        ) : isPaused ? (
                          <span className="text-amber-400 font-semibold">Paused</span>
                        ) : (
                          <div className="flex items-center gap-1.5 text-right font-mono">
                            {dl.speed ? (
                              <span className="text-foreground/90 font-medium">
                                {formatSpeed(dl.speed)}
                              </span>
                            ) : null}
                            {dl.eta && dl.eta > 0 ? (
                              <span className="text-muted-foreground/70">
                                · {formatEta(dl.eta)}
                              </span>
                            ) : (
                              !dl.speed && (
                                <span className="text-primary font-semibold animate-pulse">
                                  Downloading...
                                </span>
                              )
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Clear completed footer */}
            {completedCount > 0 && activeCount === 0 && (
              <div className="pt-1 border-t border-white/5 flex justify-end">
                <button
                  onClick={() => {
                    for (const [key, dl] of downloadEntries) {
                      if (dl.status === 'completed') {
                        handleCancel(key);
                      }
                    }
                    setIsOpen(false);
                  }}
                  className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-white/10 transition-all cursor-pointer"
                >
                  <Trash size={11} />
                  <span>Dismiss All</span>
                </button>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Floating Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-2.5 px-4 py-2.5 rounded-full shadow-2xl border transition-all cursor-pointer ${
          isAnyDownloading
            ? 'bg-[#121214] border-primary/40 text-primary hover:border-primary shadow-primary/20'
            : 'bg-[#121214] border-white/15 text-foreground hover:border-white/30 shadow-black/90'
        }`}
        style={{
          boxShadow: isAnyDownloading
            ? '0 8px 32px rgba(59, 130, 246, 0.25), 0 0 1px 1px rgba(255, 255, 255, 0.1)'
            : '0 8px 32px rgba(0, 0, 0, 0.8), 0 0 1px 1px rgba(255, 255, 255, 0.1)',
        }}
        title="Active Downloads"
      >
        <div className="relative flex items-center justify-center">
          {completedCount > 0 && activeCount === 0 ? (
            <CheckCircle size={16} weight="fill" className="text-emerald-400" />
          ) : (
            <DownloadSimple
              size={16}
              weight="bold"
              className={isAnyDownloading ? 'animate-bounce text-primary' : 'text-muted-foreground'}
            />
          )}
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[12px] font-bold font-mono tracking-tight text-foreground">
            {completedCount > 0 && activeCount === 0 ? 'Complete' : `${overallProgress}%`}
          </span>

          {isAnyDownloading && totalSpeed > 0 && (
            <span className="text-[10px] font-mono text-primary font-semibold">
              {formatSpeed(totalSpeed)}
            </span>
          )}

          <span
            className={`text-[9px] font-bold font-mono px-1.5 py-0.2 rounded-full ${
              isAnyDownloading
                ? 'bg-primary text-primary-foreground'
                : 'bg-white/10 text-muted-foreground'
            }`}
          >
            {downloadEntries.length}
          </span>
        </div>
      </motion.button>
    </div>
  );
};
