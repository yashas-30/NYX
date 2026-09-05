import React from 'react';
import { motion } from 'framer-motion';
import { HuggingFaceExplorer } from './HuggingFaceExplorer';

interface ModelRegistryViewProps {
  models?: Record<'nyx', string>;
  selectModel?: (modelId: string) => void;
  apiKeys?: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  activeMode?: 'coder' | 'registry' | 'settings' | 'compare';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings' | 'compare') => void;
  sidebarOpen?: boolean;
}

const ModelRegistryViewComponent: React.FC<ModelRegistryViewProps> = () => {
  return (
    <motion.div
      key="registry"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.05 }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        <HuggingFaceExplorer />
      </div>
    </motion.div>
  );
};

export const ModelRegistryView = React.memo(ModelRegistryViewComponent);
