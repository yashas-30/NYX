import React, { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Download,
  X,
  AlertTriangle,
  MonitorPlay,
  Zap,
  Loader2,
  Play,
  Square,
  RefreshCcw,
  HardDrive,
  Cpu,
  Terminal as TerminalIcon,
  Activity,
  Layers,
  Check,
  Trash2,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { LocalModelPreset } from '@src/types';
import { getProviderLabel } from '@src/shared/components/ui/ProviderIcon';

interface DownloadModalProps {
  showDownloadModal: boolean;
  setShowDownloadModal: (val: boolean) => void;
  customUrl: string;
  setCustomUrl: (val: string) => void;
  handleCustomUrlDownload: () => void;
  compatibility: any;
  fetchCompatibility: () => void;
  loadingCompatibility: boolean;
  actionInProgress: string | null;
  handleAutoSetup: () => void;
  handleDownloadAllCompatible: () => void;
  showCompatibleOnly: boolean;
  setShowCompatibleOnly: (val: boolean) => void;
  groupedLocalPresets: [string, LocalModelPreset[]][];
  nativeModels: LocalModelPreset[];
  activeNativeId: string | null;
  handleDownload: (modelId: string) => Promise<void>;
  handlePause: (modelId: string) => Promise<void>;
  handleResume: (modelId: string) => Promise<void>;
  handleCancel: (modelId: string) => Promise<void>;
  handleDelete: (modelId: string, modelName: string) => Promise<void>;
}

export const DownloadModal: React.FC<DownloadModalProps> = ({
  showDownloadModal,
  setShowDownloadModal,
  customUrl,
  setCustomUrl,
  handleCustomUrlDownload,
  compatibility,
  fetchCompatibility,
  loadingCompatibility,
  actionInProgress,
  handleAutoSetup,
  handleDownloadAllCompatible,
  showCompatibleOnly,
  setShowCompatibleOnly,
  groupedLocalPresets,
  nativeModels,
  activeNativeId,
  handleDownload,
  handlePause,
  handleResume,
  handleCancel,
  handleDelete,
}) => {
  return (
    <AnimatePresence>
      {showDownloadModal && (
        <div className="fixed inset-0 z-[600] flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowDownloadModal(false)}
            className="absolute inset-0 bg-background/80 backdrop-blur-md cursor-pointer"
          />

          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 15 }}
            animate={{
              opacity: 1,
              scale: 1,
              y: 0,
              transition: { type: 'spring', stiffness: 350, damping: 30 },
            }}
            exit={{
              opacity: 0,
              scale: 0.95,
              y: 15,
              transition: { duration: 0.18, ease: 'easeOut' },
            }}
            className="relative w-full max-w-4xl bg-card border border-white/[0.04] rounded-3xl shadow-[0_30px_70px_rgba(0,0,0,0.6)] flex flex-col max-h-[90vh] overflow-hidden cursor-default z-[610]"
          >
            {/* Modal Header */}
            <div className="p-4 px-6 border-b border-white/[0.06] bg-white/[0.02] flex items-center justify-between shrink-0">
              <div>
                <h3 className="text-xs font-black tracking-[0.25em] text-[#FF3366] uppercase">
                  Local Model Directory
                </h3>
                <p className="text-[11px] font-medium text-muted-foreground/80 uppercase tracking-widest mt-0.5">
                  World's most popular open-source models — download &amp; run locally in NYX
                </p>
              </div>
              <motion.button
                whileTap={{ scale: 0.9 }}
                onClick={() => setShowDownloadModal(false)}
                className="p-1.5 rounded-xl text-muted-foreground/45 hover:text-foreground hover:bg-white/5 transition-all cursor-pointer"
              >
                <X size={14} />
              </motion.button>
            </div>

            {/* Custom GGUF URL Download Input */}
            <div className="px-6 py-3.5 border-b border-white/[0.06] bg-white/[0.01] flex flex-col sm:flex-row items-center gap-3 shrink-0">
              <div className="w-full sm:flex-1 relative">
                <input
                  type="text"
                  placeholder="Paste HuggingFace GGUF direct URL (e.g., https://huggingface.co/.../*.gguf)..."
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  className="w-full bg-background border border-border rounded-xl px-4 py-2 text-[10px] text-foreground focus:outline-none focus:border-[#FF3366]/50 transition-all placeholder:text-muted-foreground/35"
                />
              </div>
              <motion.button
                whileTap={{ scale: 0.96 }}
                onClick={handleCustomUrlDownload}
                disabled={actionInProgress !== null}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-[#FF3366] hover:bg-[#FF3366]/90 disabled:opacity-50 text-black text-[11px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-lg shrink-0"
              >
                Download URL
              </motion.button>
            </div>

            {/* Scrollable list grouped by provider */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
              {/* ── DEVICE HARDWARE & RECOMMENDATION CORE PANEL ── */}
              {compatibility && compatibility.specs && (
                <div className="relative p-5 rounded-3xl bg-card border border-white/[0.05] backdrop-blur-lg overflow-hidden shadow-2xl space-y-4">
                  {/* Glowing highlight */}
                  <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-[#FF3366]/20 to-transparent" />

                  {/* Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
                    <div className="flex items-center gap-2">
                      <Activity size={14} className="text-[#FF3366] animate-pulse" />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FF3366]">
                        Hardware Spec Profile
                      </h4>
                    </div>
                    <button
                      onClick={fetchCompatibility}
                      disabled={loadingCompatibility}
                      className="flex items-center gap-1 px-3 py-1 rounded-full bg-white/5 border border-white/5 hover:border-[#FF3366]/30 hover:bg-[#FF3366]/10 text-[9px] font-bold text-muted-foreground hover:text-foreground transition-all cursor-pointer disabled:opacity-40"
                    >
                      <RefreshCw size={8} className={loadingCompatibility ? 'animate-spin' : ''} />
                      <span>Rescan Specs</span>
                    </button>
                  </div>

                  {/* Hardware Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* CPU Stat Card */}
                    <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Cpu size={12} />
                        <span className="text-[8px] font-black uppercase tracking-wider">
                          Processor
                        </span>
                      </div>
                      <p className="text-[11px] font-extrabold text-foreground truncate">
                        {compatibility.specs.cpuModel}
                      </p>
                      <p className="text-[9px] font-mono text-[#FF3366]/80 font-bold uppercase tracking-wider">
                        {compatibility.specs.logicalCores} Logical Cores
                      </p>
                    </div>

                    {/* System RAM Card */}
                    <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <HardDrive size={12} />
                        <span className="text-[8px] font-black uppercase tracking-wider">
                          System Memory
                        </span>
                      </div>
                      <p className="text-[11px] font-extrabold text-foreground">
                        {compatibility.specs.totalRamGB} GB System RAM
                      </p>
                      <p className="text-[9px] font-mono text-[#FF3366]/80 font-bold uppercase tracking-wider">
                        Estimated Llama Overhead: ~0.5 GB
                      </p>
                    </div>

                    {/* GPU/VRAM Card */}
                    <div className="p-3.5 rounded-2xl bg-background border border-border space-y-1 hover:border-white/10 transition-colors">
                      <div className="flex items-center gap-1.5 text-zinc-500">
                        <Zap size={12} />
                        <span className="text-[8px] font-black uppercase tracking-wider">
                          Graphics Card
                        </span>
                      </div>
                      <p className="text-[11px] font-extrabold text-foreground truncate">
                        {compatibility.specs.gpus?.[0]?.model || 'Integrated Graphics'}
                      </p>
                      <p className="text-[9px] font-mono text-[#FF3366]/80 font-bold uppercase tracking-wider">
                        {compatibility.specs.maxVramGB > 0
                          ? `${compatibility.specs.maxVramGB} GB Dedicated VRAM`
                          : 'No dedicated VRAM detected'}
                      </p>
                    </div>
                  </div>

                  {/* Recommendation & Auto-Setup Banner */}
                  {(() => {
                    const recId = compatibility.recommendedModelId;
                    const recModel = nativeModels.find((nm) => nm.id === recId);
                    const recCompat = compatibility.presetsCompatibility?.find(
                      (c: any) => c.modelId === recId
                    );

                    return (
                      <div className="p-4 rounded-2xl bg-gradient-to-r from-[#FF3366]/10 via-[#FF3366]/5 to-transparent border border-[#FF3366]/15 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5">
                            <Sparkles size={12} className="text-[#FF3366] animate-pulse" />
                            <span className="text-[9px] font-black uppercase tracking-wider text-[#FF3366]">
                              AI Setup Optimization Engine
                            </span>
                          </div>
                          <h5 className="text-[12px] font-black text-foreground">
                            Recommended:{' '}
                            <span className="text-[#FF3366]">{recModel?.name || recId}</span>
                          </h5>
                          <p className="text-[10px] text-muted-foreground leading-relaxed max-w-xl font-medium">
                            {recCompat
                              ? `${recCompat.reason} Offloads ${recCompat.offloadRatio}% of layers to hardware VRAM for low-latency edge performance.`
                              : 'Optimal model matching your RAM & GPU specifications for seamless local coding logic.'}
                          </p>
                        </div>

                        <div className="flex flex-wrap items-center gap-2 shrink-0 w-full sm:w-auto">
                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleAutoSetup}
                            disabled={actionInProgress !== null}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#FF3366] hover:bg-[#FF3366]/90 text-black text-[10px] font-black uppercase tracking-wider cursor-pointer shadow-lg disabled:opacity-40"
                          >
                            {actionInProgress === 'auto-setup' ? (
                              <>
                                <Loader2 size={10} className="animate-spin" />
                                <span>Configuring...</span>
                              </>
                            ) : (
                              <>
                                <Zap size={10} />
                                <span>One-Click Auto-Setup</span>
                              </>
                            )}
                          </motion.button>

                          <motion.button
                            whileTap={{ scale: 0.96 }}
                            onClick={handleDownloadAllCompatible}
                            disabled={actionInProgress !== null}
                            className="flex-1 sm:flex-initial flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 text-muted-foreground hover:text-foreground text-[10px] font-black uppercase tracking-wider cursor-pointer transition-all disabled:opacity-40"
                          >
                            {actionInProgress === 'download-all-compatible' ? (
                              <>
                                <Loader2 size={10} className="animate-spin" />
                                <span>Starting Bulk...</span>
                              </>
                            ) : (
                              <span>Batch Download All Compatible</span>
                            )}
                          </motion.button>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              )}

              {/* ── TOOLBAR FILTER CONTROLS ── */}
              <div className="flex items-center justify-between pb-3 border-b border-white/[0.04]">
                <div className="flex items-center gap-2 text-zinc-500">
                  <Layers size={11} />
                  <span className="text-[9px] font-black uppercase tracking-[0.2em]">
                    Preset Directory
                  </span>
                </div>

                <div className="flex items-center gap-4 bg-background/60 p-1 px-3 border border-white/[0.04] rounded-full shadow-inner">
                  <span className="text-[9.5px] font-bold text-zinc-500 uppercase tracking-tight">
                    Show Compatible Only
                  </span>
                  <button
                    onClick={() => setShowCompatibleOnly(!showCompatibleOnly)}
                    className={`
                      relative w-8 h-4 rounded-full transition-all duration-300 p-0.5 cursor-pointer
                      ${showCompatibleOnly ? 'bg-[#FF3366]' : 'bg-zinc-800'}
                    `}
                  >
                    <div
                      className={`
                      w-3 h-3 rounded-full bg-black shadow transition-all duration-300
                      ${showCompatibleOnly ? 'translate-x-4' : 'translate-x-0'}
                    `}
                    />
                  </button>
                </div>
              </div>

              {/* ── MODEL LISTINGS ── */}
              {groupedLocalPresets.map(([provider, providerModels]) => {
                // Filter models if "Show Compatible Only" is enabled
                const visibleModels = providerModels.filter((m) => {
                  if (!showCompatibleOnly) return true;
                  const compat = compatibility?.presetsCompatibility?.find(
                    (c: any) => c.modelId === m.id
                  );
                  return compat ? compat.isCompatible : true;
                });

                if (visibleModels.length === 0) return null;

                return (
                  <div key={provider} className="space-y-4">
                    {/* Provider divider */}
                    <div className="flex items-center gap-3">
                      <span className="text-[11px] font-black uppercase tracking-[0.3em] text-[#FF3366] shrink-0">
                        {getProviderLabel(provider)}
                      </span>
                      <div className="h-px flex-1 bg-gradient-to-r from-[#FF3366]/30 to-transparent" />
                    </div>

                    {/* Presets responsive grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {visibleModels.map((m) => {
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

                        // Retrieve compatibility projection details from state
                        const compat = compatibility?.presetsCompatibility?.find(
                          (c: any) => c.modelId === m.id
                        );
                        const meetsRam = compat ? compat.isCompatible : true;
                        const isRecommended = compatibility?.recommendedModelId === m.id;

                        return (
                          <motion.div
                            key={`modal-preset-${m.id}`}
                            whileHover={{ y: -2, scale: 1.01 }}
                            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                            className={`
                              group relative p-3.5 rounded-2xl border border-solid flex flex-col justify-between gap-3 overflow-hidden shadow-sm
                              ${
                                isResident
                                  ? 'bg-[#4A5059] border-[#FF3366]/45 shadow-[0_0_20px_rgba(255, 51, 102,0.08)]'
                                  : isRecommended
                                    ? 'bg-[#4A5059]/90 border-[#FF3366]/25 shadow-[0_0_15px_rgba(255, 51, 102,0.04)]'
                                    : !meetsRam
                                      ? 'bg-[#111622] border-red-500/10 opacity-60 hover:opacity-100 hover:border-red-500/25 transition-all duration-300'
                                      : 'bg-[#111622] border border-white/[0.04] hover:border-[#FF3366]/30 hover:bg-[#4A5059]'
                              }
                            `}
                          >
                            <div>
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  {isRecommended && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF3366] text-black shadow-inner">
                                      <Sparkles size={7} /> Recommended
                                    </span>
                                  )}
                                  {m.featured && !isRecommended && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF3366]/10 text-[#FF3366] border border-[#FF3366]/20">
                                      <Zap size={7} /> Featured
                                    </span>
                                  )}
                                  <span className="inline-block text-[9px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF3366]/10 text-[#FF3366] border border-[#FF3366]/20">
                                    GGUF
                                  </span>
                                </div>

                                <div className="flex items-center gap-1.5">
                                  {isResident && (
                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 animate-pulse">
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                      Resident
                                    </span>
                                  )}
                                  {isCompleted && !isResident && (
                                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                                      Ready
                                    </span>
                                  )}
                                  {isDownloading && (
                                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-[#FF3366]/10 text-[#FF3366] border border-[#FF3366]/20 animate-pulse">
                                      Downloading
                                    </span>
                                  )}
                                  {isPaused && (
                                    <span className="text-[9px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-400 border border-amber-500/20">
                                      Paused
                                    </span>
                                  )}
                                </div>
                              </div>

                              <h5 className="text-[12px] font-bold leading-tight tracking-tight text-foreground group-hover:text-[#FF3366] transition-colors flex items-center gap-1.5">
                                <span>{m.name}</span>
                              </h5>
                              <p className="text-[11px] text-muted-foreground line-clamp-2 leading-relaxed font-medium mt-1">
                                {m.description}
                              </p>

                              {/* Specs grid */}
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1.5 pt-2.5 border-t border-border/30 mt-2">
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                                    Parameters
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">
                                    {m.paramCount || '—'}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                                    Quantization
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">
                                    {m.quantization || '—'}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                                    Context
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">
                                    {m.contextLength || '—'}
                                  </span>
                                </div>
                                <div className="flex flex-col">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                                    File Size
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-foreground/80">
                                    {m.size}
                                  </span>
                                </div>
                                <div className="flex flex-col col-span-2">
                                  <span className="text-[9px] font-black uppercase tracking-widest text-muted-foreground/80">
                                    Required Memory specs
                                  </span>
                                  <span className="text-[10px] font-mono font-bold text-[#FF3366]/90">
                                    {m.vramRequired ? `${m.vramRequired} + ` : ''}
                                    {m.ramRequired}
                                  </span>
                                </div>
                              </div>

                              {m.metadata && (
                                <div className="grid grid-cols-3 gap-2 mt-2 pt-2 border-t border-border/10">
                                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-white/[0.02]">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                      MMLU
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-foreground">
                                      {m.metadata.mmluScore || '--'}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-white/[0.02]">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                      HumanEval
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-foreground">
                                      {m.metadata.humanEvalScore || '--'}
                                    </span>
                                  </div>
                                  <div className="flex flex-col items-center p-1.5 rounded-lg bg-white/[0.02]">
                                    <span className="text-[8px] font-black uppercase tracking-widest text-muted-foreground">
                                      MT-Bench
                                    </span>
                                    <span className="text-[10px] font-mono font-bold text-foreground">
                                      {m.metadata.mtBenchScore || '--'}
                                    </span>
                                  </div>
                                </div>
                              )}

                              {/* Resource Compatibility Projections Box */}
                              {compat && (
                                <div
                                  className={`mt-2.5 p-2.5 rounded-xl border ${
                                    !meetsRam
                                      ? 'bg-red-500/5 border-red-500/10'
                                      : compat.speedClass === 'fast'
                                        ? 'bg-emerald-500/5 border-emerald-500/10'
                                        : compat.speedClass === 'moderate'
                                          ? 'bg-[#FF3366]/5 border-[#FF3366]/10'
                                          : 'bg-zinc-500/5 border-white/[0.03]'
                                  }`}
                                >
                                  <div className="flex items-center justify-between pb-1.5 border-b border-white/[0.04]">
                                    <div className="flex items-center gap-1">
                                      <Activity
                                        size={9}
                                        className={
                                          !meetsRam
                                            ? 'text-red-400'
                                            : compat.speedClass === 'fast'
                                              ? 'text-emerald-400'
                                              : compat.speedClass === 'moderate'
                                                ? 'text-[#FF3366]'
                                                : 'text-zinc-500'
                                        }
                                      />
                                      <span className="text-[8px] font-black uppercase tracking-wider text-zinc-400">
                                        Projection Details
                                      </span>
                                    </div>
                                    <span
                                      className={`text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                                        !meetsRam
                                          ? 'bg-red-500/15 text-red-400 border border-red-500/10'
                                          : compat.speedClass === 'fast'
                                            ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/10'
                                            : compat.speedClass === 'moderate'
                                              ? 'bg-[#FF3366]/15 text-[#FF3366] border border-[#FF3366]/10'
                                              : 'bg-zinc-800 text-zinc-400 border border-white/[0.03]'
                                      }`}
                                    >
                                      {!meetsRam
                                        ? 'Incompatible'
                                        : compat.speedClass.toUpperCase() + ' SPEED'}
                                    </span>
                                  </div>
                                  <div className="grid grid-cols-2 gap-1.5 pt-1.5 text-[8.5px] font-medium text-zinc-400">
                                    <div>
                                      CPU Layers:{' '}
                                      <span className="font-bold text-foreground font-mono">
                                        {compat.cpuLayers}
                                      </span>
                                    </div>
                                    <div>
                                      GPU Layers:{' '}
                                      <span className="font-bold text-foreground font-mono">
                                        {compat.gpuLayers} ({compat.offloadRatio}%)
                                      </span>
                                    </div>
                                    <div>
                                      Est. RAM:{' '}
                                      <span className="font-bold text-foreground font-mono">
                                        {compat.estimatedRamUsageGB} GB
                                      </span>
                                    </div>
                                    <div>
                                      Est. VRAM:{' '}
                                      <span className="font-bold text-[#FF3366] font-mono">
                                        {compat.estimatedVramUsageGB} GB
                                      </span>
                                    </div>
                                  </div>
                                  <p className="text-[8px] text-muted-foreground mt-1.5 leading-normal font-semibold">
                                    {compat.reason}
                                  </p>
                                </div>
                              )}
                            </div>

                            {/* Download Action */}
                            <div className="mt-2.5 pt-2.5 border-t border-border/30">
                              {isDownloading && (
                                <div className="space-y-1.5 mb-2">
                                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <span>{progress.progressPercentage}% Completed</span>
                                    <span>
                                      {progress.speedMbps > 0
                                        ? `${progress.speedMbps} MB/s`
                                        : 'Connecting...'}
                                    </span>
                                  </div>
                                  <div className="w-full h-1 rounded-full bg-black/40 overflow-hidden">
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
                                  {/* Pause + Cancel row */}
                                  <div className="flex gap-1.5 pt-0.5">
                                    <motion.button
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => handlePause(m.id)}
                                      className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 border border-amber-500/20 hover:border-amber-500/40 transition-all cursor-pointer"
                                    >
                                      <svg
                                        width="9"
                                        height="9"
                                        viewBox="0 0 10 10"
                                        fill="currentColor"
                                      >
                                        <rect x="1" y="1" width="3" height="8" rx="1" />
                                        <rect x="6" y="1" width="3" height="8" rx="1" />
                                      </svg>
                                      Pause
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => handleCancel(m.id)}
                                      className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-red-500/8 hover:bg-red-500/18 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 transition-all cursor-pointer"
                                    >
                                      <X size={9} />
                                      Cancel
                                    </motion.button>
                                  </div>
                                </div>
                              )}

                              {isPaused && (
                                <div className="space-y-1.5 mb-2">
                                  <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-widest text-muted-foreground">
                                    <span>{progress.progressPercentage}% — Paused</span>
                                    <span className="text-amber-400 font-bold">
                                      {progress.totalBytes > 0
                                        ? `${(progress.bytesDownloaded / (1024 * 1024)).toFixed(0)} MB saved`
                                        : ''}
                                    </span>
                                  </div>
                                  <div className="w-full h-1 rounded-full bg-black/40 overflow-hidden">
                                    <div
                                      className="h-full bg-gradient-to-r from-amber-400 to-amber-400/60"
                                      style={{ width: `${progress.progressPercentage}%` }}
                                    />
                                  </div>
                                  {/* Resume + Cancel row */}
                                  <div className="flex gap-1.5 pt-0.5">
                                    <motion.button
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => handleResume(m.id)}
                                      className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-[#FF3366]/10 hover:bg-[#FF3366]/20 text-[#FF3366] border border-[#FF3366]/20 hover:border-[#FF3366]/40 transition-all cursor-pointer"
                                    >
                                      <svg
                                        width="9"
                                        height="9"
                                        viewBox="0 0 10 10"
                                        fill="currentColor"
                                      >
                                        <polygon points="2,1 9,5 2,9" />
                                      </svg>
                                      Resume
                                    </motion.button>
                                    <motion.button
                                      whileTap={{ scale: 0.96 }}
                                      onClick={() => handleCancel(m.id)}
                                      className="flex-1 py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1 bg-red-500/8 hover:bg-red-500/18 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 transition-all cursor-pointer"
                                    >
                                      <X size={9} />
                                      Cancel
                                    </motion.button>
                                  </div>
                                </div>
                              )}

                              {!meetsRam && isIdle && (
                                <div className="p-2 bg-red-500/10 border border-red-500/15 rounded-xl text-[9px] text-red-400 font-semibold text-center leading-normal mb-2">
                                  ⚠️ May exceed system RAM. Requires {m.ramRequired} but device only
                                  has {compatibility?.specs?.totalRamGB} GB. Download at your own
                                  risk.
                                </div>
                              )}

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
                                      <span>Download to NYX</span>
                                    </>
                                  )}
                                </motion.button>
                              )}

                              {isCompleted && (
                                <div className="flex flex-col gap-1.5">
                                  <div className="py-1.5 px-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-400">
                                    <Check size={10} />
                                    <span>Ready on Device</span>
                                  </div>
                                  <motion.button
                                    whileTap={{ scale: 0.95 }}
                                    onClick={() => handleDelete(m.id, m.name)}
                                    disabled={isCurrentAction || !!actionInProgress}
                                    className="
                                      w-full py-1.5 rounded-xl text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 transition-all
                                      bg-red-500/8 hover:bg-red-500/18 text-red-400/70 hover:text-red-400 border border-red-500/15 hover:border-red-500/30 disabled:opacity-40 cursor-pointer
                                    "
                                  >
                                    <Trash2 size={9} />
                                    <span>Delete from Disk</span>
                                  </motion.button>
                                </div>
                              )}
                            </div>
                          </motion.div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
};
