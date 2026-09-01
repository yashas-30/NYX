// src/features/hf-explorer/components/ModelList.tsx
// LM Studio-style vertical scrollable model list for the left panel
import React, { useCallback } from 'react';
import { ModelCard } from './ModelCard';
import { ErrorBoundary } from './ErrorBoundary';
import type { HfModelResult, HardwareSpecs } from '../types';

interface ModelListProps {
  models: HfModelResult[];
  selectedModel: string | null;
  isLoading: boolean;
  isLoadingMore: boolean;
  hasNextPage: boolean;
  error: string | null;
  activeQuery: string;
  hardware?: HardwareSpecs | null;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onClear: () => void;
}

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <div className="flex items-center gap-2.5 p-3 min-h-[56px] border-b border-border/40">
      <div className="w-9 h-9 rounded-lg shrink-0 bg-muted animate-pulse" />
      <div className="flex-1 flex flex-col gap-1.5">
        <div className="h-3 w-[55%] rounded bg-muted animate-pulse" />
        <div className="h-2.5 w-[80%] rounded bg-muted/60 animate-pulse" />
      </div>
    </div>
  );
}

export function ModelList({
  models,
  selectedModel,
  isLoading,
  isLoadingMore,
  hasNextPage,
  error,
  activeQuery,
  hardware,
  onSelect,
  onLoadMore,
  onClear,
}: ModelListProps) {
  const handleSelect = useCallback(
    (id: string) => {
      onSelect(id);
    },
    [onSelect]
  );

  const showSkeleton = isLoading && models.length === 0;

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden scrollbar-thin">
      {/* Error state */}
      {error && !isLoading && (
        <div className="m-3 p-3 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs">
          <div className="font-semibold mb-0.5">Failed to load</div>
          <div className="opacity-80">{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && models.length === 0 && !error && (
        <div className="flex flex-col items-center justify-center p-10 text-center gap-2">
          <div className="text-2xl">🔍</div>
          <div className="text-xs text-muted-foreground font-medium">
            {activeQuery ? `No results for "${activeQuery}"` : 'No models found'}
          </div>
          {activeQuery && (
            <button
              onClick={onClear}
              className="mt-1 text-xs text-primary hover:underline cursor-pointer"
            >
              Clear search
            </button>
          )}
        </div>
      )}

      {/* Skeleton loading */}
      {showSkeleton && (
        <>
          {Array.from({ length: 10 }).map((_, i) => (
            <SkeletonRow key={i} />
          ))}
        </>
      )}

      {/* Model rows */}
      {!showSkeleton && models.length > 0 && (
        <div>
          {models.map((model) => (
            <ErrorBoundary key={model.id}>
              <ModelCard
                model={model}
                isSelected={selectedModel === model.id}
                hardware={hardware}
                onSelect={handleSelect}
              />
            </ErrorBoundary>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && models.length > 0 && !isLoadingMore && (
        <div className="p-3">
          <button
            onClick={onLoadMore}
            className="w-full py-2 rounded-md bg-muted hover:bg-muted/80 border border-border text-muted-foreground hover:text-foreground text-xs font-semibold cursor-pointer transition-colors"
          >
            Load more
          </button>
        </div>
      )}

      {isLoadingMore && (
        <div className="p-3 text-center text-xs text-muted-foreground animate-pulse">Loading…</div>
      )}
    </div>
  );
}
