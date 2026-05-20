import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ComparisonColumn, OllamaModel, LMStudioModel } from '@/src/types';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { UI_TEXT } from '../../lib/design-system/copy';
import { ModelOutputCard } from '../model-card';

interface DashboardGridProps {
  columns: ComparisonColumn[];
  ollamaModels: OllamaModel[];
  lmStudioModels: LMStudioModel[];
  apiKeys: Record<string, string>;
  onOpenForge: () => void;
  updateOutput: (id: string, updates: Partial<ComparisonColumn>) => void;
  updateModel: (id: string, modelId: string) => void;
  onToggleSelection: (id: string) => void;
  onRemoveColumn: (id: string) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  lmStudioBaseUrl: string;
  ollamaBaseUrl: string;
  gatewayUrls?: Record<string, string>;
  localModelsEnabled: boolean;
  setLocalModelsEnabled: (enabled: boolean) => void;
}

// ── Uniform spacing token ──────────────────────────────────────────────────────
// Used as grid gap AND outer padding so the edges are always equal.
const GRID_GAP = 'gap-3';
const GRID_PAD = 'p-4';

const DashboardGridComponent: React.FC<DashboardGridProps> = ({ 
  columns, 
  ollamaModels, 
  lmStudioModels,
  apiKeys,
  onOpenForge, 
  updateOutput, 
  updateModel,
  onToggleSelection,
  onRemoveColumn,
  providerStatuses,
  lmStudioBaseUrl,
  ollamaBaseUrl,
  gatewayUrls = {},
  localModelsEnabled,
  setLocalModelsEnabled
}) => {
  if (columns.length === 0) {
    return (
      <div className="h-full w-full p-[2vw] flex flex-col min-h-0 overflow-hidden">
        <div className="flex-1 min-h-0 w-full flex flex-col items-center justify-center bg-white/30 dark:bg-zinc-900/20 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl overflow-hidden shadow-xl relative p-6">
          <motion.div 
            initial={{ scale: 0.98, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            className="flex flex-col items-center text-center px-4"
          >
            <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mb-6">
              <span className="text-2xl">⚡</span>
            </div>
            <h2 className="text-xl md:text-2xl font-bold tracking-tight text-foreground break-words max-w-md">Add model to start conversation</h2>
            <p className="text-muted-foreground/50 text-[10px] font-medium uppercase tracking-widest mt-2">Select a model to begin side-by-side benchmarking</p>
            
            <button 
              onClick={() => onOpenForge()}
              className="mt-8 px-8 py-3 bg-primary text-white font-bold uppercase tracking-widest text-[10px] rounded-full hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95 hover:scale-105 whitespace-nowrap"
            >
              Add Model
            </button>
          </motion.div>
        </div>
      </div>
    );
  }

  // ── Responsive grid columns ────────────────────────────────────────────────
  // Cards always fill the viewport height minus header/footer/padding.
  const getGridCols = () => {
    switch (columns.length) {
      case 1: return 'grid-cols-1 max-w-3xl mx-auto';
      case 2: return 'grid-cols-1 md:grid-cols-2';
      case 3: return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3';
      case 4: return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-4';
      default: return 'grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4';
    }
  };

  return (
    <motion.div
      key="grid"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.2, ease: "easeOut" }}
      className="h-full w-full p-[2vw] flex flex-col min-h-0 overflow-hidden"
    >
      <motion.div
        layout
        className={`grid flex-1 min-h-0 w-full gap-4 overflow-y-auto md:overflow-hidden pb-20 md:pb-0 ${getGridCols()}`}
      >
        <AnimatePresence mode="popLayout">
          {columns.map(col => (
            <motion.div
              key={col.id}
              layout
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 10 }}
              transition={{ 
                type: "spring", 
                stiffness: 400, 
                damping: 30,
                opacity: { duration: 0.2 }
              }}
              className="min-h-[320px] md:min-h-0 flex flex-col h-auto md:h-full w-full relative"
            >
              <ModelOutputCard 
                column={col} 
                allModels={AVAILABLE_MODELS} 
                ollamaModels={ollamaModels} 
                lmStudioModels={lmStudioModels}
                apiKeys={apiKeys}
                lmStudioBaseUrl={lmStudioBaseUrl}
                ollamaBaseUrl={ollamaBaseUrl}
                onUpdate={updateOutput} 
                onModelChange={updateModel} 
                onToggleSelection={onToggleSelection}
                onRemove={onRemoveColumn}
                providerStatuses={providerStatuses}
                gatewayUrls={gatewayUrls}
                localModelsEnabled={localModelsEnabled}
                setLocalModelsEnabled={setLocalModelsEnabled}
              />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </motion.div>
  );
};

export const DashboardGrid = React.memo(DashboardGridComponent);
