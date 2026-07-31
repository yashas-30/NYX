// src/features/hf-explorer/components/EmptyState.tsx
import { Fire } from '@phosphor-icons/react';

interface EmptyStateProps {
  query: string;
  onClear: () => void;
}

export function EmptyState({ query, onClear }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className="w-16 h-16 rounded-2xl bg-muted/50 flex items-center justify-center mb-4">
        <Fire size={24} className="text-muted-foreground/30" />
      </div>
      <p className="text-sm font-bold text-foreground/70 mb-1">
        {query ? 'No models found' : 'Start exploring'}
      </p>
      <p className="text-xs text-muted-foreground/50 max-w-xs mb-4">
        {query
          ? `No GGUF models match "${query}". Try a different search term.`
          : 'Search for models or browse categories in the sidebar.'}
      </p>
      {query && (
        <button
          onClick={onClear}
          className="text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
        >
          Clear search
        </button>
      )}
    </div>
  );
}
