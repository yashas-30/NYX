// src/features/hf-explorer/HuggingFaceExplorer.tsx
// LM Studio-style split layout: fixed left panel (list) + right panel (detail)
import React, { useCallback } from 'react';
import { useDownloadStore } from '../../core/stores/useDownloadStore';
import { useHardware } from './hooks/useHardware';
import { useHfModels, useHfModelFiles, useHfModelReadme } from './hooks/useHfModels';
import { useHfDownloads } from './hooks/useHfDownloads';
import { useHfExplorerStore } from './stores/useHfExplorerStore';
import { SearchBar } from './components/SearchBar';
import { ActiveDownloads } from './components/ActiveDownloads';
import { ModelList } from './components/ModelList';
import { ModelDetail } from './components/ModelDetail';
import { ErrorBoundary } from './components/ErrorBoundary';
import { ALL_CATEGORIES } from './constants/categories';
import type { SortMode } from './types';

// Empty-state placeholder for the right panel when no model is selected
function NoModelSelected() {
  return (
    <div className="flex-1 flex flex-col items-center justify-center bg-background/50 gap-3 p-8 text-center">
      <div className="w-14 h-14 rounded-2xl bg-muted/60 border border-border/70 flex items-center justify-center text-2xl shadow-sm">
        🤗
      </div>
      <div>
        <div className="text-[14px] font-semibold text-foreground mb-1">
          Select a model
        </div>
        <div className="text-[12px] text-muted-foreground/80">
          Choose a model from the list to view details, quantized weights, and download options
        </div>
      </div>
    </div>
  );
}

export function HuggingFaceExplorer() {
  // ── Hardware ────────────────────────────────────────────────────
  const { hardware } = useHardware();

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

  const {
    data,
    fetchNextPage,
    hasNextPage,
    isFetching,
    isFetchingNextPage,
    refetch,
    error,
  } = useHfModels(queryForFetch, sortMode, filterForFetch, activeLibraryFilter);

  const models = data?.pages.flatMap((page) => page.models) ?? [];

  const { data: modelFiles = [] } = useHfModelFiles(selectedModel);
  const { data: modelReadme = '' } = useHfModelReadme(selectedModel);

  const selectedInfo = selectedModel
    ? models.find((r) => r.id === selectedModel)
    : undefined;

  // ── Downloads ───────────────────────────────────────────────────
  useHfDownloads();
  const { downloads } = useDownloadStore();

  // ── Handlers ────────────────────────────────────────────────────
  const handleSearchQueryChange = useCallback(
    (newQuery: string) => {
      setSearchQuery(newQuery);
      setActiveQuery(newQuery.trim());
    },
    [setSearchQuery, setActiveQuery]
  );

  const handleSortChange = useCallback(
    (sort: SortMode) => { setSortMode(sort); },
    [setSortMode]
  );

  const handleClear = useCallback(() => { resetExplorer(); }, [resetExplorer]);

  const handleSelectModel = useCallback(
    (modelId: string) => { setSelectedModel(modelId); },
    [setSelectedModel]
  );

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) fetchNextPage();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const handleRefresh = useCallback(() => { refetch(); }, [refetch]);

  const isLoading = isFetching && !data;
  const isLoadingMore = isFetchingNextPage;
  const loadError = error
    ? typeof error === 'string' ? error : (error as Error).message || String(error)
    : null;

  const activeCatData = ALL_CATEGORIES.find((c) => c.id === activeCategory) || ALL_CATEGORIES[0];

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div style={{ display: 'flex', height: '100%', width: '100%', overflow: 'hidden', background: '#0f0f0f' }}>
      {/* ── LEFT PANEL: Search + List ───────────────────────────── */}
      <div style={{
        width: 380,
        minWidth: 320,
        maxWidth: 420,
        flexShrink: 0,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid #1a1a1a',
        background: '#141414',
        overflow: 'hidden',
      }}>
        {/* Search bar at top */}
        <div style={{ flexShrink: 0, borderBottom: '1px solid #1a1a1a' }}>
          <SearchBar
            value={searchQuery}
            onChange={handleSearchQueryChange}
            sortMode={sortMode}
            onSortChange={handleSortChange}
            isLoading={isLoading}
            onRefresh={handleRefresh}
            onClear={handleClear}
            hasActiveQuery={!!activeQuery}
          />
        </div>

        {/* Active downloads */}
        <ActiveDownloads downloads={downloads} />

        {/* Model list — takes all remaining vertical space */}
        <ModelList
          models={models}
          selectedModel={selectedModel}
          isLoading={isLoading}
          isLoadingMore={isLoadingMore}
          hasNextPage={!!hasNextPage}
          error={loadError}
          activeQuery={activeQuery}
          activeCategoryLabel={activeCatData.label}
          onSelect={handleSelectModel}
          onLoadMore={handleLoadMore}
          onClear={handleClear}
        />
      </div>

      {/* ── RIGHT PANEL: Model Detail ───────────────────────────── */}
      <div style={{ flex: 1, minWidth: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {selectedModel ? (
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
    </div>
  );
}
