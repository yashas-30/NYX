// fallow-ignore-file code-duplication
import React from 'react';
import { ModelComparisonView } from './ModelComparisonView';

interface ModelComparisonPageProps {
  sidebarOpen?: boolean;
  activeMode?: string;
  setActiveMode?: (mode: string) => void;
}

export function ModelComparisonPage(props: ModelComparisonPageProps) {
  return <ModelComparisonView {...props} />;
}
