// src/features/hf-explorer/components/OnDeviceModelDetail.tsx
import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  Desktop,
  Trash,
  Play,
  Stop,
  Sparkle,
  Brain,
  Wrench,
  Gauge,
  ArrowsClockwise,
  Sliders,
  Cpu,
  Lightning,
  FloppyDisk,
} from '@phosphor-icons/react';
import { invoke } from '@tauri-apps/api/core';
import { formatSize } from '../lib/utils';
import { useNyxStore, DEFAULT_SETTINGS, type ModelSettings } from '../../../stores/useNyxStore';
import { toast } from 'sonner';

interface OnDeviceModelDetailProps {
  model: {
    id: string;
    name: string;
    provider: string;
    description: string;
    size_bytes?: number;
    specs?: {
      contextWindow: string;
      maxOutput: string;
      modality: string;
    };
    capabilities?: {
      vision?: boolean;
      reasoning?: boolean;
      toolCalling?: boolean;
    };
    [key: string]: any;
  };
  isLoaded: boolean;
  loadingState: 'loading' | 'unloading' | 'uninstalling' | 'idle';
  onLoad: (modelId: string) => void;
  onUnload: () => void;
  onUninstall: (modelId: string) => void;
}

const CONTEXT_PRESETS = [
  { label: '2K', value: 2048 },
  { label: '4K', value: 4096 },
  { label: '8K', value: 8192 },
  { label: '16K', value: 16384 },
  { label: '32K (Default)', value: 32768 },
  { label: '64K', value: 65536 },
  { label: '128K', value: 131072 },
];

