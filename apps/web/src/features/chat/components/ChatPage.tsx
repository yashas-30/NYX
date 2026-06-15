// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatPage.tsx
 * @description Production-grade Chat feature page with Claude/Kimi-parity
 *   architecture: streams metrics, context tracking, model selectors,
 *   attachment sync, and coordinates chat sessions with edit/regenerate/branch capabilities.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { ModelDefinition, ChatMessage, ToolCall } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatPromptInput } from './ChatPromptInput';
import { ChatSidebar } from './ChatSidebar';
import { ChatSettings } from './ChatSettings';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { useChatLogic } from '../hooks/useChatLogic';
import { ArtifactCanvas } from '../../artifacts/components/ArtifactCanvas';
import { ContextBar } from '@src/shared/components/ContextBar';
import { MemoryPanel } from './MemoryPanel';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatPageProps {
  allModels: ModelDefinition[];
  apiKeys: Record<string, string>;
  modelSettings: any;
  trackUsage: (provider: string, tokens: number) => void;
  setModelSettings: (settings: any) => void;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  gatewayUrls?: Record<string, string>;
  activeMode?: 'chat' | 'coder' | 'registry' | 'settings';
  setActiveMode?: (mode: 'chat' | 'coder' | 'registry' | 'settings') => void;
  sidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatSessions: any;

  // Lifted state from parent:
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  onOpenLightning?: () => void;
  submitReward?: (id: string, reward: number) => void;
  logRollout?: any;

  // Microsoft Lightning:
  lightningEnabled?: boolean;
  lightningDirectives?: string[];
}

