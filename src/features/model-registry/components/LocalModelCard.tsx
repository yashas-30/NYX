// fallow-ignore-file code-duplication
import React from 'react';
import { motion } from 'motion/react';
import {
  Download,
  Loader2,
  Play,
  Square,
  Terminal as TerminalIcon,
  Trash2,
  AlertCircle,
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { LocalModelPreset } from '@src/types';

interface LocalModelCardProps {
  m: LocalModelPreset;
  activeNativeId: string | null;
  compatibility: any;
  actionInProgress: string | null;
  handleDownload: (modelId: string, quantization?: string) => Promise<void>;
  handlePause: (modelId: string) => Promise<void>;
  handleResume: (modelId: string) => Promise<void>;
  handleCancel: (modelId: string) => Promise<void>;
  handleRun: (modelId: string) => Promise<void>;
  handleStop: (modelId: string) => Promise<void>;
  handleDelete: (modelId: string, modelName: string) => Promise<void>;
  selectModel?: (modelId: string) => void;
  isComparing?: boolean;
  toggleCompare?: () => void;
}

export const LocalModelCard: React.FC<LocalModelCardProps> = ({
  m,
  activeNativeId,
  compatibility,
  actionInProgress,
  handleDownload,
  handlePause,
  handleResume,
  handleCancel,
  handleRun,
  handleStop,
  handleDelete,
  selectModel,
  isComparing = false,
  toggleCompare,
}) => {
  const isResident = activeNativeId === m.id;
  const isDownloading = m.status === 'downloading';
  const isPaused = m.status === 'paused';
  const isCompleted = m.status === 'completed';
  const isIdle = m.status === 'idle' || m.status === 'failed';
  const progress = m.progress || {
    progressPercentage: 0,
    speedMbps: 0,
    bytesDownloaded: 0,
    totalBytes: 0,
  };
  const isCurrentAction = actionInProgress === m.id;

  const [selectedQuant, setSelectedQuant] = React.useState(m.quantization || 'Q4_K_M');

  // Retrieve compatibility projection details from state
  const compat = compatibility?.presetsCompatibility?.find((c: any) => c.modelId === m.id);
  const meetsRam = compat ? compat.isCompatible : true;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`
        group relative p-4 rounded-2xl border border-solid flex flex-col justify-between gap-3 overflow-hidden shadow-sm backdrop-blur-md transition-all duration-300
        ${
          isResident
            ? 'bg-card border-accent/40 shadow-[0_0_20px_rgba(var(--accent-rgb),0.08)]'
            : !meetsRam
              ? 'bg-card border-destructive/10 opacity-70 hover:opacity-100 hover:border-destructive/25 transition-all'
              : 'bg-card border-border hover:border-accent/30 hover:bg-secondary/35'
        }
      `}
    >
      <div>
        {/* Presets badges */}
        <div className="flex items-center justify-between mb-2">
          <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
            NYX Native
          </span>
          <div className="flex items-center gap-1.5">
            {compat && (
              <span
                className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${
                  !meetsRam
                    ? 'bg-destructive/10 text-destructive border-destructive/20'
                    : compat.speedClass === 'fast'
                      ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
                      : compat.speedClass === 'moderate'
                        ? 'bg-amber-500/10 text-accent border-amber-500/20'
                        : 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
                }`}
              >
                {!meetsRam
                  ? 'Low Memory'
                  : compat.speedClass === 'fast'
                    ? 'GPU Offload'
                    : compat.speedClass === 'moderate'
                      ? 'Hybrid Speed'
                      : 'CPU Speed'}
              </span>
            )}
            {isResident && (
              <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                Resident RAM
              </span>
            )}
            {isCompleted && !isResident && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 dark:text-zinc-300 border border-zinc-500/20">
                Ready
              </span>
            )}
            {isDownloading && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20 animate-pulse">
                Downloading
              </span>
            )}
            {isPaused && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Paused
              </span>
            )}
            {/* Compare Checkbox Toggle */}
            {toggleCompare && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  toggleCompare();
                }}
                className={`ml-1 flex items-center justify-center w-5 h-5 rounded-md border transition-all ${
                  isComparing
                    ? 'bg-accent border-accent text-accent-foreground'
                    : 'bg-secondary/40 border-border text-transparent hover:border-accent/40 hover:text-accent/20'
                }`}
                title="Select for comparison"
              >
                <svg
                  width="10"
                  height="10"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </button>
            )}
          </div>
        </div>

        <h4 className="text-[12px] font-black tracking-tight text-foreground group-hover:text-accent transition-colors">
          {m.name}
        </h4>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium mt-1">
          {m.description}
        </p>

        {/* Technical attributes */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-border/30">
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
              GGUF File Size
            </span>
            <span className="text-[10px] font-mono font-extrabold text-foreground/80">
              {m.size}
            </span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
              RAM / VRAM Required
            </span>
            <span className="text-[10px] font-mono font-extrabold text-accent/90">
              {m.vramRequired ? `${m.vramRequired} + ` : ''}
              {m.ramRequired}
            </span>
          </div>
        </div>

        {m.metadata && (
          <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border/10">
            <div className="grid grid-cols-3 gap-2">
              <div className="flex flex-col items-center p-1.5 rounded-lg bg-secondary/20">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                  MMLU
                </span>
                <span className="text-[10px] font-mono font-bold text-foreground">
                  {m.metadata.mmluScore || '--'}
                </span>
              </div>
              <div className="flex flex-col items-center p-1.5 rounded-lg bg-secondary/20">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                  HumanEval
                </span>
                <span className="text-[10px] font-mono font-bold text-foreground">
                  {m.metadata.humanEvalScore || '--'}
                </span>
              </div>
              <div className="flex flex-col items-center p-1.5 rounded-lg bg-secondary/20">
                <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                  MT-Bench
                </span>
                <span className="text-[10px] font-mono font-bold text-foreground">
                  {m.metadata.mtBenchScore || '--'}
                </span>
              </div>
            </div>
            {m.metadata.ggufMetadata && (
              <div className="grid grid-cols-2 gap-2 mt-1">
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-accent/5 border border-accent/10">
                  <span className="text-[8px] font-black uppercase tracking-widest text-accent">
                    Architecture
                  </span>
                  <span className="text-[10px] font-mono font-bold text-foreground">
                    {m.metadata.ggufMetadata.architecture || '--'}
                  </span>
                </div>
                <div className="flex flex-col items-center p-1.5 rounded-lg bg-accent/5 border border-accent/10">
                  <span className="text-[8px] font-black uppercase tracking-widest text-accent">
                    Context
                  </span>
                  <span className="text-[10px] font-mono font-bold text-foreground">
                    {m.metadata.ggufMetadata.contextLength
                      ? `${m.metadata.ggufMetadata.contextLength / 1024}k`
                      : '--'}
                  </span>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Hardware Offload projection for downloaded library models */}
        {compat && (
          <div
            className={`mt-2.5 p-2 rounded-xl border text-[9px] ${
              !meetsRam
                ? 'bg-destructive/5 border-destructive/10 text-destructive'
                : compat.speedClass === 'fast'
                  ? 'bg-emerald-500/5 border-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                  : compat.speedClass === 'moderate'
                    ? 'bg-accent/5 border-accent/10 text-accent/90'
                    : 'bg-zinc-500/5 border-border text-zinc-400'
            }`}
          >
            <div className="flex items-center justify-between font-bold uppercase tracking-wider pb-1 mb-1 border-b border-border text-[8px]">
              <span>Hardware projection</span>
              <span
                className={
                  !meetsRam
                    ? 'text-destructive'
                    : compat.speedClass === 'fast'
                      ? 'text-emerald-400'
                      : compat.speedClass === 'moderate'
                        ? 'text-accent'
                        : 'text-zinc-500'
                }
              >
                {compat.speedClass.toUpperCase()}
              </span>
            </div>
            <p className="leading-relaxed font-semibold text-foreground/85">
              {compat.gpuLayers}/{compat.totalLayers} layers in VRAM ({compat.offloadRatio}%) • RAM:{' '}
              {compat.estimatedRamUsageGB}GB • VRAM: {compat.estimatedVramUsageGB}GB
            </p>
          </div>
        )}
      </div>

      {/* Interactive operations panel */}
      <div className="mt-2.5 pt-2.5 border-t border-border/30">
        {isDownloading && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>{progress.progressPercentage}% Completed</span>
              <span>{progress.speedMbps > 0 ? `${progress.speedMbps} MB/s` : 'Connecting...'}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full bg-accent"
                style={{ width: `${progress.progressPercentage}%` }}
                initial={{ width: '0%' }}
                animate={{ width: `${progress.progressPercentage}%` }}
                transition={{ duration: 0.3 }}
              />
            </div>
            <div className="text-[10px] font-medium text-muted-foreground/80 text-right">
              {progress.totalBytes > 0
                ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB / ${(progress.totalBytes / (1024 * 1024)).toFixed(0)} MB`
                : 'Negotiating HTTP download streams...'}
            </div>
            {/* Pause + Cancel */}
            <div className="flex gap-1.5 pt-0.5">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handlePause(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                  <rect x="1" y="1" width="3" height="8" rx="1" />
                  <rect x="6" y="1" width="3" height="8" rx="1" />
                </svg>
                Pause
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleCancel(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-all cursor-pointer"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 9 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <line x1="1" y1="1" x2="8" y2="8" />
                  <line x1="8" y1="1" x2="1" y2="8" />
                </svg>
                Cancel
              </motion.button>
            </div>
          </div>
        )}

        {isPaused && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>{progress.progressPercentage}% — Paused</span>
              <span className="text-amber-400 font-bold">
                {progress.totalBytes > 0
                  ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB saved`
                  : ''}
              </span>
            </div>
            <div className="w-full h-1 rounded-full bg-secondary overflow-hidden">
              <div
                className="h-full bg-amber-400"
                style={{ width: `${progress.progressPercentage}%` }}
              />
            </div>
            {/* Resume + Cancel */}
            <div className="flex gap-1.5 pt-0.5">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleResume(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-accent/10 hover:bg-accent/20 text-accent border border-accent/20 hover:border-accent/40 transition-all cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                  <polygon points="2,1 9,5 2,9" />
                </svg>
                Resume
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleCancel(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 transition-all cursor-pointer"
              >
                <svg
                  width="9"
                  height="9"
                  viewBox="0 0 9 9"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <line x1="1" y1="1" x2="8" y2="8" />
                  <line x1="8" y1="1" x2="1" y2="8" />
                </svg>
                Cancel
              </motion.button>
            </div>
          </div>
        )}

        {m.status === 'failed' && (
          <div className="p-2 mb-2 rounded-lg bg-destructive/10 border border-destructive/20 text-[10px] font-semibold text-destructive flex items-start gap-1.5">
            <AlertCircle size={10} className="shrink-0 mt-0.5" />
            <span>{progress.error || 'Download failed. Please check network connections.'}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5 mt-1">
          {isIdle && (
            <div className="flex gap-2">
              <select
                value={selectedQuant}
                onChange={(e) => setSelectedQuant(e.target.value)}
                disabled={isCurrentAction || !!actionInProgress}
                className="bg-secondary text-accent text-[10px] font-bold tracking-wider rounded-xl border border-border px-2 outline-none cursor-pointer w-24"
              >
                <option value="Q2_K">Q2_K</option>
                <option value="Q4_K_M">Q4_K_M</option>
                <option value="Q5_K_M">Q5_K_M</option>
                <option value="Q6_K">Q6_K</option>
                <option value="Q8_0">Q8_0</option>
              </select>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleDownload(m.id, selectedQuant)}
                disabled={isCurrentAction || !!actionInProgress}
                className="
                  flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                  bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg disabled:opacity-40 cursor-pointer
                "
              >
                {isCurrentAction ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    <span>Initiating...</span>
                  </>
                ) : (
                  <>
                    <Download size={10} />
                    <span>Download Direct to NYX</span>
                  </>
                )}
              </motion.button>
            </div>
          )}

          {isCompleted && !isResident && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => handleRun(m.id)}
              disabled={isCurrentAction || !!actionInProgress}
              className="
                w-full py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                bg-emerald-600 hover:bg-emerald-500 text-white shadow-lg disabled:opacity-40 cursor-pointer
              "
            >
              {isCurrentAction ? (
                <>
                  <Loader2 size={10} className="animate-spin" />
                  <span>Loading in Memory...</span>
                </>
              ) : (
                <>
                  <Play size={10} />
                  <span>Load in Resident RAM</span>
                </>
              )}
            </motion.button>
          )}

          {isResident && (
            <div className="flex gap-2">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleStop(m.id)}
                disabled={isCurrentAction || !!actionInProgress}
                className="
                  flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                  bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 disabled:opacity-40 cursor-pointer
                "
              >
                {isCurrentAction ? (
                  <>
                    <Loader2 size={10} className="animate-spin" />
                    <span>Evicting...</span>
                  </>
                ) : (
                  <>
                    <Square size={10} />
                    <span>Unload RAM</span>
                  </>
                )}
              </motion.button>

              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => {
                  selectModel?.(m.id);
                  toast.success(`NYX Chatbot active model is now ${m.name}`);
                }}
                className="
                  flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                  bg-accent hover:bg-accent/90 text-accent-foreground shadow-lg cursor-pointer
                "
              >
                <TerminalIcon size={10} />
                <span>Chat Now</span>
              </motion.button>
            </div>
          )}

          {/* Delete button — only show when downloaded and not currently downloading */}
          {(isCompleted || isResident) && (
            <motion.button
              whileTap={{ scale: 0.95 }}
              onClick={() => handleDelete(m.id, m.name)}
              disabled={isCurrentAction || !!actionInProgress}
              className="
                w-full py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all mt-1
                bg-destructive/10 hover:bg-destructive/20 text-destructive border border-destructive/20 disabled:opacity-40 cursor-pointer
              "
            >
              <Trash2 size={9} />
              <span>Delete from Disk</span>
            </motion.button>
          )}
        </div>
      </div>
    </motion.div>
  );
};
