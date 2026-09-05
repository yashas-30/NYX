// src/features/hf-explorer/HuggingFaceExplorer.tsx
// LM Studio-style split layout: fixed left panel (list) + right panel (detail)
import React, { useCallback, useState, useEffect } from 'react';
import { useDownloadStore } from '../../core/stores/useDownloadStore';
import { useHardware } from './hooks/useHardware';
import {
  useHfModels,
  useHfModelFiles,
  useHfModelReadme,
  useHfModelDetail,
} from './hooks/useHfModels';
import { useHfDownloads } from './hooks/useHfDownloads';
import { useHfExplorerStore } from './stores/useHfExplorerStore';
import { SearchBar, type ExplorerTab } from './components/SearchBar';
import { FloatingDownloadManager } from './components/FloatingDownloadManager';
import { OnDeviceModelList } from './components/OnDeviceModelList';
import { OnDeviceModelDetail } from './components/OnDeviceModelDetail';
import { CloudProviderList } from './components/CloudProviderList';
import { CloudProviderModelsView } from './components/CloudProviderModelsView';
import { ModelList } from './components/ModelList';
import { ModelDetail } from './components/ModelDetail';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ALL_CATEGORIES } from './constants/categories';
import { useLocalModels, isModelLoaded } from '../../shared/hooks/useLocalModels';
import { useModelStore } from '../../core/stores/useModelStore';
import { useNyxStore, DEFAULT_SETTINGS, type ModelSettings } from '../../shared/store/useNyxStore';
import { AVAILABLE_MODELS } from '../../shared/config/models';
import type { ModelOption } from '../../types';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { confirm } from '@tauri-apps/plugin-dialog';
import { toast } from 'sonner';
import { Desktop, Cloud } from '@phosphor-icons/react';
import type { SortMode } from './types';

// Empty-state placeholder for the right panel when no model is selected
function NoModelSelected() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background/50 gap-3 p-8 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/70 flex items-center justify-center text-2xl shadow-sm">
        🤗
      </div>
      <div>
        <div className="text-[14px] font-semibold text-foreground mb-1">Select a model</div>
        <div className="text-[12px] text-muted-foreground/80">
          Choose a model from the list to view details, quantized weights, and download options
        </div>
      </div>
    </div>
  );
}

function NoOnDeviceModelSelected({ onReturnToHf }: { onReturnToHf: () => void }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background/50 gap-3 p-8 text-center select-none">
      <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/70 flex items-center justify-center text-primary shadow-sm">
        <Desktop size={26} weight="duotone" />
      </div>
      <div>
        <div className="text-[14px] font-semibold text-foreground mb-1">
          Select an On-Device Model
        </div>
        <div className="text-[12px] text-muted-foreground/80">
          Choose an installed model from the list to load it into VRAM, manage settings, or view
          hardware allocation
        </div>
      </div>
      <button
        onClick={onReturnToHf}
        className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
      >
        Explore Hugging Face Models
      </button>
    </div>
  );
}