interface ChatImage {
  name: string;
  mimeType: string;
  data: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getModelContextWindow(model: any): number {
  if (!model) return 128000;
  if (typeof model.contextWindow === 'number') return model.contextWindow;
  if (typeof model.contextWindow === 'string') {
    const parsed = parseInt(model.contextWindow);
    if (!isNaN(parsed)) {
      if (model.contextWindow.toLowerCase().includes('m')) return parsed * 1000000;
      if (model.contextWindow.toLowerCase().includes('k')) return parsed * 1000;
      return parsed;
    }
  }
  // Try specs
  if (model.specs && model.specs.contextWindow) {
    const val = model.specs.contextWindow;
    if (typeof val === 'number') return val;
    const parsed = parseInt(String(val));
    if (!isNaN(parsed)) {
      if (String(val).toLowerCase().includes('m')) return parsed * 1000000;
      if (String(val).toLowerCase().includes('k')) return parsed * 1000;
      return parsed;
    }
  }
  return 128000;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatPage: React.FC<ChatPageProps> = ({
  allModels,
  apiKeys,
  modelSettings,
  trackUsage,
  setModelSettings,
  providerStatuses = {},
  gatewayUrls = {},
  activeMode = 'chat',
  setActiveMode,
  sidebarOpen = true,
  onToggleSidebar,
  chatSessions,

  // Lifted props:
  models,
  setModel,
  onOpenLightning,
  submitReward,

  lightningEnabled = true,
  lightningDirectives = [],
  logRollout,
  ...rest
}) => {
  // --- Local input and attachment states ---
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  
  // --- Artifact State ---
  const [activeArtifact, setActiveArtifact] = useState<{
    id?: string;
    content: string;
    language?: string;
    title?: string;
  } | null>(null);

  // --- Model resolution ---
  const currentModelId = models['nyx'];

  const mergedModels = useMemo(() => {
    const seenIds = new Set<string>();
    return allModels.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels]);

  const currentModel = useMemo(() => {
    if (!currentModelId) return null;
    return mergedModels.find((m) => m.id === currentModelId) || null;
  }, [currentModelId, mergedModels]);

  const {
    activeAgent,
    isLoading,
    history,
    metrics: parentMetrics,
    runChat: parentRunChat,
    stopChat,
    clearHistory: parentClearHistory,
    suggestedPrompts,
    editMessage: handleEditMessage,
    regenerateMessage: handleRegenerate,
    branchFromMessage: handleBranch,
  } = useChatLogic({
    apiKeys,
    modelSettings,
    trackUsage,
    models,
    setModel,
    chatSessions,
    lightningEnabled,
    lightningDirectives,
    logRollout,
    submitReward,
    maxContextTokens: Math.floor(getModelContextWindow(currentModel) * 0.9),
  });

  const hasAutoOpenedRef = useRef<Record<string, boolean>>({});

  // Auto-open and sync streaming artifacts
  useEffect(() => {
    if (history.length === 0) return;
    const lastMessage = history[history.length - 1];
    if (lastMessage?.role === 'assistant' && lastMessage.artifacts && lastMessage.artifacts.length > 0) {
      const latestArtifact = lastMessage.artifacts[lastMessage.artifacts.length - 1];
      if (latestArtifact && latestArtifact.id) {
        const alreadyOpened = hasAutoOpenedRef.current[latestArtifact.id];
        
        if (activeArtifact && (activeArtifact.id === latestArtifact.id || activeArtifact.title === latestArtifact.title)) {
          // Sync content if it's already open and has updated
          if (activeArtifact.content !== latestArtifact.content) {
            setActiveArtifact(latestArtifact);
          }
        } else if (!activeArtifact && !alreadyOpened && isLoading) {
          // Auto-open only if it's a new artifact, hasn't been auto-opened yet, and we are currently loading/streaming
          hasAutoOpenedRef.current[latestArtifact.id] = true;
          setActiveArtifact(latestArtifact);
        }
      }
    }
  }, [history, activeArtifact, isLoading]);

  const streaming = (rest as any).streaming;

  // --- Context window token estimation ---
  const contextTokens = useMemo(() => {
    const totalChars = history.reduce((acc, msg) => acc + (msg.content?.length || 0), 0);
    return Math.round(totalChars / 4);
  }, [history]);

  // --- Metrics enriched for the Header ---
  const metrics = useMemo(
    () => ({
      latency: parentMetrics?.latency || 0,
      tokens: parentMetrics?.tokens || 0,
      tps: parentMetrics?.tps || 0,
      totalMessages: history.length,
      contextTokens,
      contextLimit: getModelContextWindow(currentModel),
    }),
    [parentMetrics, history.length, contextTokens, currentModel]
  );

  // --- Submit handler ---
  const handleSubmit = useCallback(
    (finalPrompt: string, images?: ChatImage[]) => {
      if ((!finalPrompt.trim() && (!images || images.length === 0)) || isLoading) return;
      if (!currentModelId) {
        toast.error('Please select a model first');
        return;
      }
      parentRunChat(finalPrompt, images || pendingImages);
      setPrompt('');
      setPendingImages([]);
    },
    [isLoading, currentModelId, parentRunChat, pendingImages]
  );

  // --- Copy handler ---
  const copyToClipboard = useCallback((text: string, id: string) => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
        toast.success('Message copied to clipboard');
      })
      .catch(() => {
        toast.error('Failed to copy');
      });
  }, []);

  // --- Image & Document attachment handlers ---
  const handleAttachFiles = useCallback((files: File[]) => {
    const images: File[] = [];
    const documents: File[] = [];

    files.forEach((file) => {
      if (file.type.startsWith('image/')) {
        images.push(file);
      } else {
        documents.push(file);
      }
    });

    // Handle Documents (RAG Ingestion)
    documents.forEach(async (file) => {
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`Document ${file.name} is too large (max 10MB)`);
        return;
      }
      try {
        const formData = new FormData();
        formData.append('file', file);
        const res = await fetchWithAuth('/api/v1/documents/upload', {
          method: 'POST',
          body: formData,
        });
        if (!res.ok) throw new Error(res.statusText);
        toast.success(`Document "${file.name}" ingested into RAG memory!`);
      } catch (err: any) {
        toast.error(`Failed to ingest ${file.name}: ${err.message}`);
      }
    });

    // Handle Images
    const promises = images.map((file) => {
      return new Promise<ChatImage>((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          resolve({
            name: file.name,
            mimeType: file.type,
            data: (e.target?.result as string)?.split(',')[1] || '',
          });
        };
        reader.readAsDataURL(file);
      });
    });

    if (images.length > 0) {
      Promise.all(promises).then((newImages) => {
        setPendingImages((prev) => [...prev, ...newImages]);
        toast.success(`Attached ${newImages.length} image(s)`);
      });
    }
  }, []);

  const handleRemoveImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  // --- Export chat ---
  const handleExport = useCallback(
    (format: 'markdown' | 'json' | 'txt') => {
      let content: string;
      let mimeType: string;
      let extension: string;

      switch (format) {
        case 'markdown': {
          const md = history
            .map((m) => {
              const role = m.role === 'user' ? 'User' : 'Assistant';
              return `## ${role}\n\n${m.content}\n`;
            })
            .join('\n---\n\n');
          content = `# Chat Export\n\n${md}`;
          mimeType = 'text/markdown';
          extension = 'md';
          break;
        }
        case 'json':
          content = JSON.stringify(
            {
              model: currentModelId,
              exportedAt: new Date().toISOString(),
              messages: history,
            },
            null,
            2
          );
          mimeType = 'application/json';
          extension = 'json';
          break;
        case 'txt':
          content = history.map((m) => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n');
          mimeType = 'text/plain';
          extension = 'txt';
          break;
      }

      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `nyx-chat-${Date.now()}.${extension}`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported chat as ${format.toUpperCase()}`);
    },
    [history, currentModelId]
  );

  // --- Share chat ---
  const handleShareChat = useCallback(async (): Promise<string> => {
    if (!chatSessions?.activeSid) throw new Error('No active session');
    const res = await fetch(`/api/v1/conversations/${chatSessions.activeSid}/share`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });
    if (!res.ok) throw new Error('Failed to share chat');
    const data = await res.json();
    // Return the full URL to the frontend route for shared chats
    return `${window.location.origin}/share/${data.shareId}`;
  }, [chatSessions?.activeSid]);

  // --- Model selection switch with warnings ---
  const handleModelChange = useCallback(
    (modelId: string) => {
      const model = mergedModels.find((m) => m.id === modelId);
      if (!model) return;

      const requiresKey = !['ollama', 'lmstudio'].includes(model.provider);
      if (requiresKey && !apiKeys[model.provider]) {
        toast.warning(`${model.provider} requires an API key in Settings`);
      }

      setModel(modelId);
      toast.info(`Switched model to ${model.name}`);
    },
    [mergedModels, apiKeys, setModel]
  );

  // --- Connection Status ---
  const connectionStatus = useMemo(() => {
    if (!currentModel) return 'offline';
    const status = providerStatuses[currentModel.provider];
    if (status === 'online') return 'online';
    if (status === 'offline') return 'offline';
    return 'degraded';
  }, [currentModel, providerStatuses]);

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDraggingOver(false);
      const droppedFiles = Array.from(e.dataTransfer.files);
      if (droppedFiles.length > 0) {
        handleAttachFiles(droppedFiles);
      }
    },
    [handleAttachFiles]
  );

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="h-full w-full flex min-h-0 overflow-hidden bg-background relative"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDraggingOver && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm border-2 border-dashed border-primary m-4 rounded-xl pointer-events-none">
          <div className="flex flex-col items-center gap-4 text-primary">
            <div className="w-20 h-20 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" x2="12" y1="3" y2="15"/></svg>
            </div>
            <h2 className="text-2xl font-bold">Drop files to add to context</h2>
            <p className="text-muted-foreground max-w-sm text-center">
              Images will be attached to your next message. Documents will be ingested into memory for semantic search.
            </p>
          </div>
        </div>
      )}
      {/* Global sidebar is managed by AppDashboard */}

      <ChatSettings isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        {/* CHAT HEADER */}
        <ChatHeader
          metrics={metrics}
          isLoading={isLoading}
          onClear={parentClearHistory}
          onStopGeneration={stopChat}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          sessionTitle={chatSessions?.activeSession?.title || 'New Chat'}
          onTitleChange={async (title) => {
            if (chatSessions?.activeSid && title.trim()) {
              try {
                await fetch(`/api/v1/sessions/${chatSessions.activeSid}`, {
                  method: 'PATCH',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ name: title.trim() }),
                });
              } catch {
                // Non-fatal: title update failure doesn't break chat
              }
            }
          }}
          onOpenLightning={onOpenLightning}
          allModels={mergedModels}
          currentModel={currentModel}
          currentModelId={currentModelId}
          onModelSelect={(id) => handleModelChange(id)}
          providerStatuses={providerStatuses}
          gatewayUrls={gatewayUrls || {}}
          onAttachFiles={handleAttachFiles}
          onExportChat={handleExport}
          onShareChat={handleShareChat}
          connectionStatus={connectionStatus}
          isNewChat={history.length === 0}
          onToggleMemory={() => setMemoryPanelOpen(!memoryPanelOpen)}
        />

        {/* CHAT MESSAGE LIST */}
        <ChatMessageList
          history={history}
          activeAgent={activeAgent}
          isLoading={isLoading}
          onCopy={copyToClipboard}
          copiedId={copiedId}
          suggestedPrompts={suggestedPrompts}
          onSuggestedPromptClick={(p) => {
            setPrompt(p);
            handleSubmit(p);
          }}
          submitReward={submitReward}
          onEditMessage={handleEditMessage}
          onRegenerate={handleRegenerate}
          onBranchFromMessage={handleBranch}
          activeModel={currentModel?.name}
          streamingContent={streaming?.content}
          streamingReasoning={streaming?.reasoning}
          streamingToolCalls={streaming?.toolCalls}
          onArtifactClick={setActiveArtifact}
        />

        {/* CONTEXT BAR */}
        <ContextBar used={metrics.contextTokens} limit={metrics.contextLimit} />

        {/* CHAT PROMPT INPUT */}
        <ChatPromptInput
          prompt={prompt}
          onPromptChange={setPrompt}
          onSubmit={handleSubmit}
          isLoading={isLoading}
          onStop={stopChat}
          currentModelId={currentModelId}
          currentModel={currentModel}
          onClearHistory={parentClearHistory}
          onModelSelect={handleModelChange}
          onModelSettingsChange={setModelSettings}
          modelSettings={modelSettings}
          suggestedPrompts={suggestedPrompts}
          onSuggestedPromptClick={(p) => {
            setPrompt(p);
            handleSubmit(p);
          }}
          getCustomModelIcon={getCustomModelIcon}
          pendingImages={pendingImages}
          onRemoveImage={handleRemoveImage}
          onImagesChange={setPendingImages}
          onAttachFiles={handleAttachFiles}
        />
      </div>

      {/* ARTIFACT CANVAS */}
      <ArtifactCanvas
        isOpen={!!activeArtifact}
        content={activeArtifact?.content || ''}
        language={activeArtifact?.language}
        title={activeArtifact?.title}
        onClose={() => setActiveArtifact(null)}
        onSubmitPrompt={(p) => handleSubmit(p)}
      />

      {/* MEMORY MANAGER PANEL */}
      <MemoryPanel
        isOpen={memoryPanelOpen}
        onClose={() => setMemoryPanelOpen(false)}
      />

    </motion.div>
  );
};
