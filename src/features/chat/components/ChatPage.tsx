/**
 * @file src/features/chat/components/ChatPage.tsx
 * @description Production-grade Chat feature page with Claude/Kimi-parity
 *   architecture: streams metrics, context tracking, model selectors,
 *   attachment sync, and coordinates chat sessions with edit/regenerate/branch capabilities.
 */

import React, { useState, useMemo, useCallback, useEffect } from 'react';
import { motion } from 'motion/react';
import { ModelDefinition, ChatMessage, ToolCall } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';

import { ChatHeader } from './ChatHeader';
import { ChatMessageList } from './ChatMessageList';
import { ChatPromptInput } from './ChatPromptInput';
import { ChatSidebar } from './ChatSidebar';
import { ChatSettings } from './ChatSettings';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';

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
  activeAgent: 'nyx';
  isLoading: boolean;
  history: ChatMessage[];
  metrics: { latency: number; tokens: number; tps: number };
  models: Record<'nyx', string>;
  setModel: (modelId: string) => void;
  runChat: (prompt: string, images?: ChatImage[]) => void;
  stopChat: () => void;
  clearHistory: () => void;
  suggestedPrompts: string[];
  onOpenLightning?: () => void;
  submitReward?: (id: string, reward: number) => void;

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
  activeAgent,
  isLoading,
  history,
  metrics: parentMetrics,
  models,
  setModel,
  runChat: parentRunChat,
  stopChat,
  clearHistory: parentClearHistory,
  suggestedPrompts,
  onOpenLightning,
  submitReward,

  lightningEnabled = true,
  lightningDirectives = [],
  ...rest
}) => {
  const streaming = (rest as any).streaming;
  // --- Local input and attachment states ---
  const [prompt, setPrompt] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [pendingImages, setPendingImages] = useState<ChatImage[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

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

  // --- Message actions (integrated directly with the store via chatSessions) ---
  const handleEditMessage = useCallback(
    (index: number, newContent: string) => {
      if (!chatSessions?.activeSid) return;

      // Get history up to this point and update the user prompt
      const updatedHistory = history.slice(0, index + 1);
      updatedHistory[index] = {
        ...updatedHistory[index],
        content: newContent,
        status: undefined,
        reasoning: undefined,
        toolCalls: undefined,
        citations: undefined,
      };

      chatSessions.updateSession(chatSessions.activeSid, updatedHistory);
      parentRunChat(newContent);
    },
    [history, chatSessions, parentRunChat]
  );

  const handleRegenerate = useCallback(
    (index: number) => {
      if (!chatSessions?.activeSid) return;

      // Truncate history to discard the assistant response
      const truncatedHistory = history.slice(0, index);
      chatSessions.updateSession(chatSessions.activeSid, truncatedHistory);

      const lastUserMsg = [...truncatedHistory].reverse().find((m) => m.role === 'user');
      if (lastUserMsg) {
        const mappedImages = lastUserMsg.images
          ?.map((img) => ({
            name: img.name,
            mimeType: img.mimeType || 'image/jpeg',
            data: img.data || img.dataUrl || img.url || '',
          }))
          .filter((img) => !!img.data);
        parentRunChat(lastUserMsg.content, mappedImages);
      }
    },
    [history, chatSessions, parentRunChat]
  );

  const handleBranch = useCallback(
    (index: number) => {
      if (!chatSessions) return;

      const branchedHistory = history.slice(0, index + 1).map((msg) => ({ ...msg }));
      const newSid = chatSessions.createSession(branchedHistory);
      if (newSid) {
        chatSessions.switchSession(newSid);
        toast.success('Branched conversation from this point');
      } else {
        toast.error('Failed to branch conversation');
      }
    },
    [history, chatSessions]
  );

  // --- Image attachment handlers ---
  const handleAttachFiles = useCallback((files: File[]) => {
    const promises = files.map((file) => {
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

    Promise.all(promises).then((images) => {
      setPendingImages((prev) => [...prev, ...images]);
      toast.success(`Attached ${images.length} image(s)`);
    });
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

  // --- Model selection switch with warnings ---
  const handleModelChange = useCallback(
    (modelId: string) => {
      const model = mergedModels.find((m) => m.id === modelId);
      if (!model) return;

      const requiresKey = !['nyx-native'].includes(model.provider);
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

  return (
    <motion.div
      key="chat"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="h-full w-full flex min-h-0 overflow-hidden bg-background relative"
    >
      {/* Global sidebar is managed by CoderDashboard */}

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
          onTitleChange={(title) => {
            if (chatSessions?.activeSid) {
              chatSessions.updateSession(chatSessions.activeSid, history);
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
          connectionStatus={connectionStatus}
          isNewChat={history.length === 0}
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
        />

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
        />
      </div>

      {/* Scrollbar styles */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
        .custom-scrollbar::-webkit-scrollbar { width: 4px; }
        .custom-scrollbar::-webkit-scrollbar-track { background: transparent; }
        .custom-scrollbar::-webkit-scrollbar-thumb { 
          background: rgba(255, 255, 255, 0.05); 
          border-radius: 10px;
        }
        .custom-scrollbar::-webkit-scrollbar-thumb:hover { 
          background: rgba(var(--primary), 0.2); 
        }
      `,
        }}
      />
    </motion.div>
  );
};