export function HuggingFaceExplorer() {
  // ── Hardware ────────────────────────────────────────────────────
  const { hardware } = useHardware();

  // ── Navigation Tab State ('hf' | 'on-device' | 'cloud') ─────────
  const [activeTab, setActiveTab] = useState<ExplorerTab>('hf');

  // ── On-Device / Local Models State ──────────────────────────────
  const [selectedOnDeviceModel, setSelectedOnDeviceModel] = useState<any | null>(null);
  const localModelsQuery = useLocalModels(true);
  const localModels = localModelsQuery.data?.models || [];
  const loadedLocalModel = useModelStore((s) => s.loadedLocalModel);
  const setLoadedLocalModel = useModelStore((s) => s.setLoadedLocalModel);
  const modelConfigs = useNyxStore((s) => s.modelConfigs);

  // ── Cloud Models State ──────────────────────────────────────────
  const [selectedCloudProvider, setSelectedCloudProvider] = useState<string>('gemini');

  const [loadingState, setLoadingState] = useState<
    'idle' | 'loading' | 'unloading' | 'uninstalling'
  >('idle');

  // Auto-select first local model when switching to on-device view if none selected
  useEffect(() => {
    if (activeTab === 'on-device' && !selectedOnDeviceModel && localModels.length > 0) {
      setSelectedOnDeviceModel(localModels[0]);
    }
  }, [activeTab, selectedOnDeviceModel, localModels]);

  const handleLoadModel = async (modelId: string) => {
    try {
      setLoadingState('loading');

      let deferredResolve!: () => void;
      let deferredReject!: (err: Error) => void;
      const readyPromise = new Promise<void>((res, rej) => {
        deferredResolve = res;
        deferredReject = rej;
      });

      let unlistenFns: Array<() => void> = [];
      let timeoutId: ReturnType<typeof setTimeout> | undefined;
      const cleanup = () => {
        if (timeoutId !== undefined) clearTimeout(timeoutId);
        for (const fn of unlistenFns) fn();
        unlistenFns = [];
      };

      const [unlistenReady, unlistenError, unlistenVram] = await Promise.all([
        listen<{ status: string }>('llm-server-ready', () => {
          cleanup();
          deferredResolve();
        }),
        listen<{ error: string }>('llm-server-error', (event) => {
          cleanup();
          deferredReject(new Error(event.payload.error));
        }),
        listen<{
          ngl: number;
          fully_gpu: boolean;
          suggest_cloud_fallback: boolean;
          message: string;
        }>('vram-decision', (event) => {
          if (event.payload.suggest_cloud_fallback) {
            toast.warning(event.payload.message, { duration: 10000, id: 'vram-decision' });
          } else {
            toast.info(event.payload.message, { id: 'vram-decision' });
          }
        }),
      ]);

      unlistenFns = [unlistenReady, unlistenError, unlistenVram];
      timeoutId = setTimeout(() => {
        cleanup();
        deferredReject(new Error('Model load timed out after 300 seconds.'));
      }, 300_000);

      // Ensure any running instance is stopped first before loading with new settings
      await invoke('stop_local_server').catch(() => {});

      const targetConfig: ModelSettings = {
        ...DEFAULT_SETTINGS,
        contextSize: modelConfigs?.[modelId]?.contextSize ?? 32768,
        ...modelConfigs?.[modelId],
      };
      invoke('start_local_server', {
        modelId,
        contextSize: targetConfig.contextSize,
        gpuLayers: targetConfig.gpuLayers,
        cpuThreads: targetConfig.threads,
        flashAttention: targetConfig.flashAttention ?? true,
        kvCacheType: targetConfig.kvCacheType,
        useMlock: targetConfig.useMlock ?? false,
        batchSize: targetConfig.batchSize,
        draftModelId: targetConfig.draftModelId,
        disableKvOffload: targetConfig.disableKvOffload ?? false,
      }).catch((err) => {
        cleanup();
        deferredReject(new Error(String(err)));
      });

      await readyPromise;
      setLoadedLocalModel(modelId);
      toast.success(`Model ${modelId} active in GPU VRAM`);
    } catch (e: any) {
      console.error('Failed to load model', e);
      toast.error(`Failed to load model: ${e?.message || e}`);
    } finally {
      setLoadingState('idle');
    }
  };

  const handleUnloadModel = async () => {
    try {
      setLoadingState('unloading');
      await invoke('stop_local_server');
      setLoadedLocalModel(null);
      toast.info('Model unloaded from GPU');
    } catch (e: any) {
      console.error('Failed to unload model', e);
      toast.error(`Failed to unload model: ${e?.message || e}`);
    } finally {
      setLoadingState('idle');
    }
  };

  const handleUninstallModel = async (modelId: string) => {
    try {
      const confirmed = await confirm(`Are you sure you want to delete ${modelId} from disk?`);
      if (!confirmed) return;

      if (isModelLoaded(modelId, loadedLocalModel)) {
        await handleUnloadModel();
      }

      setLoadingState('uninstalling');
      await invoke('hf_uninstall_model', { filename: modelId });
      await localModelsQuery.refetch();
      if (selectedOnDeviceModel?.id === modelId) {
        setSelectedOnDeviceModel(null);
      }
      toast.success(`Model ${modelId} deleted from disk`);
    } catch (e: any) {
      console.error('Failed to uninstall model', e);
      toast.error(`Failed to delete model: ${e?.message || e}`);
    } finally {
      setLoadingState('idle');
    }
  };

  // ── Persistent Search & Filter State (Stored in Zustand) ───────
  const searchQuery = useHfExplorerStore((s) => s.searchQuery);
  const setSearchQuery = useHfExplorerStore((s) => s.setSearchQuery);
  const activeQuery = useHfExplorerStore((s) => s.activeQuery);
  const setActiveQuery = useHfExplorerStore((s) => s.setActiveQuery);
  const sortMode = useHfExplorerStore((s) => s.sortMode);
  const setSortMode = useHfExplorerStore((s) => s.setSortMode);
  const activeCategory = useHfExplorerStore((s) => s.activeCategory);
  const activeLibraryFilter = useHfExplorerStore((s) => s.activeLibraryFilter);
  const selectedModel = useHfExplorerStore((s) => s.selectedModel);
  const setSelectedModel = useHfExplorerStore((s) => s.setSelectedModel);
  const resetExplorer = useHfExplorerStore((s) => s.resetExplorer);

  // ── TanStack Query Data ─────────────────────────────────────────
  const cat = ALL_CATEGORIES.find((c) => c.id === activeCategory);
  const queryForFetch = activeQuery || '';
  const filterForFetch = cat?.query || undefined;

  const { data, fetchNextPage, hasNextPage, isFetching, isFetchingNextPage, refetch, error } =
    useHfModels(queryForFetch, sortMode, filterForFetch, activeLibraryFilter);

  const models = data?.pages.flatMap((page) => page.models) ?? [];

  const { data: modelFiles = [] } = useHfModelFiles(selectedModel);
  const { data: modelReadme = '' } = useHfModelReadme(selectedModel);
  const { data: fullModelDetail } = useHfModelDetail(selectedModel);

  const searchMatch = selectedModel ? models.find((r) => r.id === selectedModel) : undefined;
  const selectedInfo = fullModelDetail || searchMatch;

  // ── Downloads ───────────────────────────────────────────────────
  useHfDownloads();
  const { downloads } = useDownloadStore();

  // ── Handlers ────────────────────────────────────────────────────
  const searchDebounce = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleSearchQueryChange = useCallback(
    (newQuery: string) => {
      setSearchQuery(newQuery);
      if (searchDebounce.current) clearTimeout(searchDebounce.current);
      searchDebounce.current = setTimeout(() => {
        setActiveQuery(newQuery.trim());
      }, 350);
    },
    [setSearchQuery, setActiveQuery]
  );

  const handleSortChange = useCallback(
    (sort: SortMode) => {
      setSortMode(sort);
    },
    [setSortMode]
  );

  const handleClear = useCallback(() => {
    resetExplorer();
  }, [resetExplorer]);

  const handleSelectModel = useCallback(
    (modelId: string) => {
      setSelectedModel(modelId);
    },
    [setSelectedModel]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isLoading = isFetching && !data;
  const isLoadingMore = isFetchingNextPage;
  const loadError = error
    ? typeof error === 'string'
      ? error
      : (error as Error).message || String(error)
    : null;

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="relative flex h-full w-full overflow-hidden bg-background">
      {/* ── LEFT PANEL: Search + List ───────────────────────────── */}
      <div className="w-[380px] min-w-[320px] max-w-[420px] shrink-0 flex flex-col border-r border-border bg-card overflow-hidden">
        {/* Search & Tool bar at top */}
        <div className="shrink-0 border-b border-border">
          <SearchBar
            value={searchQuery}
            onChange={handleSearchQueryChange}
            sortMode={sortMode}
            onSortChange={handleSortChange}
            isLoading={isLoading}
            onClear={handleClear}
            hasActiveQuery={!!activeQuery}
            activeTab={activeTab}
            onTabChange={setActiveTab}
            onDeviceCount={localModels.length}
          />
        </div>

        {/* Model list (On-Device, Cloud, or Hugging Face) */}
        {activeTab === 'on-device' ? (
          <OnDeviceModelList
            models={localModels}
            selectedModelId={selectedOnDeviceModel?.id ?? null}
            loadedModelId={loadedLocalModel}
            searchQuery={searchQuery}
            onSelect={setSelectedOnDeviceModel}
            onReturnToHf={() => setActiveTab('hf')}
          />
        ) : activeTab === 'cloud' ? (
          <CloudProviderList
            selectedProvider={selectedCloudProvider}
            onSelectProvider={setSelectedCloudProvider}
            searchQuery={searchQuery}
          />
        ) : (
          <ModelList
            models={models}
            selectedModel={selectedModel}
            isLoading={isLoading}
            isLoadingMore={isLoadingMore}
            hasNextPage={!!hasNextPage}
            error={loadError}
            activeQuery={activeQuery}
            hardware={hardware}
            onSelect={handleSelectModel}
            onLoadMore={handleLoadMore}
            onClear={handleClear}
          />
        )}
      </div>

      {/* ── RIGHT PANEL: Model Detail (On-Device, Cloud, or Hugging Face) ── */}
      <div className="flex-1 min-w-0 overflow-hidden flex flex-col bg-background">
        {activeTab === 'on-device' ? (
          selectedOnDeviceModel ? (
            <OnDeviceModelDetail
              model={selectedOnDeviceModel}
              isLoaded={isModelLoaded(selectedOnDeviceModel.id, loadedLocalModel)}
              loadingState={loadingState}
              onLoad={handleLoadModel}
              onUnload={handleUnloadModel}
              onUninstall={handleUninstallModel}
            />
          ) : (
            <NoOnDeviceModelSelected onReturnToHf={() => setActiveTab('hf')} />
          )
        ) : activeTab === 'cloud' ? (
          <CloudProviderModelsView providerId={selectedCloudProvider} searchQuery={searchQuery} />
        ) : selectedModel ? (
          <ErrorBoundary>
            <ModelDetail
              modelId={selectedModel}
              modelInfo={selectedInfo}
              files={modelFiles}
              readme={modelReadme}
              hardware={hardware}
              downloads={downloads}
            />
          </ErrorBoundary>
        ) : (
          <NoModelSelected />
        )}
      </div>

      {/* ── FLOATING DOWNLOAD MANAGER: Bottom Right Corner ─────────── */}
      <FloatingDownloadManager downloads={downloads} />
    </div>
  );
}
