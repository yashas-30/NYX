// src/features/hf-explorer/components/ModelList.tsx
import React, { useCallback } from 'react';
import { Spinner, Fire } from '@phosphor-icons/react';
import { ModelCard } from './ModelCard';
import { SkeletonCard } from './SkeletonCard';
import { EmptyState } from './EmptyState';
import { ErrorBoundary } from './ErrorBoundary';
import { formatCount } from '../lib/utils';
import type { HfModelResult } from '../types';

interface ModelListProps {
  models: HfModelResult[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasNextPage: boolean;
  error: string | null;
  activeQuery: string;
  activeCategoryLabel: string;
  onSelect: (id: string) => void;
  onLoadMore: () => void;
  onClear: () => void;
}

export function ModelList({
  models,
  isLoading,
  isLoadingMore,
  hasNextPage,
  error,
  activeQuery,
  activeCategoryLabel,
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
  const showEmpty = !isLoading && models.length === 0 && !error;
  const showError = error && !isLoading;

  return (
    <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar">
      {/* Results Header Bar */}
      <div className="px-6 py-3.5 border-b border-border/50 bg-background/80 backdrop-blur-md shrink-0 flex items-center justify-between sticky top-0 z-10">
        <div className="flex items-center gap-2">
          <span className="text-base font-black text-foreground tracking-tight">Models</span>
          {models.length > 0 && (
            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
              {formatCount(models.length)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 bg-muted/40 px-3 py-1 rounded-full border border-border/40 text-xs font-semibold text-foreground/80">
          <Fire size={12} weight="duotone" className="text-orange-400" />
          <span>{activeQuery ? `"${activeQuery}"` : activeCategoryLabel}</span>
        </div>
      </div>

      {/* Grid View — 2 Models Side-by-Side */}
      <div className="p-6">
        {showSkeleton && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <SkeletonCard key={i} />
            ))}
          </div>
        )}

        {showError && (
          <div className="flex items-start gap-3 p-4 mb-6 bg-red-500/10 border border-red-500/20 rounded-xl max-w-2xl mx-auto text-red-400">
            <span className="shrink-0 text-base">⚠</span>
            <div className="text-xs">
              <p className="font-bold mb-0.5">Failed to load models</p>
              <p className="opacity-90">{error}</p>
            </div>
          </div>
        )}

        {showEmpty && <EmptyState query={activeQuery} onClear={onClear} />}

        {!showSkeleton && models.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" role="list" aria-label="Model results">
            {models.map((model) => (
              <div key={model.id} className="h-full flex flex-col min-w-0">
                <ErrorBoundary>
                  <ModelCard model={model} onSelect={handleSelect} />
                </ErrorBoundary>
              </div>
            ))}
          </div>
        )}

        {isLoadingMore && (
          <div className="flex items-center justify-center gap-2 py-6">
            <Spinner size={16} className="animate-spin text-primary" />
            <span className="text-xs text-muted-foreground font-semibold">Loading more models…</span>
          </div>
        )}

        {hasNextPage && models.length > 0 && !isLoadingMore && (
          <div className="mt-8 flex justify-center">
            <button
              onClick={onLoadMore}
              className="py-2.5 px-8 rounded-full bg-secondary hover:bg-secondary/80 border border-border text-xs font-bold text-foreground transition-all flex items-center gap-2 shadow-xs hover:shadow-sm"
            >
              Load More Models
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
