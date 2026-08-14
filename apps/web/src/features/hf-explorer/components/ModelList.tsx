// src/features/hf-explorer/components/ModelList.tsx
// LM Studio-style vertical scrollable model list for the left panel
import React, { useCallback } from 'react';
import { ModelCard } from './ModelCard';
import { ErrorBoundary } from './ErrorBoundary';
import type { HfModelResult } from '../types';

interface ModelListProps {
  models: HfModelResult[];
  selectedModel: string | null;
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

// Skeleton row for loading state
function SkeletonRow() {
  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      gap: 10,
      padding: '8px 12px',
      minHeight: 56,
    }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, flexShrink: 0,
        background: '#2a2a2a',
        animation: 'pulse 1.5s ease-in-out infinite',
      }} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <div style={{
          height: 12, width: '55%', borderRadius: 4, background: '#2a2a2a',
          animation: 'pulse 1.5s ease-in-out infinite',
        }} />
        <div style={{
          height: 10, width: '80%', borderRadius: 4, background: '#222',
          animation: 'pulse 1.5s ease-in-out infinite 0.2s',
        }} />
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
  onSelect,
  onLoadMore,
  onClear,
}: ModelListProps) {
  const handleSelect = useCallback((id: string) => { onSelect(id); }, [onSelect]);

  const showSkeleton = isLoading && models.length === 0;

  return (
    <div
      style={{
        flex: 1,
        overflowY: 'auto',
        overflowX: 'hidden',
        scrollbarWidth: 'thin',
        scrollbarColor: 'rgba(255,255,255,0.08) transparent',
      }}
    >
      {/* Error state */}
      {error && !isLoading && (
        <div style={{
          margin: '12px 8px',
          padding: '10px 12px',
          borderRadius: 8,
          background: 'rgba(239,68,68,0.08)',
          border: '1px solid rgba(239,68,68,0.2)',
          color: '#f87171',
          fontSize: 11,
        }}>
          <div style={{ fontWeight: 600, marginBottom: 2 }}>Failed to load</div>
          <div style={{ opacity: 0.8 }}>{error}</div>
        </div>
      )}

      {/* Empty state */}
      {!isLoading && models.length === 0 && !error && (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 20px',
          textAlign: 'center',
          gap: 8,
        }}>
          <div style={{ fontSize: 28 }}>🔍</div>
          <div style={{ fontSize: 13, color: '#a1a1aa', fontWeight: 500 }}>
            {activeQuery ? `No results for "${activeQuery}"` : 'No models found'}
          </div>
          {activeQuery && (
            <button
              onClick={onClear}
              style={{
                marginTop: 4,
                fontSize: 11,
                color: '#3b82f6',
                background: 'none',
                border: 'none',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
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
                onSelect={handleSelect}
              />
            </ErrorBoundary>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasNextPage && models.length > 0 && !isLoadingMore && (
        <div style={{ padding: '8px 12px' }}>
          <button
            onClick={onLoadMore}
            style={{
              width: '100%',
              padding: '7px',
              borderRadius: 6,
              background: '#232323',
              border: '1px solid #2a2a2a',
              color: '#a1a1aa',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.15s',
            }}
            onMouseEnter={e => (e.currentTarget as HTMLButtonElement).style.background = '#2a2a2a'}
            onMouseLeave={e => (e.currentTarget as HTMLButtonElement).style.background = '#232323'}
          >
            Load more
          </button>
        </div>
      )}

      {isLoadingMore && (
        <div style={{ padding: '8px', textAlign: 'center', fontSize: 11, color: '#52525b' }}>
          Loading…
        </div>
      )}
    </div>
  );
}
