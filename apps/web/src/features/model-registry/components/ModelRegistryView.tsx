// fallow-ignore-file code-duplication
// @ts-nocheck
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable no-empty */
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Search, Box, Cpu, Download, Globe, Layers, GitCompare } from 'lucide-react';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { ModelOption, LocalModelPreset } from '@src/types';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';
import { AIService } from '@src/core/services/ai.service';
import { useLocalModels } from '@src/shared/hooks/useLocalModels';
import { getSessionToken } from '@src/infrastructure/api/authFetch';

// Import modular sub-components
import { SectionHeader } from './RegistryShared';
import { ModelCard } from './ModelCard';
import { LocalModelCard } from './LocalModelCard';
import { DownloadModal } from './DownloadModal';
import { ModelComparisonModal } from './ModelComparisonModal';

interface ModelRegistryViewProps {
  models?: Record<'nyx', string>;
  selectModel?: (modelId: string) => void;
  apiKeys: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  activeMode?: 'coder' | 'registry' | 'settings' | 'compare';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings' | 'compare') => void;
  sidebarOpen?: boolean;
}

const ModelRegistryViewComponent: React.FC<ModelRegistryViewProps> = ({
  selectModel,
  apiKeys,
  providerStatuses,
  activeMode,
  setActiveMode,
  sidebarOpen = true,
}) => {
  const { usage } = useTokenUsage();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'nyx' | 'cloud'>('nyx');

  const [nativeModels, setNativeModels] = useState<LocalModelPreset[]>([]);
  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [lmstudioModels, setLmstudioModels] = useState<any[]>([]);
  const [activeNativeId, setActiveNativeId] = useState<string | null>(null);
  const [nativeStatus, setNativeStatus] = useState<{ status: string; error: string | null }>({
    status: 'stopped',
    error: null,
  });
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [customUrl, setCustomUrl] = useState('');

  // Device Compatibility & Resource Projections States
  const [compatibility, setCompatibility] = useState<any>(null);
  const [loadingCompatibility, setLoadingCompatibility] = useState(false);
  const [showCompatibleOnly, setShowCompatibleOnly] = useState(false);

  // Comparison State
  const [compareIds, setCompareIds] = useState<string[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);

  const toggleCompare = useCallback((id: string) => {
    setCompareIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const localModelsQuery = useLocalModels(true);

  useEffect(() => {
    if (localModelsQuery.data) {
      setNativeModels(localModelsQuery.data.models);
      setOllamaModels(localModelsQuery.data.ollamaModels || []);
      setLmstudioModels(localModelsQuery.data.lmstudioModels || []);
      setActiveNativeId(localModelsQuery.data.activeModelId);
      setNativeStatus(localModelsQuery.data.runnerStatus);
    }
  }, [localModelsQuery.data]);

  const fetchCompatibility = useCallback(async () => {
    setLoadingCompatibility(true);
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/compatibility');
      if (res.ok) {
        const contentType = res.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const data = await res.json();
          setCompatibility(data);
        } else {
          console.warn('[Registry] Compatibility response is not JSON:', res.status);
        }
      }
    } catch (err: any) {
      console.error('[Registry] Failed to fetch device compatibility:', err);
    } finally {
      setLoadingCompatibility(false);
    }
  }, []);

  useEffect(() => {
    fetchCompatibility();
    // Native models are fetched and polled by useLocalModels query
  }, [fetchCompatibility]);

  useEffect(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const token = getSessionToken();
    const wsUrl = `${protocol}//${window.location.host}/ws/downloads?token=${token || ''}`;

    let ws: WebSocket;
    let reconnectTimer: NodeJS.Timeout;

    const connect = () => {
      ws = new WebSocket(wsUrl);

      ws.onopen = () => {
        console.log('[Registry] Download WebSocket connected');
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);

          if (data.type === 'progress' && data.modelId) {
            setNativeModels((prev) =>
              prev.map((model) =>
                model.id === data.modelId
                  ? { ...model, progress: data.progress, status: data.progress.status }
                  : model
              )
            );
          } else if (data.type === 'status_update' && data.modelId) {
            setNativeModels((prev) =>
              prev.map((model) =>
                model.id === data.modelId ? { ...model, status: data.status } : model
              )
            );
            if (['completed', 'failed', 'idle'].includes(data.status)) {
              localModelsQuery.refetch(); // Sync state on completion or failure
            }
          }
        } catch (e) {
          console.error('[Registry] Failed to parse WS message:', e);
        }
      };

      ws.onclose = () => {
        console.log('[Registry] Download WebSocket closed. Reconnecting in 3s...');
        reconnectTimer = setTimeout(connect, 3000);
      };

      ws.onerror = (err) => {
        console.error('[Registry] Download WebSocket error:', err);
      };
    };

    connect();

    return () => {
      clearTimeout(reconnectTimer);
      if (ws) {
        ws.onclose = null; // Prevent reconnect on unmount
        ws.close();
      }
    };
  }, [localModelsQuery]);

  useEffect(() => {
    if (showDownloadModal) {
      fetchCompatibility();
    }
  }, [showDownloadModal, fetchCompatibility]);

  const handleAutoSetup = async () => {
    setActionInProgress('auto-setup');
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/auto-setup', {
        method: 'POST',
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(
          data.message || 'Optimal hardware-matched model selected. Initiated download.'
        );
        fetchNativeModels();
        setShowDownloadModal(true); // Keep open to monitor progress
      } else {
        const errData = await res.json();
        toast.error(`Auto-setup failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Auto-setup error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDownloadAllCompatible = async () => {
    const allCompatCount = compatibility?.allCompatibleModelIds?.length || 0;
    if (allCompatCount === 0) {
      toast.error('No compatible GGUF presets detected for your system.');
      return;
    }
    if (
      !confirm(
        `Queue and download all ${allCompatCount} compatible models on your device? This requires significant disk space.`
      )
    )
      return;

    setActionInProgress('download-all-compatible');
    try {
      const res = await AIService.fetchWithAuth(
        '/api/v1/nyx/local-models/download-all-compatible',
        {
          method: 'POST',
        }
      );
      if (res.ok) {
        const data = await res.json();
        toast.success(data.message || 'Bulk downloads initiated.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Bulk download failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Bulk download error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCustomUrlDownload = async () => {
    if (!customUrl.trim()) {
      toast.error('Please enter a valid URL.');
      return;
    }
    if (!customUrl.startsWith('http://') && !customUrl.startsWith('https://')) {
      toast.error('URL must start with http:// or https://');
      return;
    }

    const urlStr = customUrl.trim();
    if (!urlStr.toLowerCase().split('?')[0].endsWith('.gguf')) {
      toast.error('URL must point to a .gguf file');
      return;
    }

    try {
      const allowedDomains = ['huggingface.co', 'github.com', 'modelscope.cn'];
      const parsedUrl = new URL(urlStr);
      if (!allowedDomains.some((d) => parsedUrl.hostname.includes(d))) {
        toast.warning('Untrusted domain. Proceed with caution.');
      }
    } catch (e) {
      toast.error('Invalid URL format');
      return;
    }

    setActionInProgress(urlStr);
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId: customUrl.trim() }),
      });
      if (res.ok) {
        toast.success('Custom URL download started successfully.');
        setCustomUrl('');
        setShowDownloadModal(false);
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Download failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDownload = async (modelId: string, quantization?: string) => {
    setActionInProgress(modelId);
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, quantization }),
      });
      if (res.ok) {
        toast.success('Download started directly within NYX.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Download failed to start: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handlePause = async (modelId: string) => {
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/pause', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        toast.success('Download paused. Resume to continue.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Pause failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleResume = async (modelId: string) => {
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        toast.success('Download resumed from where it stopped.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Resume failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleCancel = async (modelId: string) => {
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        toast.success('Download cancelled and partial file removed.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Cancel failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const handleRun = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      let rawSettings: any = {};
      const savedSettings = localStorage.getItem('nyx_model_settings');
      if (savedSettings) {
        try {
          rawSettings = JSON.parse(savedSettings);
        } catch {}
      }

      const validatedSettings = {
        ...rawSettings,
        temperature: Math.max(0, Math.min(2, rawSettings.temperature ?? 0.7)),
        maxTokens: Math.max(1, Math.min(32768, rawSettings.maxTokens ?? 4096)),
        gpuLayers: Math.max(0, Math.min(999, rawSettings.gpuLayers ?? 99)),
        threads: Math.max(
          1,
          Math.min(navigator.hardwareConcurrency || 4, rawSettings.threads ?? 4)
        ),
      };

      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId, settings: validatedSettings }),
      });
      if (res.ok) {
        toast.success('Model loaded natively in Resident RAM.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Failed to load model: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleStop = async (modelId: string) => {
    setActionInProgress(modelId);
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (res.ok) {
        toast.success('Model unloaded from Resident RAM. Memory released.');
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Failed to unload model: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const handleDelete = async (modelId: string, modelName: string) => {
    if (!confirm(`Delete "${modelName}" from disk? This cannot be undone.`)) return;
    setActionInProgress(modelId);
    try {
      const res = await AIService.fetchWithAuth('/api/v1/nyx/local-models/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ modelId }),
      });
      if (res.ok) {
        toast.success(`"${modelName}" removed from disk.`);
        fetchNativeModels();
      } else {
        const errData = await res.json();
        toast.error(`Delete failed: ${errData.error}`);
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    } finally {
      setActionInProgress(null);
    }
  };

  const query = search.toLowerCase();

  /* ── Filtered model lists ─────────────────────────────────────────────── */

  const cloudModels = useMemo(
    () =>
      AVAILABLE_MODELS.filter(
        (m) =>
          m.provider !== 'nyx-native' &&
          (m.name.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query))
      ),
    [query]
  );

  const groupedCloud = useMemo(() => {
    const grouped = cloudModels.reduce(
      (acc, m) => {
        if (!acc[m.provider]) acc[m.provider] = [];
        acc[m.provider].push(m);
        return acc;
      },
      {} as Record<string, ModelOption[]>
    );

    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'gemini') return -1;
      if (b === 'gemini') return 1;
      return a.localeCompare(b);
    });
  }, [cloudModels]);

  const groupedLocalPresets = useMemo<[string, LocalModelPreset[]][]>(() => {
    const grouped = nativeModels.reduce(
      (acc, m) => {
        const prov = m.provider || 'local';
        if (!acc[prov]) acc[prov] = [];
        acc[prov].push(m);
        return acc;
      },
      {} as Record<string, LocalModelPreset[]>
    );

    return (Object.entries(grouped) as [string, LocalModelPreset[]][]).sort(([a], [b]) => {
      if (a === 'google') return -1;
      if (b === 'google') return 1;
      return a.localeCompare(b);
    });
  }, [nativeModels]);

  const showNyx = filter === 'nyx';
  const showCloud = filter === 'cloud';

  /* ── Render ────────────────────────────────────────────────────────────── */

  return (
    <motion.div
      key="registry"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        {/* ── Page header ──────────────────────────────────────────────── */}
        <header
          className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-4 ${!sidebarOpen ? 'pl-14' : ''} border-b border-border shrink-0 select-none bg-background transition-all duration-300`}
        >
          <div className="flex items-center gap-2">
            <Box size={16} className="text-[#FF3366]" />
            <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">
              Model Registry
            </h2>
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
            {/* Search */}
            <div className="relative group w-full sm:w-auto">
              <Search
                size={12}
                strokeWidth={1.5}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 transition-colors group-focus-within:text-[#FF3366]"
              />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="
                  bg-background border border-border rounded-md
                  text-[11px] font-medium text-foreground
                  pl-8 pr-3 py-1.5 w-full sm:w-48
                  outline-none focus:border-[#FF3366]/30
                  transition-all placeholder:text-muted-foreground/20
                "
              />
            </div>

            {/* Filter tabs */}
            <div className="flex gap-1 bg-background p-1 rounded-md border border-border shrink-0 w-full sm:w-auto overflow-x-auto scrollbar-none">
              {(['nyx', 'cloud'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    flex-1 sm:flex-none px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-tight transition-all text-center
                    ${
                      filter === f
                        ? 'bg-[#FF3366] text-black'
                        : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
                    }
                  `}
                >
                  {f === 'nyx' ? 'Native' : 'Cloud'}
                </button>
              ))}
            </div>
          </div>
        </header>

        {/* ── Scrollable content ───────────────────────────────────────── */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {/* ════════════════════════════════════════════════════════════════
           *  NYX NATIVE LOCAL LIBRARY SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showNyx && (
            <div className="flex flex-col gap-6">
            <section className="space-y-4 p-5 rounded-md bg-card border border-border">
              <SectionHeader
                icon={<Cpu size={18} className="text-[#FF3366] animate-pulse" />}
                title="NYX Native Local Library"
                subtitle="Directly download and host GGUF models natively"
              >
                <div className="flex flex-wrap items-center gap-3">
                  {/* Direct RAM Load Status Badge */}
                  <div
                    className={`
                    inline-flex items-center gap-2 px-4 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-tight
                    ${
                      activeNativeId
                        ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                        : 'bg-zinc-500/10 text-zinc-400 border border-zinc-500/20'
                    }
                  `}
                  >
                    <div
                      className={`
                      w-1.5 h-1.5 rounded-md
                      ${activeNativeId ? 'bg-emerald-400 animate-ping' : 'bg-zinc-400'}
                    `}
                    />
                    {activeNativeId ? 'Model Resident in RAM' : 'No Model Loaded'}
                  </div>

                  {/* Browse Presets / Download button */}
                  <motion.button
                    whileTap={{ scale: 0.97 }}
                    onClick={() => setShowDownloadModal(true)}
                    className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-[#FF3366] hover:bg-[#FF3366]/90 text-[11px] font-bold uppercase tracking-wider text-black transition-all cursor-pointer"
                  >
                    <Download size={10} />
                    <span>Browse &amp; Download</span>
                  </motion.button>

                  {/* Compare Models button */}
                  {setActiveMode && (
                    <motion.button
                      whileTap={{ scale: 0.97 }}
                      onClick={() => setActiveMode('compare')}
                      className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-muted hover:bg-muted/80 border border-border text-[11px] font-bold uppercase tracking-wider text-foreground transition-all cursor-pointer"
                    >
                      <GitCompare size={10} />
                      <span>Compare Models</span>
                    </motion.button>
                  )}
                </div>

                {/* VRAM / RAM Real-time Visualization */}
                {compatibility?.specs && (
                  <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4 bg-muted/40 p-3 rounded-md border border-border">
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Zap size={10} className="text-[#FF3366]" /> VRAM Utilization
                        </span>
                        <span className="text-foreground">
                          {compatibility.specs.totalVramGB - compatibility.specs.freeVramGB} /{' '}
                          {compatibility.specs.totalVramGB} GB
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full bg-[#FF3366] transition-all duration-500"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((compatibility.specs.totalVramGB - compatibility.specs.freeVramGB) / compatibility.specs.totalVramGB) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-[10px] uppercase font-bold tracking-wider">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <HardDrive size={10} className="text-blue-400" /> RAM Utilization
                        </span>
                        <span className="text-foreground">
                          {compatibility.specs.totalRamGB - compatibility.specs.freeRamGB} /{' '}
                          {compatibility.specs.totalRamGB} GB
                        </span>
                      </div>
                      <div className="h-2 w-full bg-muted rounded-md overflow-hidden">
                        <div
                          className="h-full bg-blue-500 transition-all duration-500"
                          style={{
                            width: `${Math.max(0, Math.min(100, ((compatibility.specs.totalRamGB - compatibility.specs.freeRamGB) / compatibility.specs.totalRamGB) * 100))}%`,
                          }}
                        />
                      </div>
                    </div>
                  </div>
                )}
              </SectionHeader>

              {/* Show all models in the library */}
              {(() => {
                if (nativeModels.length === 0) {
                  return (
                    <div className="py-10 rounded-md border border-dashed border-[#FF3366]/20 flex flex-col items-center justify-center text-center gap-3">
                      <div className="w-10 h-10 rounded-md bg-[#FF3366]/10 border border-[#FF3366]/20 flex items-center justify-center">
                        <Download size={16} className="text-[#FF3366]" />
                      </div>
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-muted-foreground/60">
                          No models available
                        </p>
                        <p className="text-[8px] text-muted-foreground/40 mt-1 font-medium">
                          Unable to load native models.
                        </p>
                      </div>
                    </div>
                  );
                }

                return (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-max [&>*:nth-child(4n+1)]:md:col-span-2 [&>*:nth-child(4n+1)]:lg:col-span-2">
                    {nativeModels.map((m) => (
                      <LocalModelCard
                        key={`native-${m.id}`}
                        m={m}
                        activeNativeId={activeNativeId}
                        compatibility={compatibility}
                        actionInProgress={actionInProgress}
                        handleDownload={handleDownload}
                        handlePause={handlePause}
                        handleResume={handleResume}
                        handleCancel={handleCancel}
                        handleRun={handleRun}
                        handleStop={handleStop}
                        handleDelete={handleDelete}
                        selectModel={selectModel}
                        isComparing={compareIds.includes(m.id)}
                        toggleCompare={() => toggleCompare(m.id)}
                      />
                    ))}
                  </div>
                );
              })()}
            </section>
            
            <section className="space-y-4 p-5 rounded-md bg-card border border-border mt-6">
              <SectionHeader
                icon={<Cpu size={18} className="text-orange-500" />}
                title="Ollama Local Library"
                subtitle="Models hosted by your local Ollama instance"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-max [&>*:nth-child(4n+1)]:md:col-span-2 [&>*:nth-child(4n+1)]:lg:col-span-2">
                {ollamaModels.map(m => (
                   <ModelCard key={m.id} name={m.name} provider={m.provider} description={m.description} specs={m.specs} hasKey={true} status="online" usage={0} />
                ))}
                {ollamaModels.length === 0 && (
                   <div className="py-6 flex flex-col items-center justify-center col-span-full border border-dashed border-border rounded-md opacity-60">
                     <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No Ollama models found</p>
                     <p className="text-[8px] text-muted-foreground mt-1">Ensure Ollama is running and has downloaded models.</p>
                   </div>
                )}
              </div>
            </section>
            
            <section className="space-y-4 p-5 rounded-md bg-card border border-border mt-6">
              <SectionHeader
                icon={<Cpu size={18} className="text-blue-500" />}
                title="LM Studio Local Library"
                subtitle="Models hosted by your local LM Studio instance"
              />
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-max [&>*:nth-child(4n+1)]:md:col-span-2 [&>*:nth-child(4n+1)]:lg:col-span-2">
                {lmstudioModels.map(m => (
                   <ModelCard key={m.id} name={m.name} provider={m.provider} description={m.description} specs={m.specs} hasKey={true} status="online" usage={0} />
                ))}
                {lmstudioModels.length === 0 && (
                   <div className="py-6 flex flex-col items-center justify-center col-span-full border border-dashed border-border rounded-md opacity-60">
                     <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">No LM Studio models found</p>
                     <p className="text-[8px] text-muted-foreground mt-1">Ensure LM Studio server is running on port 1234.</p>
                   </div>
                )}
              </div>
            </section>
          </div>
          )}

          {/* ════════════════════════════════════════════════════════════════
           *  CLOUD MODELS SECTION
           * ════════════════════════════════════════════════════════════════ */}
          {showCloud && (
            <section className="space-y-5 p-5 rounded-md bg-card border border-border">
              <SectionHeader
                icon={<Globe size={18} strokeWidth={1.5} />}
                title="Cloud Models"
                subtitle="Ready to use online models"
              />

              {groupedCloud.map(([provider, models]) => (
                <div key={provider} className="space-y-4">
                  {/* Provider divider */}
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/80 shrink-0">
                      {provider}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-border/40 to-transparent" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 auto-rows-max [&>*:nth-child(4n+1)]:md:col-span-2 [&>*:nth-child(4n+1)]:lg:col-span-2">
                    {models.map((m) => (
                      <ModelCard
                        key={m.id}
                        name={m.name}
                        provider={m.provider}
                        description={m.description}
                        specs={m.specs as any}
                        usage={usage[m.provider]}
                        hasKey={!!apiKeys[m.provider]}
                        status={providerStatuses?.[m.provider]}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>

      {/* Sticky Compare Bar */}
      {compareIds.length > 0 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-[calc(100%-2rem)] max-w-md sm:w-auto bg-card border border-border px-6 py-3 rounded-md flex flex-col sm:flex-row items-center gap-3 sm:gap-4 z-50">
          <span className="text-xs font-bold text-foreground text-center">
            {compareIds.length} model{compareIds.length > 1 ? 's' : ''} selected
          </span>
          <div className="flex gap-2 w-full sm:w-auto">
            <button
              onClick={() => setCompareIds([])}
              className="flex-1 sm:flex-none text-[10px] uppercase font-bold tracking-wider text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md hover:bg-muted transition-all"
            >
              Clear
            </button>
            <button
              onClick={() => setShowCompareModal(true)}
              disabled={compareIds.length < 2}
              className="flex-1 sm:flex-none text-[10px] uppercase font-bold tracking-wider bg-[#FF3366] text-black px-4 py-1.5 rounded-md hover:bg-[#FF3366]/90 transition-all disabled:opacity-50"
            >
              Compare Models
            </button>
          </div>
        </div>
      )}

      {/* Modals */}
      <ModelComparisonModal
        show={showCompareModal}
        onClose={() => setShowCompareModal(false)}
        models={nativeModels.filter((m) => compareIds.includes(m.id))}
        compatibility={compatibility}
      />

      {/* Download Preset Modal */}
      <DownloadModal
        showDownloadModal={showDownloadModal}
        setShowDownloadModal={setShowDownloadModal}
        customUrl={customUrl}
        setCustomUrl={setCustomUrl}
        handleCustomUrlDownload={handleCustomUrlDownload}
        compatibility={compatibility}
        fetchCompatibility={fetchCompatibility}
        loadingCompatibility={loadingCompatibility}
        actionInProgress={actionInProgress}
        handleAutoSetup={handleAutoSetup}
        handleDownloadAllCompatible={handleDownloadAllCompatible}
        showCompatibleOnly={showCompatibleOnly}
        setShowCompatibleOnly={setShowCompatibleOnly}
        groupedLocalPresets={groupedLocalPresets}
        nativeModels={nativeModels}
        activeNativeId={activeNativeId}
        handleDownload={handleDownload}
        handlePause={handlePause}
        handleResume={handleResume}
        handleCancel={handleCancel}
        handleDelete={handleDelete}
      />
    </motion.div>
  );
};

export const ModelRegistryView = React.memo(ModelRegistryViewComponent);
