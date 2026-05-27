import React from 'react';
import { SettingsView } from './SettingsView';

interface SettingsPageProps {
  apiKeys: Record<string, string>;
  updateApiKey: (provider: string, key: string) => void;
  clearApiKeys: () => void;
  activeMode?: 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
}

export function SettingsPage(props: SettingsPageProps) {
  return <SettingsView {...props} />;
}