export const OnDeviceModelDetail: React.FC<OnDeviceModelDetailProps> = ({
  model,
  isLoaded,
  loadingState,
  onLoad,
  onUnload,
  onUninstall,
}) => {
  const modelConfigs = useNyxStore((s) => s.modelConfigs);
  const updateModelConfig = useNyxStore((s) => s.updateModelConfig);

  // Local model settings with default 32K context length
  const savedConfig = modelConfigs?.[model.id];
  const [settings, setSettings] = useState<ModelSettings>({
    ...DEFAULT_SETTINGS,
    contextSize: savedConfig?.contextSize ?? 32768,
    ...savedConfig,
  });

  const [hardwareEst, setHardwareEst] = useState<any>(null);
  const [hasPendingChanges, setHasPendingChanges] = useState(false);

  // Synchronize local settings when model changes
  useEffect(() => {
    const freshConfig = modelConfigs?.[model.id];
    setSettings({
      ...DEFAULT_SETTINGS,
      contextSize: freshConfig?.contextSize ?? 32768,
      ...freshConfig,
    });
    setHasPendingChanges(false);
  }, [model.id, modelConfigs]);

  // Estimate hardware whenever model or contextSize / gpuLayers change
  useEffect(() => {
    let active = true;
    if (model?.id) {
      invoke('estimate_hardware_usage', {
        modelId: model.id,
        contextSize: settings.contextSize ?? 32768,
        gpuLayers: settings.gpuLayers ?? 99,
      })
        .then((res: any) => {
          if (active) setHardwareEst(res);
        })
        .catch((err) => {
          if (active) console.warn('Failed to estimate hardware usage:', err);
        });
    }
    return () => {
      active = false;
    };
  }, [model?.id, settings.contextSize, settings.gpuLayers]);

  // Debounce restart when settings change and model is currently loaded
  const restartDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const applyAndRestart = useCallback(
    (newSettings: ModelSettings) => {
      updateModelConfig(model.id, newSettings);
      setHasPendingChanges(false);

      if (isLoaded) {
        toast.info('Applying settings and restarting model in VRAM...', { id: 'model-restart' });
        onLoad(model.id);
      } else {
        toast.success('Model settings saved');
      }
    },
    [model.id, isLoaded, onLoad, updateModelConfig]
  );

  const handleSettingChange = <K extends keyof ModelSettings>(key: K, value: ModelSettings[K]) => {
    const updated = { ...settings, [key]: value };
    setSettings(updated);
    setHasPendingChanges(true);

    // Save immediately to Zustand store
    updateModelConfig(model.id, updated);

    // If model is currently loaded in VRAM, debounce automatic server restart
    if (isLoaded) {
      if (restartDebounceRef.current) clearTimeout(restartDebounceRef.current);
      restartDebounceRef.current = setTimeout(() => {
        applyAndRestart(updated);
      }, 1200);
    }
  };

  const isLoadingThis = loadingState === 'loading';
  const isUnloadingThis = loadingState === 'unloading';
  const isUninstallingThis = loadingState === 'uninstalling';

  return (
    <div className="flex flex-col h-full bg-[#000000] overflow-y-auto custom-scrollbar text-[#e2e8f0]">
      {/* ── Top Header Section ─────────────────────────────────────────── */}
      <div className="p-6 border-b border-white/10 flex flex-col gap-5 bg-[#09090b]">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-primary shadow-inner shrink-0">
              <Desktop size={26} weight="duotone" />
            </div>
            <div className="flex flex-col gap-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-lg font-bold text-foreground tracking-tight font-mono truncate max-w-[400px]">
                  {model.name || model.id}
                </h1>
                {isLoaded ? (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    Active in VRAM
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-white/5 border border-white/10 text-muted-foreground font-mono">
                    On-Device Ready
                  </span>
                )}

                {/* Model Capabilities in the header */}
                {model.capabilities?.vision && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-purple-500/15 border border-purple-500/30 text-purple-300 font-mono">
                    <Sparkle size={11} weight="fill" />
                    Vision
                  </span>
                )}
                {model.capabilities?.reasoning && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-blue-500/15 border border-blue-500/30 text-blue-300 font-mono">
                    <Brain size={11} weight="fill" />
                    Reasoning
                  </span>
                )}
                {model.capabilities?.toolCalling && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 font-mono">
                    <Wrench size={11} weight="fill" />
                    Tools
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 shrink-0">
            {isLoaded ? (
              <>
                <button
                  type="button"
                  onClick={() => applyAndRestart(settings)}
                  disabled={isLoadingThis}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 hover:bg-emerald-500/25 text-[12px] font-bold transition-all cursor-pointer disabled:opacity-50"
                  title="Restart model server with updated settings"
                >
                  <ArrowsClockwise size={14} className={isLoadingThis ? 'animate-spin' : ''} />
                  <span>{isLoadingThis ? 'Restarting...' : 'Restart Server'}</span>
                </button>

                <button
                  type="button"
                  onClick={onUnload}
                  disabled={isUnloadingThis}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-500/30 text-amber-300 hover:bg-amber-500/30 text-[12px] font-bold transition-all cursor-pointer disabled:opacity-50"
                >
                  {isUnloadingThis ? (
                    <ArrowsClockwise size={14} className="animate-spin" />
                  ) : (
                    <Stop size={14} weight="fill" />
                  )}
                  <span>{isUnloadingThis ? 'Unloading...' : 'Unload'}</span>
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => onLoad(model.id)}
                disabled={isLoadingThis}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[12px] font-bold transition-all cursor-pointer shadow-lg shadow-primary/20 disabled:opacity-50"
              >
                {isLoadingThis ? (
                  <ArrowsClockwise size={14} className="animate-spin" />
                ) : (
                  <Play size={14} weight="fill" />
                )}
                <span>{isLoadingThis ? 'Loading into VRAM...' : 'Load into VRAM'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={() => onUninstall(model.id)}
              disabled={isUninstallingThis || isLoaded}
              className="p-2 rounded-lg border border-white/10 hover:border-red-500/40 hover:bg-red-500/10 text-muted-foreground hover:text-red-400 transition-all cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title={isLoaded ? 'Unload model before deleting' : 'Delete model from disk'}
            >
              {isUninstallingThis ? (
                <ArrowsClockwise size={16} className="animate-spin" />
              ) : (
                <Trash size={16} />
              )}
            </button>
          </div>
        </div>
      </div>

      {/* ── Body: Model Settings & Memory Allocation ────────────────────── */}
      <div className="p-6 flex flex-col gap-6">
        {/* GPU Offload & Memory Status */}
        {hardwareEst && (
          <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Gauge size={16} className="text-primary" />
                <span className="text-xs font-bold text-foreground uppercase tracking-wider">
                  GPU Offload & Memory Allocation
                </span>
              </div>
              <span className="text-[11px] font-bold text-emerald-400 font-mono">
                {hardwareEst.uses_shared_memory
                  ? '⚡ 100% GPU (Shared RAM)'
                  : hardwareEst.fully_gpu
                    ? '⚡ 100% Dedicated VRAM'
                    : `⚡ Hybrid (~${hardwareEst.layers_on_gpu}/${hardwareEst.total_layers} layers)`}
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t border-white/5 text-[11px] font-mono">
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Estimated VRAM</div>
                <div className="text-foreground font-bold">{hardwareEst.estimated_vram_mb} MB</div>
              </div>
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Layers on GPU</div>
                <div className="text-foreground font-bold">
                  {hardwareEst.layers_on_gpu} / {hardwareEst.total_layers}
                </div>
              </div>
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Active Context</div>
                <div className="text-foreground font-bold">
                  {Math.round((settings.contextSize || 32768) / 1024)}K
                </div>
              </div>
              <div>
                <div className="text-muted-foreground/60 text-[10px]">Backend</div>
                <div className="text-foreground font-bold">{hardwareEst.gpu_backend}</div>
              </div>
            </div>

            {hardwareEst.schedule_message && (
              <div className="text-[11px] text-muted-foreground bg-black/40 p-2.5 rounded-lg border border-white/5 font-mono">
                {hardwareEst.schedule_message}
              </div>
            )}
          </div>
        )}

        {/* ── Model Settings Section ────────────────────────────────────────── */}
        <div className="p-5 rounded-xl bg-[#09090b] border border-white/10 flex flex-col gap-6">
          <div className="flex items-center justify-between border-b border-white/10 pb-4">
            <div className="flex items-center gap-2">
              <Sliders size={18} className="text-primary" weight="bold" />
              <div>
                <h2 className="text-sm font-bold text-foreground tracking-tight font-mono">
                  Individual Model Settings
                </h2>
                <p className="text-[11px] text-muted-foreground mt-0.5">
                  Changes persist automatically and restart the active model server.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => applyAndRestart(settings)}
              disabled={isLoadingThis}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 text-[11px] font-bold transition-all cursor-pointer shadow-sm"
            >
              <FloppyDisk size={14} weight="bold" />
              <span>Apply & Save</span>
            </button>
          </div>

          {/* 1. Context Length */}
          <div className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-foreground font-mono flex items-center gap-2">
                Context Length
                <span className="text-[10px] font-normal text-muted-foreground font-mono">
                  (Default: 32K)
                </span>
              </label>
              <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                {settings.contextSize
                  ? `${Math.round(settings.contextSize / 1024)}K tokens`
                  : '32K tokens'}
              </span>
            </div>

            {/* Quick Context Presets */}
            <div className="flex flex-wrap gap-1.5">
              {CONTEXT_PRESETS.map((preset) => (
                <button
                  key={preset.value}
                  type="button"
                  onClick={() => handleSettingChange('contextSize', preset.value)}
                  className={`px-2.5 py-1 rounded text-[11px] font-mono font-semibold transition-all cursor-pointer ${
                    (settings.contextSize ?? 32768) === preset.value
                      ? 'bg-primary text-primary-foreground shadow-sm'
                      : 'bg-white/5 border border-white/10 text-muted-foreground hover:text-foreground hover:bg-white/10'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* 2. Temperature & Max Output */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-white/5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground font-mono">Temperature</span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {(settings.temperature ?? 0.7).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="2"
                step="0.05"
                value={settings.temperature ?? 0.7}
                onChange={(e) => handleSettingChange('temperature', parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground/70">
                0.0 = Deterministic, 0.7 = Balanced, 1.2+ = Highly Creative
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground font-mono">
                  Max Output Tokens
                </span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {settings.maxTokens ? `${settings.maxTokens}` : '16384'}
                </span>
              </div>
              <input
                type="range"
                min="512"
                max="32768"
                step="512"
                value={settings.maxTokens ?? 16384}
                onChange={(e) => handleSettingChange('maxTokens', parseInt(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground/70">
                Maximum token limit per generation response
              </span>
            </div>
          </div>

          {/* 3. Top-P and Top-K Sampling */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-white/5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground font-mono">Top-P (Nucleus)</span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {(settings.topP ?? 0.95).toFixed(2)}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={settings.topP ?? 0.95}
                onChange={(e) => handleSettingChange('topP', parseFloat(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground/70">
                Cumulative probability cutoff for token candidate filtering
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground font-mono">Top-K</span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {settings.topK ?? 40}
                </span>
              </div>
              <input
                type="range"
                min="1"
                max="100"
                step="1"
                value={settings.topK ?? 40}
                onChange={(e) => handleSettingChange('topK', parseInt(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground/70">
                Limits candidate pool to K highest probability tokens
              </span>
            </div>
          </div>

          {/* 4. Hardware Optimization & GPU Layers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-4 border-t border-white/5">
            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground font-mono">CPU Threads</span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {settings.threads ? `${settings.threads} threads` : 'Auto'}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="32"
                step="1"
                value={settings.threads ?? 0}
                onChange={(e) => handleSettingChange('threads', parseInt(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground/70">
                0 = Automatic allocation matching physical performance cores
              </span>
            </div>

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground font-mono">
                  GPU Offload Layers
                </span>
                <span className="text-xs font-mono font-bold text-foreground">
                  {settings.gpuLayers === undefined ||
                  settings.gpuLayers === null ||
                  settings.gpuLayers >= 99
                    ? 'All (Auto)'
                    : settings.gpuLayers}
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="99"
                step="1"
                value={settings.gpuLayers ?? 99}
                onChange={(e) => handleSettingChange('gpuLayers', parseInt(e.target.value))}
                className="w-full accent-primary h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-muted-foreground/70">
                Set to 99 for maximum GPU VRAM offload
              </span>
            </div>
          </div>

          {/* 5. Advanced Flags: Flash Attention & KV Cache */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t border-white/5">
            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
              <div>
                <div className="text-xs font-bold text-foreground font-mono flex items-center gap-1.5">
                  <Lightning size={14} className="text-amber-400" weight="fill" />
                  Flash Attention
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Accelerates inference and reduces KV cache VRAM footprint
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.flashAttention ?? true}
                onChange={(e) => handleSettingChange('flashAttention', e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer rounded"
              />
            </div>

            <div className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/10">
              <div>
                <div className="text-xs font-bold text-foreground font-mono flex items-center gap-1.5">
                  <Cpu size={14} className="text-primary" weight="duotone" />
                  Lock Memory (mlock)
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  Locks model in RAM/VRAM to prevent Windows page-file paging
                </div>
              </div>
              <input
                type="checkbox"
                checked={settings.useMlock ?? false}
                onChange={(e) => handleSettingChange('useMlock', e.target.checked)}
                className="w-4 h-4 accent-primary cursor-pointer rounded"
              />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
