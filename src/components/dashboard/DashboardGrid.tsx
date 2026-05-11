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
  ollamaBaseUrl
}) => {
  if (columns.length === 0) {
    return (
      <div className={`flex-1 flex flex-col items-center justify-center ${GRID_PAD}`}>
        <motion.div 
          initial={{ scale: 0.98, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="flex flex-col items-center text-center"
        >
          <h2 className="text-xl font-bold tracking-tight text-foreground">{UI_TEXT.history.empty}</h2>
          <p className="text-muted-foreground/60 text-[10px] font-medium uppercase tracking-widest mt-2 opacity-50">No models initialized</p>
          
          <button 
            onClick={() => onOpenForge()}
            className="mt-8 px-8 py-3 bg-primary text-white font-bold uppercase tracking-widest text-[9px] rounded-full hover:bg-primary/90 transition-all shadow-xl shadow-primary/20 active:scale-95"
          >
            {UI_TEXT.registry.add}
          </button>
        </motion.div>
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
      layout
      className={`grid w-full h-full ${GRID_GAP} ${GRID_PAD} ${getGridCols()}`}
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
            className="min-h-0 flex flex-col h-full"
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
            />
          </motion.div>
        ))}
      </AnimatePresence>
    </motion.div>
  );
};

export const DashboardGrid = React.memo(DashboardGridComponent);
