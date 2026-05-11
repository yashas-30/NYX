// ─── ModelOutputCard (assembler) ──────────────────────────────────────────────
// This file is intentionally thin — it only orchestrates state and wires
// the sub-components together. To change layout or behaviour, go to:
//
//  ┌─ CardHeader.tsx    → provider bar, toggle, model name, status pill
//  ├─ CardContent.tsx   → idle / loading / error / output states
//  ├─ CardFooter.tsx    → latency, tokens, reset, remove buttons
//  ├─ ModelSelector.tsx → the provider/model dropdown overlay
//  └─ ui/ProviderIcon   → icon + provider inference logic

import React, { useEffect, useRef, useCallback, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComparisonColumn, ModelOption, OllamaModel, LMStudioModel } from '../../types';
import { inferProviderFromId } from '../ui/ProviderIcon';
import { CardHeader } from './CardHeader';
import { CardContent } from './CardContent';
import { CardFooter } from './CardFooter';
import { ModelSelector } from './ModelSelector';

interface Props {
  column: ComparisonColumn;
  allModels: ModelOption[];
  ollamaModels: OllamaModel[];
  lmStudioModels: LMStudioModel[];
  apiKeys: Record<string, string>;
  onUpdate?: (id: string, updates: Partial<ComparisonColumn>) => void;
  onModelChange?: (id: string, modelId: string) => void;
  onToggleSelection?: (id: string) => void;
  onRemove?: (id: string) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  ollamaBaseUrl?: string;
  lmStudioBaseUrl?: string;
}

