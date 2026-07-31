// src/features/hf-explorer/HuggingFaceExplorer.tsx
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
  const setActiveCategory = useHfExplorerStore((s) => s.setActiveCategory);
  const activeLibraryFilter = useHfExplorerStore((s) => s.activeLibraryFilter);
  const setActiveLibraryFilter = useHfExplorerStore((s) => s.setActiveLibraryFilter);
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

  // ── Handlers (Persisted Updates) ────────────────────────────────
  const handleSearchQueryChange = useCallback(
    (newQuery: string) => {
      setSearchQuery(newQuery);
      setActiveQuery(newQuery.trim());
      setSelectedModel(null);
    },
    [setSearchQuery, setActiveQuery, setSelectedModel]
  );

  const handleCategoryChange = useCallback(
    (catId: string) => {
      setActiveCategory(catId);
      setSelectedModel(null);
    },
    [setActiveCategory, setSelectedModel]
  );

  const handleLibraryChange = useCallback(
    (libId: string) => {
      setActiveLibraryFilter(libId);
      setSelectedModel(null);
    },
    [setActiveLibraryFilter, setSelectedModel]
  );

  const handleSortChange = useCallback(
    (sort: SortMode) => {
      setSortMode(sort);
      setSelectedModel(null);
    },
    [setSortMode, setSelectedModel]
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

  const handleCloseDetail = useCallback(() => {
    setSelectedModel(null);
  }, [setSelectedModel]);

  const handleLoadMore = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const isLoading = isFetching && !data;
  const isLoadingMore = isFetchingNextPage;

  const loadError = error
    ? typeof error === 'string'
      ? error
      : (error as Error).message || String(error)
    : null;

  const activeCatData = ALL_CATEGORIES.find((c) => c.id === activeCategory) || ALL_CATEGORIES[0];

  // ── Render ─────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full w-full bg-background overflow-hidden">
      {/* Top bar with embedded search, category & sort dropdowns */}
      <div className="shrink-0 px-4 py-3 border-b border-white/[0.08] bg-black relative z-50">
        <div className="flex items-center gap-3">
          {/* Brand Badge */}
          <div className="flex items-center gap-2 shrink-0">
            <div className="w-8 h-8 rounded bg-white/[0.06] border border-white/[0.10] flex items-center justify-center">
              <span className="text-white font-bold text-[10px] tracking-wider leading-none">HF</span>
            </div>
            <div className="hidden sm:block">
              <div className="text-[11px] font-bold text-white tracking-tight leading-none uppercase">
                Hugging Face
              </div>
              <div className="text-[9px] text-[#a1a1aa] leading-none mt-0.5 font-mono">
                EXPLORER
              </div>
            </div>
          </div>

          <div className="h-4 w-px bg-white/[0.10] shrink-0 hidden sm:block" />

          {/* SearchBar with Live Category, Library & Sort Selectors */}
          <SearchBar
            value={searchQuery}
            onChange={handleSearchQueryChange}
            activeCategory={activeCategory}
            onCategoryChange={handleCategoryChange}
            activeLibrary={activeLibraryFilter}
            onLibraryChange={handleLibraryChange}
            sortMode={sortMode}
            onSortChange={handleSortChange}
            isLoading={isLoading}
            onClear={handleClear}
            hasActiveQuery={!!activeQuery}
          />
        </div>
      </div>

      {/* Active downloads panel */}
      <ActiveDownloads downloads={downloads} />

      {/* Main Content Area */}
      <div className="flex flex-1 min-h-0 relative">
        {selectedModel ? (
          <ErrorBoundary>
            <ModelDetail
              modelId={selectedModel}
              modelInfo={selectedInfo}
              files={modelFiles}
              readme={modelReadme}
              hardware={hardware}
              downloads={downloads}
              onClose={handleCloseDetail}
            />
          </ErrorBoundary>
        ) : (
          <ModelList
            models={models}
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
        )}
      </div>
    </div>
  );
}
