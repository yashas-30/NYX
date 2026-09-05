/**
 * @file src/features/chat/components/ChatHeader.tsx
 * @description Floating model selector and sidebar toggle for the chat view.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { PanelLeftOpen, PanelLeftClose, Bot, ChevronDown } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { ModelSelector } from '@src/features/model-registry/ui/ModelSelector';
import { ModelInfo } from '@src/types';
import { useModelStore } from '@src/core/stores/useModelStore';
import { ProviderIcon, inferProviderFromId } from '@src/shared/components/ui/ProviderIcon';

export type { ModelInfo };

export interface ChatMetrics {
  latency: number;
  tokens: number;
  tps: number;
  totalMessages: number;
  contextTokens: number;
  contextLimit: number;
  estimatedCostUsd?: number;
}

export interface ChatHeaderProps {
  metrics: ChatMetrics;
  isLoading: boolean;
  onClear: () => void;
  onStopGeneration?: () => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  sessionTitle?: string;
  onTitleChange?: (title: string) => void;
  onOpenLightning?: () => void;
  availableModels?: any[];
  activeModel?: any;
  onModelChange?: any;
  allModels?: any[];
  currentModelId?: string | null;
  currentModel?: any;
  onModelSelect?: (id: string) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  onAttachFiles?: (files: File[]) => void;
  onExportChat?: (
    format: 'markdown' | 'json' | 'txt' | 'html' | 'obsidian' | 'notion' | 'gist'
  ) => void;
  connectionStatus?: 'online' | 'offline' | 'degraded';
  isNewChat?: boolean;
  onShareChat?: (expiration?: string) => Promise<string>;
  onToggleMemory?: () => void;
  onOpenBranchManager?: () => void;
}

export const ChatHeader: React.FC<ChatHeaderProps> = ({
  isLoading,
  onClear,
  sidebarOpen = true,
  onToggleSidebar,
  allModels,
  currentModel,
  currentModelId: propModelId,
  onModelSelect,
  providerStatuses,
  gatewayUrls,
}) => {
  const [showCloudSelector, setShowCloudSelector] = useState(false);
  const [modelSearch, setModelSearch] = useState('');
  const [selectedProvider, setSelectedProvider] = useState<string>('gemini');

  const cloudModelId = useNyxStore((s) => s.cloudModelId);
  const localModelId = useNyxStore((s) => s.localModelId);
  const setCloudModelId = useNyxStore((s) => s.setCloudModelId);
  const setLocalModelId = useNyxStore((s) => s.setLocalModelId);
  const localLibraryModels = useModelStore((s) => s.localLibraryModels);

  const effectiveModelId = cloudModelId || localModelId || propModelId;

  // Derive active model name
  const activeModelName = useMemo(() => {
    if (currentModel?.name) return currentModel.name;
    if (effectiveModelId) {
      const found =
        allModels?.find(
          (m) => m.id === effectiveModelId || (m as any).realId === effectiveModelId
        ) ||
        localLibraryModels?.find(
          (m) => m.id === effectiveModelId || (m as any).realId === effectiveModelId
        );
      if (found?.name) return found.name;
      if (effectiveModelId.includes('/') || effectiveModelId.includes('\\')) {
        const parts = effectiveModelId.split(/[/\\]/);
        return parts[parts.length - 1].replace(/\.[^/.]+$/, '');
      }
      return effectiveModelId;
    }
    return 'Select Model';
  }, [currentModel, effectiveModelId, allModels, localLibraryModels]);

  // Derive active provider
  const activeProvider = useMemo(() => {
    if (localModelId && effectiveModelId === localModelId) return 'nyx-native';
    if (currentModel?.provider) return currentModel.provider;
    if (effectiveModelId) {
      if (localLibraryModels?.some((m) => m.id === effectiveModelId)) return 'nyx-native';
      return inferProviderFromId(effectiveModelId);
    }
    return undefined;
  }, [localModelId, effectiveModelId, currentModel, localLibraryModels]);

  // Sanitize state if both models are selected
  useEffect(() => {
    if (cloudModelId && localModelId) {
      setLocalModelId(null);
    }
  }, [cloudModelId, localModelId, setLocalModelId]);

  return (
    <div className="absolute top-3 left-3 z-30 flex items-center gap-1.5 select-none pointer-events-auto">
      {onToggleSidebar && (
        <motion.button
          whileTap={{ scale: 0.95 }}
          onClick={onToggleSidebar}
          className="w-8 h-8 flex items-center justify-center rounded-lg bg-background/80 hover:bg-muted/80 backdrop-blur-md border border-border/40 text-muted-foreground hover:text-foreground transition-all cursor-pointer shadow-sm shrink-0"
          title={sidebarOpen ? 'Close sidebar' : 'Open sidebar'}
        >
          {sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
        </motion.button>
      )}

      {/* Floating Model Selector Trigger */}
      <div className="relative">
        <motion.button
          whileTap={{ scale: 0.97 }}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            if (!showCloudSelector && activeProvider) {
              setSelectedProvider(activeProvider);
            }
            setShowCloudSelector((v) => !v);
          }}
          disabled={isLoading}
          title={activeModelName ? `Model: ${activeModelName}` : 'Select AI Generation Model'}
          className={`h-8 px-2.5 flex items-center gap-2 rounded-lg backdrop-blur-md border transition-all cursor-pointer shadow-sm max-w-[220px] sm:max-w-[300px] select-none ${
            showCloudSelector
              ? 'bg-muted border-primary/50 text-foreground'
              : 'bg-background/80 hover:bg-muted/80 border-border/40 text-muted-foreground hover:text-foreground'
          } ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          <div className="shrink-0 flex items-center justify-center">
            {activeProvider ? (
              <ProviderIcon provider={activeProvider} size={14} className="shrink-0" />
            ) : (
              <Bot className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
            )}
          </div>
          <span className="text-xs font-medium text-foreground truncate max-w-[130px] sm:max-w-[200px]">
            {activeModelName}
          </span>
          <ChevronDown
            size={12}
            className={`text-muted-foreground transition-transform duration-200 shrink-0 ${
              showCloudSelector ? 'rotate-180 text-foreground' : ''
            }`}
          />
        </motion.button>

        <AnimatePresence>
          {showCloudSelector && (
            <ModelSelector
              currentModelId={cloudModelId || localModelId || undefined}
              allModels={allModels || []}
              selectedProvider={selectedProvider}
              searchTerm={modelSearch}
              onProviderChange={setSelectedProvider}
              onSearchChange={setModelSearch}
              onSelect={(id) => {
                const isLocal =
                  id &&
                  (localLibraryModels?.some((m) => m.id === id) ||
                    allModels?.find((m) => m.id === id)?.provider === 'nyx-native');
                if (isLocal) {
                  setLocalModelId(id);
                  setCloudModelId(null);
                } else {
                  setCloudModelId(id);
                  setLocalModelId(null);
                }
                if (onModelSelect && id) onModelSelect(id);
                setShowCloudSelector(false);
                setModelSearch('');
              }}
              onClose={() => setShowCloudSelector(false)}
              providerStatuses={providerStatuses || {}}
              isCoder={false}
              onResetContext={() => {
                onClear();
                toast.success('Context reset');
              }}
              gatewayUrls={gatewayUrls || {}}
              dropdown={true}
              alignDropdown="bottom"
              hideNyxNative={false}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