const ModelOutputCardComponent: React.FC<Props> = ({
  column,
  allModels,
  ollamaModels,
  lmStudioModels,
  apiKeys,
  onUpdate,
  onModelChange,
  onToggleSelection,
  onRemove,
  providerStatuses,
  ollamaBaseUrl,
  lmStudioBaseUrl
}) => {
  const [showModelSelector, setShowModelSelector] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');

  const selectorRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const autoScroll = useRef(true);

  // ── Model resolution ────────────────────────────────────────────────────────
  const knownModel = useMemo(
    () => allModels.find(m => m.id === column.modelId),
    [allModels, column.modelId]
  );

  const ollamaModelNames = useMemo(
    () => new Set(ollamaModels.map(m => m.name)),
    [ollamaModels]
  );
  const lmStudioModelIds = useMemo(
    () => new Set(lmStudioModels.map(m => m.id)),
    [lmStudioModels]
  );

  const inferredProvider = useMemo(
    () => inferProviderFromId(
      column.modelId, 
      ollamaModelNames,
      lmStudioModelIds
    ),
    [column.modelId, ollamaModelNames, lmStudioModelIds]
  );

  const model = useMemo(
    () => knownModel ?? (column.modelId ? {
      id: column.modelId,
      name: column.modelId,
      provider: inferredProvider as any,
      description: inferredProvider === 'ollama' ? 'Local Ollama model' : 
                   inferredProvider === 'lmstudio' ? 'Local LM Studio model' : 'Model',
    } : undefined),
    [knownModel, column.modelId, inferredProvider]
  );

  // ── Sync selector tab to current model's provider ───────────────────────────
  useEffect(() => {
    if (model?.provider && model.provider !== 'terminal') {
      setSelectedProvider(model.provider);
    }
  }, [model?.provider]);

  // ── Auto-scroll on new output ────────────────────────────────────────────────
  const setScrollRef = useCallback((node: HTMLDivElement | null) => {
    scrollRef.current = node;
  }, []);

  // ── Auto-scroll: fires on every new streamed token ──────────────────────────
  useEffect(() => {
    const node = scrollRef.current;
    if (!node || !autoScroll.current) return;
    // Use requestAnimationFrame to avoid forced reflow
    // Write first, then read in next frame
    requestAnimationFrame(() => {
      if (scrollRef.current && autoScroll.current) {
        scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
      }
    });
  }, [column.output]);

  // Reset auto-scroll flag when a new generation starts
  useEffect(() => {
    if (column.status === 'loading') {
      autoScroll.current = true;
      // Scroll to top at generation start so user sees the beginning
      requestAnimationFrame(() => {
        if (scrollRef.current) {
          scrollRef.current.scrollTop = 0;
        }
      });
    }
  }, [column.status]);

  // ── Click-outside to close selector ─────────────────────────────────────────
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
        setShowModelSelector(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    // Use requestAnimationFrame to avoid forced reflow
    // Read scroll values in a separate frame from any style changes
    requestAnimationFrame(() => {
      autoScroll.current = el.scrollHeight - el.clientHeight - el.scrollTop < 60;
    });
  };

  return (
    <motion.div
      layout
      ref={selectorRef}
      whileHover={{ y: -2 }}
      className={`flex flex-col min-h-0 h-full relative rounded-2xl border-2 transition-all duration-500 ease-apple overflow-hidden ${
        column.isSelected
          ? 'bg-card border-primary ring-8 ring-primary/5 shadow-[0_20px_50px_rgba(var(--primary-rgb),0.15)] z-10 scale-[1.01]'
          : 'bg-card/60 backdrop-blur-3xl border-border-strong/50 hover:border-primary/20 shadow-xl opacity-98'
      }`}
      style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
    >
      {/* Inner clipping layer for materials */}
      <div className="absolute inset-0 overflow-hidden rounded-xl pointer-events-none">
        <AnimatePresence>
          {column.isSelected && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-primary/5 z-0"
            />
          )}
        </AnimatePresence>
      </div>

      <CardHeader
        model={model}
        column={column}
        apiKeys={apiKeys}
        showModelSelector={showModelSelector}
        onToggleSelection={() => onToggleSelection?.(column.id)}
        onToggleSelector={() => setShowModelSelector(v => !v)}
        providerStatuses={providerStatuses}
      />

      <div className="flex-1 min-h-0 relative flex flex-col">
        <AnimatePresence>
          {showModelSelector && (
            <ModelSelector
              currentModelId={column.modelId}
              allModels={allModels}
              ollamaModels={ollamaModels}
              lmStudioModels={lmStudioModels}
              selectedProvider={selectedProvider}
              searchTerm={searchTerm}
              onProviderChange={setSelectedProvider}
              onSearchChange={setSearchTerm}
              onSelect={(id) => {
                onModelChange?.(column.id, id);
                setShowModelSelector(false);
                setSearchTerm('');
              }}
              onClose={() => setShowModelSelector(false)}
              providerStatuses={providerStatuses}
              ollamaBaseUrl={ollamaBaseUrl}
              lmStudioBaseUrl={lmStudioBaseUrl}
            />
          )}
        </AnimatePresence>

        <CardContent
          column={column}
          showModelSelector={showModelSelector}
          scrollRef={setScrollRef}
          onScroll={handleScroll}
          onDismissError={() => onUpdate?.(column.id, { status: 'idle', error: undefined })}
        />
      </div>

      <CardFooter
        metadata={column.metadata}
        onReset={() => onUpdate?.(column.id, { output: '', status: 'idle', metadata: undefined })}
        onRemove={() => onRemove?.(column.id)}
      />
    </motion.div>
  );
};

export const ModelOutputCard = React.memo(ModelOutputCardComponent, (prev, next) =>
  prev.column === next.column &&
  prev.ollamaModels === next.ollamaModels &&
  prev.lmStudioModels === next.lmStudioModels &&
  prev.apiKeys === next.apiKeys &&
  prev.allModels === next.allModels &&
  prev.onUpdate === next.onUpdate &&
  prev.onModelChange === next.onModelChange &&
  prev.onToggleSelection === next.onToggleSelection &&
  prev.onRemove === next.onRemove &&
  prev.providerStatuses === next.providerStatuses
);
