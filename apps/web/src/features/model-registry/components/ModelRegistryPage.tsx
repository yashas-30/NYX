// fallow-ignore-file code-duplication
import React from 'react';
import { ModelRegistryView } from './ModelRegistryView';

interface ModelRegistryPageProps {
  models?: Record<'nyx', string>;
  selectModel?: (modelId: string) => void;
  apiKeys: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  activeMode?: 'coder' | 'registry' | 'settings' | 'compare';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings' | 'compare') => void;
  sidebarOpen?: boolean;
}

export function ModelRegistryPage(props: ModelRegistryPageProps) {
  return <ModelRegistryView {...props} />;
}
