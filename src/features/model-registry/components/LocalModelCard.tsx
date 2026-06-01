import React from 'react';
import { motion } from 'motion/react';
import { Download, Loader2, Play, Square, Terminal as TerminalIcon, Trash2, AlertCircle } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

interface LocalModelCardProps {
  m: any;
  activeNativeId: string | null;
  compatibility: any;
  actionInProgress: string | null;
  handleDownload: (modelId: string) => Promise<void>;
  handlePause: (modelId: string) => Promise<void>;
  handleResume: (modelId: string) => Promise<void>;
  handleCancel: (modelId: string) => Promise<void>;
  handleRun: (modelId: string) => Promise<void>;
  handleStop: (modelId: string) => Promise<void>;
  handleDelete: (modelId: string, modelName: string) => Promise<void>;
  selectModel?: (modelId: string) => void;
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
}) => {
  const isResident = activeNativeId === m.id;
  const isDownloading = m.status === 'downloading';
  const isPaused = m.status === 'paused';
  const isCompleted = m.status === 'completed';
  const isIdle = m.status === 'idle' || m.status === 'failed';
  const progress = m.progress || { progressPercentage: 0, speedMbps: 0, bytesDownloaded: 0, totalBytes: 0 };
  const isCurrentAction = actionInProgress === m.id;

  // Retrieve compatibility projection details from state
  const compat = compatibility?.presetsCompatibility?.find((c: any) => c.modelId === m.id);
  const meetsRam = compat ? compat.isCompatible : true;

  return (
    <motion.div
      whileHover={{ y: -2, scale: 1.01 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className={`
        group relative p-4 rounded-2xl border border-solid flex flex-col justify-between gap-3 overflow-hidden shadow-sm backdrop-blur-md transition-all duration-300
        ${isResident
          ? 'bg-card border-[#FF3366]/45 shadow-[0_0_20px_rgba(34,211,238,0.08)]'
          : !meetsRam
            ? 'bg-card border-red-500/10 opacity-70 hover:opacity-100 hover:border-red-500/25 transition-all'
            : 'bg-card border border-white/[0.04] hover:border-[#FF3366]/30 hover:bg-[#4A5059]'
        }
      `}
    >
      <div>
        {/* Presets badges */}
        <div className="flex items-center justify-between mb-2">
          <span className="inline-block text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF3366]/10 text-[#FF3366] border border-[#FF3366]/20">
            NYX Native
          </span>
          <div className="flex items-center gap-1.5">
            {compat && (
              <span className={`text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border shrink-0 ${
                !meetsRam ? 'bg-red-500/10 text-red-400 border-red-500/20' :
                compat.speedClass === 'fast' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' :
                compat.speedClass === 'moderate' ? 'bg-amber-500/10 text-[#FF3366] border-amber-500/20' :
                'bg-zinc-500/10 text-zinc-400 border-zinc-500/20'
              }`}>
                {!meetsRam ? 'Low Memory' : compat.speedClass === 'fast' ? 'GPU Offload' : compat.speedClass === 'moderate' ? 'Hybrid Speed' : 'CPU Speed'}
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
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF3366]/10 text-[#FF3366] border border-[#FF3366]/20 animate-pulse">
                Downloading
              </span>
            )}
            {isPaused && (
              <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                Paused
              </span>
            )}
          </div>
        </div>

        <h4 className="text-[12px] font-black tracking-tight text-foreground group-hover:text-[#FF3366] transition-colors">
          {m.name}
        </h4>
        <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium mt-1">
          {m.description}
        </p>

        {/* Technical attributes */}
        <div className="grid grid-cols-2 gap-2 mt-3 pt-2.5 border-t border-border/30">
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">GGUF File Size</span>
            <span className="text-[10px] font-mono font-extrabold text-foreground/80">{m.size}</span>
          </div>
          <div className="flex flex-col">
            <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">RAM / VRAM Required</span>
            <span className="text-[10px] font-mono font-extrabold text-[#FF3366]/90">{m.vramRequired ? `${m.vramRequired} + ` : ''}{m.ramRequired}</span>
          </div>
        </div>

        {/* Hardware Offload projection for downloaded library models */}
        {compat && (
          <div className={`mt-2.5 p-2 rounded-xl border text-[9px] ${
            !meetsRam 
              ? 'bg-red-500/5 border-red-500/10 text-red-400' 
              : compat.speedClass === 'fast'
                ? 'bg-emerald-500/5 border-emerald-500/10 text-zinc-300'
                : compat.speedClass === 'moderate'
                  ? 'bg-[#FF3366]/5 border-[#FF3366]/10 text-zinc-300'
                  : 'bg-zinc-500/5 border-white/[0.03] text-zinc-400'
          }`}>
            <div className="flex items-center justify-between font-bold uppercase tracking-wider pb-1 mb-1 border-b border-white/[0.04] text-[8px]">
              <span>Hardware projection</span>
              <span className={
                !meetsRam ? 'text-red-400' :
                compat.speedClass === 'fast' ? 'text-emerald-400' :
                compat.speedClass === 'moderate' ? 'text-[#FF3366]' : 'text-zinc-500'
              }>
                {compat.speedClass.toUpperCase()}
              </span>
            </div>
            <p className="leading-relaxed font-semibold text-foreground/85">
              {compat.gpuLayers}/{compat.totalLayers} layers in VRAM ({compat.offloadRatio}%) • RAM: {compat.estimatedRamUsageGB}GB • VRAM: {compat.estimatedVramUsageGB}GB
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
            <div className="w-full h-1 rounded-full bg-black/20 dark:bg-white/5 overflow-hidden">
              <motion.div
                className="h-full bg-gradient-to-r from-[#FF3366] to-[#FF3366]/80"
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
                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><rect x="1" y="1" width="3" height="8" rx="1"/><rect x="6" y="1" width="3" height="8" rx="1"/></svg>
                Pause
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleCancel(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-red-500/8 hover:bg-red-500/18 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 transition-all cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/></svg>
                Cancel
              </motion.button>
            </div>
          </div>
        )}

        {isPaused && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
              <span>{progress.progressPercentage}% — Paused</span>
              <span className="text-amber-400 font-bold">{progress.totalBytes > 0 ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB saved` : ''}</span>
            </div>
            <div className="w-full h-1 rounded-full bg-black/20 dark:bg-white/5 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-amber-400 to-amber-400/60"
                style={{ width: `${progress.progressPercentage}%` }}
              />
            </div>
            {/* Resume + Cancel */}
            <div className="flex gap-1.5 pt-0.5">
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleResume(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-[#FF3366]/10 hover:bg-[#FF3366]/20 text-[#FF3366] border border-[#FF3366]/20 hover:border-[#FF3366]/40 transition-all cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor"><polygon points="2,1 9,5 2,9"/></svg>
                Resume
              </motion.button>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={() => handleCancel(m.id)}
                className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-red-500/8 hover:bg-red-500/18 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 transition-all cursor-pointer"
              >
                <svg width="9" height="9" viewBox="0 0 9 9" fill="none" stroke="currentColor" strokeWidth="1.5"><line x1="1" y1="1" x2="8" y2="8"/><line x1="8" y1="1" x2="1" y2="8"/></svg>
                Cancel
              </motion.button>
            </div>
          </div>
        )}

        {m.status === 'failed' && (
          <div className="p-2 mb-2 rounded-lg bg-red-500/10 border border-red-500/20 text-[10px] font-semibold text-red-400 flex items-start gap-1.5">
            <AlertCircle size={10} className="shrink-0 mt-0.5" />
            <span>{progress.error || 'Download failed. Please check network connections.'}</span>
          </div>
        )}

        <div className="flex flex-col gap-1.5 mt-1">
          {isIdle && (
            <motion.button
              whileTap={{ scale: 0.96 }}
              onClick={() => handleDownload(m.id)}
              disabled={isCurrentAction || !!actionInProgress}
              className="
                w-full py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                bg-[#FF3366] hover:bg-[#FF3366]/90 text-black shadow-lg disabled:opacity-40 cursor-pointer
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
                  bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 disabled:opacity-40 cursor-pointer
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
                  bg-[#FF3366] hover:bg-[#FF3366]/90 text-black shadow-lg cursor-pointer
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
                bg-red-500/8 hover:bg-red-500/15 text-red-400/70 hover:text-red-400 border border-red-500/10 hover:border-red-500/25 disabled:opacity-40 cursor-pointer
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
