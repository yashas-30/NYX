import { invoke } from '@tauri-apps/api/core';
// fallow-ignore-file code-duplication
/**
 * @file src/features/chat/components/ChatPage.tsx
 * @description Production-grade Chat feature page with Claude/Kimi-parity
 *   architecture: streams metrics, context tracking, model selectors,
 *   attachment sync, and coordinates chat sessions with edit/regenerate/branch capabilities.
 */

import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Folder } from 'lucide-react';
import { ModelDefinition, ChatMessage, ToolCall } from '@src/infrastructure/types';
import { toast } from '@src/shared/components/ui/sonner';

import { ChatHeader } from './ChatHeader';
import {
  ChatMessageList,
  extractArtifactTitle,
  replaceCodeBlockInContent,
} from './ChatMessageList';
import { ChatPromptInput, AttachedFileItem } from './ChatPromptInput';
import { ChatSidebar } from './ChatSidebar';
import { CodeBlockPanel, CodeBlockItem } from './CodeBlockPanel';
import { applySearchReplace } from '../utils/searchReplace';
import { getCustomModelIcon } from '@src/shared/utils/modelIcons';
import { useChatLogic } from '../hooks/useChatLogic';
import { MemoryPanel } from './MemoryPanel';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useModelStore } from '@src/core/stores/useModelStore';
import { useAppStore } from '@src/stores/useAppStore';
import { BranchingTreePanel } from './BranchingTreePanel';
import {
  detectProvider,
  getModelCapabilities,
  parseTokenCount,
} from '@src/infrastructure/utils/provider';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ChatPageProps {
  allModels: ModelDefinition[];
  apiKeys: Record<string, string>;
  trackUsage: (provider: string, tokens: number) => void;
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
  if (!model) return 131072;
  if (typeof model === 'number') return model;
  if (typeof model === 'string') return parseTokenCount(model, 131072);
  if (typeof model.contextWindow === 'number' && model.contextWindow > 0)
    return model.contextWindow;
  if (typeof model.context_window === 'number' && model.context_window > 0)
    return model.context_window;
  if (model.specs?.contextWindow) return parseTokenCount(model.specs.contextWindow, 131072);
  if (model.contextWindow) return parseTokenCount(model.contextWindow, 131072);
  if (model.context_window) return parseTokenCount(model.context_window, 131072);
  const idStr = model.id || model.name;
  if (idStr) {
    const caps = getModelCapabilities(idStr);
    if (caps.contextWindow > 0) return caps.contextWindow;
  }
  return 131072;
}

export interface ExtractedCodeBlock {
  language: string;
  code: string;
  filename?: string;
  isClosed: boolean;
}

export function extractLatestCodeBlock(text: string): ExtractedCodeBlock | null {
  if (!text || typeof text !== 'string') return null;

  // Match markdown code fences: ```[language][ filename]\n[code](```|$)
  const fenceRegex =
    /(?:^|\r?\n)```([a-zA-Z0-9_.-]*)(?:[: \t]+([^\r\n]+))?[ \t]*\r?\n([\s\S]*?)(?:(?:\r?\n```)|$)/g;
  let match: RegExpExecArray | null;
  let latest: ExtractedCodeBlock | null = null;

  while ((match = fenceRegex.exec(text)) !== null) {
    const rawLang = (match[1] || '').trim().toLowerCase();
    const rawFilename = (match[2] || '').trim();
    const code = match[3] || '';
    const fullMatch = match[0];
    const isClosed = fullMatch.trimEnd().endsWith('```');

    // Skip slidev presentations and diagrams (diagrams render directly inline in chat, slidev in visual window)
    if (['slidev', 'presentation', 'slides', 'diagram-design', 'diagram', 'svg'].includes(rawLang))
      continue;
    if (/<svg\b/i.test(code)) continue;

    // Ignore non-code languages like markdown/text/plain unless an explicit filename was given
    if (['markdown', 'md', 'text', 'txt', 'table'].includes(rawLang) && !rawFilename) {
      continue;
    }

    // Ignore tiny 1-2 line shell commands (e.g. `npm run dev`)
    const isShortCmd =
      ['bash', 'sh', 'shell', 'cmd', 'powershell', 'zsh', 'terminal'].includes(rawLang) &&
      code.split('\n').length <= 2;
    if (isShortCmd) continue;

    latest = {
      language: rawLang || 'code',
      code,
      filename: rawFilename || undefined,
      isClosed,
    };
  }

  return latest;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ChatPage: React.FC<ChatPageProps> = ({
  allModels,
  apiKeys,
  trackUsage,
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
  const [pendingFiles, setPendingFiles] = useState<AttachedFileItem[]>([]);
  const [memoryPanelOpen, setMemoryPanelOpen] = useState(false);
  const [branchManagerOpen, setBranchManagerOpen] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // --- Right-Side Code Block Window State ---
  const [activeCodeBlock, setActiveCodeBlock] = useState<CodeBlockItem | null>(null);
  const editingBaseCodeRef = useRef<CodeBlockItem | null>(null);

  // --- Project State ---
  const activeProjectId = useNyxStore((s) => s.activeProjectId);
  const setActiveProjectId = useNyxStore((s) => s.setActiveProjectId);

  const activeProject = useMemo(() => {
    if (!activeProjectId) return null;
    try {
      const saved = localStorage.getItem('nyx_projects');
      if (saved) {
        const projects = JSON.parse(saved);
        return projects.find((p: any) => p.id === activeProjectId) || null;
      }
    } catch {
      return null;
    }
    return null;
  }, [activeProjectId]);

  const cloudModelId = useNyxStore((s) => s.cloudModelId);
  const localModelId = useNyxStore((s) => s.localModelId);

  // Since selecting a model clears the opposing state, we can just pick whichever is set.
  const currentModelId = localModelId || cloudModelId || models['nyx'];
  const localLibraryModels = useModelStore((s) => s.localLibraryModels);

  const mergedModels = useMemo(() => {
    const seenIds = new Set<string>();
    const combined = [...allModels, ...localLibraryModels];
    return combined.filter((m) => {
      if (seenIds.has(m.id)) return false;
      seenIds.add(m.id);
      return true;
    });
  }, [allModels, localLibraryModels]);

  const currentModel = useMemo(() => {
    if (!currentModelId) return null;
    return (
      mergedModels.find((m) => m.id === currentModelId || (m as any).realId === currentModelId) ||
      null
    );
  }, [currentModelId, mergedModels]);

  const storeModelConfigs = useNyxStore((s) => s.modelConfigs);
  const storeModelSettings = useNyxStore((s) => s.modelSettings);
  const activeSettings = useMemo(() => {
    if (!currentModelId) return storeModelSettings;
    return (storeModelConfigs && storeModelConfigs[currentModelId]) || storeModelSettings;
  }, [currentModelId, storeModelConfigs, storeModelSettings]);

  const {
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
    approveTool,
    rejectTool,
    activeStreamMessage,
  } = useChatLogic({
    apiKeys,
    modelSettings: activeSettings,
    trackUsage,
    models,
    setModel,
    chatSessions,
    lightningEnabled,
    lightningDirectives,
    logRollout,
    submitReward,
    maxContextTokens:
      activeSettings?.contextSize && activeSettings.contextSize > 0
        ? activeSettings.contextSize
        : getModelContextWindow(currentModel),
    currentProvider: currentModel?.provider || detectProvider(currentModelId),
    gatewayUrl: gatewayUrls[currentModel?.provider || detectProvider(currentModelId)],
  });

  const hasAutoOpenedRef = useRef<Record<string, boolean>>({});
  const userDismissedRef = useRef(false);
  const prevStreamMsgRef = useRef<ChatMessage | null>(null);

  // Reset user dismissed state whenever a brand new streaming generation begins
  useEffect(() => {
    if (activeStreamMessage && !prevStreamMsgRef.current) {
      userDismissedRef.current = false;
    }
    prevStreamMsgRef.current = activeStreamMessage;
  }, [activeStreamMessage]);

  const setCodeBlockPanelOpen = useAppStore((s) => s.setCodeBlockPanelOpen);
  const wasSidebarOpenRef = useRef<boolean | null>(null);

  // Sync code block panel open state with global store & handle automatic sidebar closing
  useEffect(() => {
    const isPanelOpen = !!activeCodeBlock;
    if (isPanelOpen) {
      if (wasSidebarOpenRef.current === null) {
        wasSidebarOpenRef.current = useAppStore.getState().sidebarOpen;
      }
      setCodeBlockPanelOpen(true);
    } else {
      setCodeBlockPanelOpen(false);
      if (wasSidebarOpenRef.current !== null) {
        if (wasSidebarOpenRef.current) {
          useAppStore.getState().setSidebarOpen(true);
        }
        wasSidebarOpenRef.current = null;
      }
    }
  }, [!!activeCodeBlock, setCodeBlockPanelOpen]);

  useEffect(() => {
    return () => {
      setCodeBlockPanelOpen(false);
    };
  }, [setCodeBlockPanelOpen]);

  // Extract last user prompt from history to intelligently name artifacts
  const lastUserPrompt = useMemo(() => {
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].role === 'user') {
        const c = history[i].content;
        if (typeof c === 'string') return c;
        if (Array.isArray(c)) {
          return (c as any[]).map((p) => (typeof p === 'string' ? p : p?.text || '')).join(' ');
        }
      }
    }
    return '';
  }, [history]);

  // Real-time live code streaming into CodeBlockPanel
  useEffect(() => {
    if (!activeStreamMessage || typeof activeStreamMessage.content !== 'string') return;

    if (userDismissedRef.current) return;

    // 1. If currently modifying an existing code block, check for SEARCH/REPLACE blocks
    if (editingBaseCodeRef.current?.code) {
      const patchResult = applySearchReplace(
        editingBaseCodeRef.current.code,
        activeStreamMessage.content
      );

      if (patchResult.appliedCount > 0 || patchResult.activeEditLine) {
        const resolvedTitle =
          editingBaseCodeRef.current.filename || editingBaseCodeRef.current.title || 'Code Block';

        setActiveCodeBlock({
          code: patchResult.code,
          language: editingBaseCodeRef.current.language,
          filename: resolvedTitle,
          title: resolvedTitle,
          isStreaming: true,
          activeEditLine: patchResult.activeEditLine,
          activeEditRange: patchResult.activeEditRange,
        });
        return;
      }
    }

    // 2. Otherwise extract full code block fences
    const streamBlock = extractLatestCodeBlock(activeStreamMessage.content);
    if (!streamBlock || !streamBlock.code) return;

    // Avoid wiping out existing code panel with short partial stubs (< 50 chars) while streaming starts
    if (editingBaseCodeRef.current?.code && !streamBlock.isClosed && streamBlock.code.length < 50) {
      return;
    }

    const artTitle = extractArtifactTitle(streamBlock.code, streamBlock.language, lastUserPrompt);
    const resolvedTitle =
      streamBlock.filename || editingBaseCodeRef.current?.filename || artTitle || 'Code Block';

    setActiveCodeBlock({
      code: streamBlock.code,
      language: streamBlock.language || editingBaseCodeRef.current?.language || 'code',
      filename: resolvedTitle,
      title: resolvedTitle,
      isStreaming: !streamBlock.isClosed,
    });
  }, [activeStreamMessage?.content, lastUserPrompt]);

  // When stream finishes, mark activeCodeBlock as finalized (not streaming)
  useEffect(() => {
    if (!activeStreamMessage && activeCodeBlock?.isStreaming) {
      setActiveCodeBlock((prev) => (prev ? { ...prev, isStreaming: false } : null));
      editingBaseCodeRef.current = null;
    }
  }, [activeStreamMessage, activeCodeBlock?.isStreaming]);

  // Listen for direct code updates from external coding subagents
  useEffect(() => {
    const handleCodeBlockUpdate = (e: Event) => {
      const customEvent = e as CustomEvent<{ code: string; language: string; filename?: string }>;
      if (customEvent.detail?.code) {
        userDismissedRef.current = false;
        setActiveCodeBlock({
          code: customEvent.detail.code,
          language: customEvent.detail.language || 'code',
          filename: customEvent.detail.filename || 'Code Block',
          title: customEvent.detail.filename || 'Code Block',
          isStreaming: false,
        });
      }
    };
    window.addEventListener('nyx:codeblock_update', handleCodeBlockUpdate);
    return () => {
      window.removeEventListener('nyx:codeblock_update', handleCodeBlockUpdate);
    };
  }, []);

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
      contextLimit:
        activeSettings?.contextSize && activeSettings.contextSize > 0
          ? activeSettings.contextSize
          : getModelContextWindow(currentModel),
    }),
    [parentMetrics, history.length, contextTokens, currentModel, activeSettings]
  );

  // --- Submit handler ---
  const handleSubmit = useCallback(
    async (finalPrompt: string, images?: ChatImage[]): Promise<boolean> => {
      const hasFiles = pendingFiles.length > 0;
      if ((!finalPrompt.trim() && (!images || images.length === 0) && !hasFiles) || isLoading)
        return false;

      userDismissedRef.current = false;

      const { cloudModelId, localModelId } = useNyxStore.getState();
      if (!currentModelId && !cloudModelId && !localModelId) {
        toast.error('Please select a model first');
        return false;
      }

      // Check if finalPrompt has an embedded code block to edit (from CodeBlock or CodeBlockPanel)
      let effectivePrompt = finalPrompt;
      let editCodeContext: CodeBlockItem | null = null;

      const embeddedCodeMatch = finalPrompt.match(
        /(?:\[MODIFY CODE SNIPPET\]:|\[CODE SNIPPET TO EDIT[^\n]*\]:)\s*```([a-zA-Z0-9_-]*)[ \t]*\r?\n([\s\S]*?)\r?\n```\s*(?:\[USER (?:EDIT )?REQUEST\]:)?\s*([\s\S]*)/i
      );

      if (embeddedCodeMatch) {
        const lang = embeddedCodeMatch[1] || activeCodeBlock?.language || 'code';
        const snippetCode = embeddedCodeMatch[2];
        const userReq = (embeddedCodeMatch[3] || '').trim();
        effectivePrompt = userReq || 'Please update the code as instructed.';
        editCodeContext = {
          code: snippetCode,
          language: lang,
          filename: activeCodeBlock?.filename || 'snippet',
          title: activeCodeBlock?.title || 'Code Block',
        };
      } else if (
        activeCodeBlock?.code &&
        /\b(?:edit|change|modify|update|fix|refactor|add|remove|replace|make|tweak|adjust|improve|rewrite|implement|bug|error|style|function|feature)\b/i.test(
          finalPrompt
        )
      ) {
        editCodeContext = { ...activeCodeBlock };
      }

      let contextInjection: string | undefined = undefined;
      if (editCodeContext?.code) {
        editingBaseCodeRef.current = { ...editCodeContext };
        if (!userDismissedRef.current) {
          setActiveCodeBlock((prev) => {
            if (prev && prev.code === editCodeContext!.code) return prev;
            return {
              code: editCodeContext!.code,
              language: editCodeContext!.language,
              filename: editCodeContext!.filename,
              title: editCodeContext!.title,
              isStreaming: false,
            };
          });
        }

        contextInjection = `[EXISTING CODE FILE: "${editCodeContext.filename || editCodeContext.title || 'snippet'}"]\n\`\`\`${editCodeContext.language || 'text'}\n${editCodeContext.code}\n\`\`\`\n\n[USER MODIFICATION INSTRUCTIONS]:\n${effectivePrompt}\n\n[MANDATORY IN-PLACE EDITING RULES]:\nYou are modifying the existing code file above.\nCRITICAL: DO NOT rewrite the file from scratch.\nCRITICAL: DO NOT output full duplicate code blocks or copies of the existing code.\nCRITICAL: You MUST output ONLY precise <<<<<<< SEARCH / ======= / >>>>>>> blocks targeting the exact lines that need to change.\n\nFormat for every edit:\n<<<<<<< SEARCH\n[exact lines to replace from the existing code]\n=======\n[new replacement lines]\n>>>>>>>\n\n1. Match existing code character-for-character including indentation.\n2. Keep SEARCH blocks minimal (only the lines being changed).\n3. Output as many SEARCH/REPLACE blocks as needed.\n4. DO NOT wrap SEARCH/REPLACE in markdown code fences.\n5. Outside of the edit blocks, output only a brief explanation of what was modified.`;
      }

      // Optimistically clear the input so it doesn't stay in the text box while generating
      const previousPrompt = prompt;
      const previousImages = pendingImages;
      const previousFiles = pendingFiles;
      setPrompt('');
      setPendingImages([]);
      setPendingFiles([]);

      // Format attached files (documents, code, audio) into prompt context
      let promptWithAttachments = effectivePrompt;
      if (previousFiles.length > 0) {
        const fileSections = previousFiles
          .map((file) => {
            if (file.type === 'audio') {
              return `[Attached Audio File: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)]`;
            }
            const ext = file.name.split('.').pop()?.toLowerCase() || '';
            return `[Attached File: "${file.name}" (${(file.size / 1024).toFixed(1)} KB)]\n\`\`\`${ext}\n${file.content || ''}\n\`\`\``;
          })
          .join('\n\n');

        promptWithAttachments = effectivePrompt.trim()
          ? `${fileSections}\n\n${effectivePrompt}`
          : `${fileSections}\n\nPlease analyze the attached file(s) and provide a comprehensive response.`;
      }

      const displayPrompt =
        effectivePrompt.trim() ||
        (previousFiles.length > 0
          ? `Attached ${previousFiles.map((f) => f.name).join(', ')}`
          : finalPrompt);

      const success = await parentRunChat(promptWithAttachments, images || previousImages, {
        userDisplayPrompt: displayPrompt,
        contextInjection,
        modelOverride: currentModelId,
      });
      if (!success) {
        // Restore if failed to start
        setPrompt(previousPrompt);
        setPendingImages(previousImages);
        setPendingFiles(previousFiles);
      }
      return success;
    },
    [isLoading, currentModelId, parentRunChat, pendingImages, pendingFiles, prompt, activeCodeBlock]
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
  function compressAndResizeImage(
    file: File,
    maxDimension = 1024,
    quality = 0.85
  ): Promise<ChatImage> {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const rawDataUrl = (e.target?.result as string) || '';
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;

          if (width > maxDimension || height > maxDimension) {
            if (width > height) {
              height = Math.round((height * maxDimension) / width);
              width = maxDimension;
            } else {
              width = Math.round((width * maxDimension) / height);
              height = maxDimension;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            ctx.drawImage(img, 0, 0, width, height);
            const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
            resolve({
              name: file.name.replace(/\.[^/.]+$/, '.jpg'),
              mimeType: 'image/jpeg',
              data: compressedDataUrl.split(',')[1] || '',
            });
          } else {
            resolve({
              name: file.name,
              mimeType: file.type || 'image/jpeg',
              data: rawDataUrl.split(',')[1] || '',
            });
          }
        };
        img.onerror = () => {
          resolve({
            name: file.name,
            mimeType: file.type || 'image/jpeg',
            data: rawDataUrl.split(',')[1] || '',
          });
        };
        img.src = rawDataUrl;
      };
      reader.onerror = () => {
        resolve({
          name: file.name,
          mimeType: file.type || 'image/jpeg',
          data: '',
        });
      };
      reader.readAsDataURL(file);
    });
  }

  function extractCleanTextFromDocument(fileName: string, rawText: string): string {
    const isPdf = /\.pdf$/i.test(fileName);
    if (!isPdf) return rawText;

    const matches: string[] = [];
    const tjRegex = /\(([^)]+)\)\s*(?:Tj|'|")/g;
    let m: RegExpExecArray | null;
    while ((m = tjRegex.exec(rawText)) !== null) {
      const clean = m[1].replace(/\\([()\\])/g, '$1').trim();
      if (clean.length > 0) matches.push(clean);
    }

    const tjArrayRegex = /\[((?:\([^)]*\)|[0-9.-]+|\s+)+)\]\s*TJ/gi;
    while ((m = tjArrayRegex.exec(rawText)) !== null) {
      const inner = m[1];
      const subMatch = inner.match(/\(([^)]*)\)/g);
      if (subMatch) {
        const line = subMatch.map((s) => s.slice(1, -1).replace(/\\([()\\])/g, '$1')).join('');
        if (line.trim().length > 0) matches.push(line.trim());
      }
    }

    if (matches.length >= 3) {
      return matches.join('\n');
    }

    const printable = rawText.match(/[\x20-\x7E\t\n\r]{4,}/g) || [];
    const filtered = printable.filter(
      (b) =>
        !b.startsWith('/Type') &&
        !b.startsWith('/Filter') &&
        !b.startsWith('/Length') &&
        !b.startsWith('/Font') &&
        !b.includes('endobj') &&
        !b.includes('endstream') &&
        !b.includes('xref') &&
        !b.includes('trailer')
    );
    return filtered.join('\n').trim() || `[PDF document "${fileName}" content attached]`;
  }

  const handleAttachFiles = useCallback(
    async (files: File[]) => {
      const MAX_ATTACHMENTS = 4;
      const currentTotal = pendingImages.length + pendingFiles.length;
      if (currentTotal >= MAX_ATTACHMENTS) {
        toast.error(`Maximum limit of ${MAX_ATTACHMENTS} attachments reached`);
        return;
      }

      let allowedFiles = files;
      if (currentTotal + allowedFiles.length > MAX_ATTACHMENTS) {
        const remainingSlots = MAX_ATTACHMENTS - currentTotal;
        toast.warning(
          `Attachment limit reached (${MAX_ATTACHMENTS}). Only attaching the first ${remainingSlots} item(s).`
        );
        allowedFiles = allowedFiles.slice(0, remainingSlots);
      }

      const images: File[] = [];
      const nonImages: File[] = [];

      allowedFiles.forEach((file) => {
        if (file.type.startsWith('image/')) {
          images.push(file);
        } else {
          nonImages.push(file);
        }
      });

      // Handle Non-image files (documents, code, audio)
      for (const file of nonImages) {
        if (file.size > 25 * 1024 * 1024) {
          toast.error(`File ${file.name} is too large (max 25MB)`);
          continue;
        }

        const isAudio =
          file.type.startsWith('audio/') || /\.(mp3|wav|ogg|m4a|flac|webm)$/i.test(file.name);
        const isCode =
          /\.(ts|tsx|js|jsx|py|rs|go|java|c|cpp|h|hpp|cs|php|rb|swift|kt|sql|html|css|scss|yaml|yml|toml|sh|bash|json|env)$/i.test(
            file.name
          );

        if (isAudio) {
          const modelCaps = getModelCapabilities(currentModelId || '');
          const supportsAudio =
            (currentModel as any)?.capabilities?.audio !== undefined
              ? !!(currentModel as any).capabilities.audio
              : modelCaps.supportsAudio;

          if (!supportsAudio) {
            toast.error(
              `The selected model (${currentModel?.name || currentModelId || 'current model'}) does not support audio attachments.`
            );
            continue;
          }

          try {
            const reader = new FileReader();
            reader.onload = () => {
              const base64 = ((reader.result as string) || '').split(',')[1] || '';
              setPendingFiles((prev) => [
                ...prev,
                {
                  id: `audio-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
                  name: file.name,
                  size: file.size,
                  type: 'audio',
                  mimeType: file.type || 'audio/wav',
                  base64,
                },
              ]);
              toast.success(`Attached audio "${file.name}"`);
            };
            reader.readAsDataURL(file);
          } catch (err: any) {
            toast.error(`Failed reading audio file ${file.name}`);
          }
          continue;
        }

        // Text document, code file, or PDF
        try {
          const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
          let text = '';
          if (isPdf) {
            const raw = await file.text();
            text = extractCleanTextFromDocument(file.name, raw);
          } else {
            text = await file.text();
          }

          setPendingFiles((prev) => [
            ...prev,
            {
              id: `file-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
              name: file.name,
              size: file.size,
              type: isCode ? 'code' : 'document',
              mimeType: file.type || (isPdf ? 'application/pdf' : 'text/plain'),
              content: text,
            },
          ]);
          toast.success(
            `Attached ${isPdf ? 'PDF document' : isCode ? 'code file' : 'document'} "${file.name}"`
          );
        } catch (err: any) {
          toast.error(`Failed to read ${file.name}: ${err.message || String(err)}`);
        }
      }

      // Handle Images with ultra-fast canvas compression & max-dimension downscaling
      if (images.length > 0) {
        const modelCaps = getModelCapabilities(currentModelId || '');
        const supportsVision =
          (currentModel as any)?.capabilities?.vision !== undefined
            ? !!(currentModel as any).capabilities.vision
            : modelCaps.supportsVision;

        if (!supportsVision) {
          toast.error(
            `The selected model (${currentModel?.name || currentModelId || 'current model'}) does not support image attachments. Please select a vision-capable model.`
          );
          return;
        }

        const promises = images.map((file) => compressAndResizeImage(file));
        Promise.all(promises).then((newImages) => {
          setPendingImages((prev) => [...prev, ...newImages]);
          toast.success(`Attached ${newImages.length} image(s)`);
        });
      }
    },
    [currentModel, currentModelId, pendingImages.length, pendingFiles.length]
  );

  const handleRemoveImage = useCallback((index: number) => {
    setPendingImages((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleRemoveFile = useCallback((id: string) => {
    setPendingFiles((prev) => prev.filter((f) => f.id !== id));
  }, []);

  // --- Export chat ---
  const handleExport = useCallback(
    (format: 'markdown' | 'json' | 'txt' | 'html' | 'obsidian' | 'notion' | 'gist') => {
      let content = '';
      let mimeType = '';
      let extension = '';

      const getMarkdown = () => {
        const md = history
          .map((m) => {
            const role = m.role === 'user' ? 'User' : 'Assistant';
            return `## ${role}\n\n${m.content}\n`;
          })
          .join('\n---\n\n');
        const title = chatSessions?.activeSession?.title || 'Chat Export';
        return `# ${title}\n\n*Exported from NYX AI Client*\n\n${md}`;
      };

      switch (format) {
        case 'markdown': {
          content = getMarkdown();
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
        case 'html': {
          const title = chatSessions?.activeSession?.title || 'Chat Export';
          content = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>NYX Chat Export - ${title}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; background: #0f172a; color: #cbd5e1; max-width: 800px; margin: 40px auto; padding: 20px; line-height: 1.6; }
    h1 { color: #f8fafc; font-size: 24px; border-bottom: 1px solid #334155; padding-bottom: 12px; margin-bottom: 30px; }
    .msg { margin-bottom: 24px; padding: 16px; border-radius: 12px; }
    .user { background: #1e293b; border-left: 4px solid #3b82f6; }
    .assistant { background: #1e1b4b; border-left: 4px solid #6366f1; }
    .role { font-weight: bold; font-size: 11px; text-transform: uppercase; letter-spacing: 0.1em; color: #94a3b8; margin-bottom: 8px; }
    .content { font-size: 14px; white-space: pre-wrap; }
    code { font-family: monospace; background: #0f172a; padding: 2px 6px; border-radius: 4px; color: #f43f5e; }
    pre { background: #0f172a; padding: 16px; border-radius: 8px; overflow-x: auto; border: 1px solid #1e293b; }
    pre code { background: none; padding: 0; color: inherit; }
  </style>
</head>
<body>
  <h1>${title}</h1>
  ${history
    .map(
      (m) => `
    <div class="msg ${m.role}">
      <div class="role">${m.role}</div>
      <div class="content">${m.content.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    </div>
  `
    )
    .join('')}
</body>
</html>`;
          mimeType = 'text/html';
          extension = 'html';
          break;
        }
        case 'obsidian': {
          const title = chatSessions?.activeSession?.title || 'Chat Export';
          const obsidianUrl = `obsidian://new?title=${encodeURIComponent(title)}&content=${encodeURIComponent(getMarkdown())}`;
          window.open(obsidianUrl);
          toast.success('Opened Obsidian export');
          return;
        }
        case 'notion':
        case 'gist': {
          const finalMd = getMarkdown();
          navigator.clipboard.writeText(finalMd);
          toast.success(
            `Copied ${format === 'notion' ? 'Notion' : 'GitHub Gist'} formatted Markdown to clipboard!`
          );
          return;
        }
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
    [history, currentModelId, chatSessions?.activeSession?.title]
  );

  // --- Share chat ---
  // NOTE: The legacy Node server share endpoint no longer exists. We generate a
  // local deep-link URL directly from the active session ID stored in Tauri's
  // SQLite DB — no round-trip to any backend needed.
  const handleShareChat = useCallback(async (): Promise<string> => {
    if (!chatSessions?.activeSid) throw new Error('No active session');
    return `${window.location.origin}/share/${chatSessions.activeSid}`;
  }, [chatSessions?.activeSid]);

  // --- Model selection switch with warnings ---
  // Combined into single store call to avoid double state updates.
  // The store's setCloudModelId/setLocalModelId handle the nullification internally.
  const handleModelChange = useCallback(
    (modelId: string) => {
      const model = mergedModels.find((m) => m.id === modelId);
      if (!model) return;

      const requiresKey = !['nyx-native'].includes(model.provider);
      if (requiresKey && !apiKeys[model.provider]) {
        toast.warning(`${model.provider} requires an API key in Settings`);
      }

      const isLocal = ['nyx-native', 'lmstudio', 'ollama'].includes(model.provider);
      if (isLocal) {
        useNyxStore.getState().setLocalModelId(modelId);
      } else {
        useNyxStore.getState().setCloudModelId(modelId);
      }

      // setModel must be called AFTER the store update to avoid the parent overwriting
      setModel(modelId);
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
      const droppedFiles = Array.from(e.dataTransfer.files) as File[];
      if (droppedFiles.length > 0) {
        handleAttachFiles(droppedFiles);
      }
    },
    [handleAttachFiles]
  );

  const handleVisualClick = useCallback((vis: any) => {
    if (!vis) return;
    const isDiagram =
      vis.type === 'diagram' ||
      vis.type === 'diagram-design' ||
      vis.language === 'diagram-design' ||
      vis.language === 'svg' ||
      (typeof vis.content === 'string' && /^\s*<svg\b/i.test(vis.content.trim()));
    if (isDiagram) {
      // Diagrams render cleanly inline in chat messages. Do not open code panel.
      return;
    }
    if (vis.code || vis.content) {
      setActiveCodeBlock({
        code: vis.code || vis.content || '',
        language: vis.language || 'text',
        filename: vis.filename || vis.title || 'snippet',
        title: vis.title || vis.filename || 'Code Block',
      });
    }
  }, []);

  const handleOpenCodePanel = useCallback((item: CodeBlockItem) => {
    if (!item) return;
    const lang = (item.language || '').toLowerCase().trim();
    if (['diagram-design', 'diagram', 'svg'].includes(lang) || /<svg\b/i.test(item.code || '')) {
      // Do not open code block panel for diagrams
      return;
    }
    userDismissedRef.current = false;
    setActiveCodeBlock(item);
  }, []);

  const handleCodeBlockChange = useCallback(
    (oldCode: string, newCode: string, lang?: string) => {
      setActiveCodeBlock((prev) => (prev ? { ...prev, code: newCode } : null));

      const trimmedOld = (oldCode || '').trim();
      const msgIndex = history.findIndex((m) => {
        if (typeof m.content !== 'string') return false;
        return m.content.includes(trimmedOld);
      });

      if (msgIndex !== -1) {
        const msg = history[msgIndex];
        const updatedContent = replaceCodeBlockInContent(
          msg.content as string,
          oldCode,
          newCode,
          lang
        );
        if (updatedContent !== msg.content) {
          handleEditMessage(msgIndex, updatedContent);
        }
      }
    },
    [history, handleEditMessage]
  );

  const handleSuggestedPromptClick = useCallback(
    (p: string) => {
      setPrompt(p);
      handleSubmit(p);
    },
    [handleSubmit]
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
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" x2="12" y1="3" y2="15" />
              </svg>
            </div>
            <h2 className="text-2xl font-bold">Drop files to add to context</h2>
            <p className="text-muted-foreground max-w-sm text-center">
              Images will be attached to your next message. Documents will be ingested into memory
              for semantic search.
            </p>
          </div>
        </div>
      )}
      {/* Global sidebar is managed by AppDashboard */}

      <div
        className={`min-h-0 flex flex-col overflow-hidden relative transition-all duration-300 ease-out ${
          activeCodeBlock ? 'w-full md:w-1/2 md:max-w-[50%]' : 'w-full flex-1'
        }`}
      >
        {/* CHAT HEADER */}
        <ChatHeader
          metrics={metrics}
          isLoading={isLoading}
          onClear={parentClearHistory}
          onStopGeneration={stopChat}
          sidebarOpen={sidebarOpen}
          onToggleSidebar={onToggleSidebar}
          isCodePanelOpen={!!activeCodeBlock}
          sessionTitle={chatSessions?.activeSession?.title || 'New Chat'}
          onTitleChange={async (title) => {
            if (chatSessions?.activeSid && title.trim()) {
              try {
                // Use native Tauri IPC — the dead Node /api/v1/sessions endpoint
                // no longer exists. db_update_chat_session writes directly to SQLite.
                await invoke('db_update_chat_session_meta', {
                  id: chatSessions.activeSid,
                  title: title.trim(),
                  folder_id: null,
                  tags: null,
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
          onOpenBranchManager={() => setBranchManagerOpen(true)}
        />

        {activeProject && (
          <div className="bg-primary/5 border-b border-primary/20 px-4 py-2 flex items-center justify-between shrink-0 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="text-sm select-none flex items-center justify-center shrink-0">
                {activeProject.icon ? (
                  activeProject.icon
                ) : (
                  <Folder className="w-4 h-4 text-primary" />
                )}
              </span>
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-foreground leading-none">
                  Project Workspace: {activeProject.name}
                </span>
                <span className="text-[10px] text-muted-foreground mt-0.5 animate-pulse">
                  Custom instructions and {activeProject.files?.length || 0} files loaded.
                </span>
              </div>
            </div>
            <button
              onClick={() => {
                setActiveProjectId(null);
                toast.info('Left project context. Standard chat active.');
              }}
              className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground hover:text-foreground hover:bg-muted px-2 py-0.5 rounded border border-border cursor-pointer transition-all"
            >
              Exit Project
            </button>
          </div>
        )}

        {/* CHAT MESSAGE LIST */}
        <ChatMessageList
          history={history}
          activeStreamMessage={activeStreamMessage}
          isLoading={isLoading}
          onCopy={copyToClipboard}
          copiedId={copiedId}
          suggestedPrompts={suggestedPrompts}
          onSuggestedPromptClick={handleSuggestedPromptClick}
          submitReward={submitReward}
          onEditMessage={handleEditMessage}
          onSubmitPrompt={(promptText) => handleSubmit(promptText)}
          onRegenerate={handleRegenerate}
          onBranchFromMessage={handleBranch}
          activeModel={currentModel?.name}
          onArtifactClick={handleVisualClick}
          onOpenCodePanel={handleOpenCodePanel}
          approveTool={approveTool}
          rejectTool={rejectTool}
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
          providerStatuses={providerStatuses}
          gatewayUrls={gatewayUrls}
          onModelSelect={handleModelChange}
          onClearHistory={parentClearHistory}
          onModelSettingsChange={(settings) => {
            if (currentModelId) {
              useNyxStore.getState().updateModelConfig(currentModelId, settings);
            } else {
              useNyxStore.getState().updateModelSettings(settings);
            }
          }}
          modelSettings={activeSettings}
          suggestedPrompts={suggestedPrompts}
          onSuggestedPromptClick={handleSuggestedPromptClick}
          getCustomModelIcon={getCustomModelIcon}
          pendingImages={pendingImages}
          onRemoveImage={handleRemoveImage}
          onImagesChange={setPendingImages}
          pendingFiles={pendingFiles}
          onRemoveFile={handleRemoveFile}
          onAttachFiles={handleAttachFiles}
        />
      </div>

      {/* TRUE BLACK RIGHT-SIDE CODE BLOCK WINDOW */}
      <CodeBlockPanel
        codeBlock={activeCodeBlock}
        isOpen={!!activeCodeBlock}
        onClose={() => {
          userDismissedRef.current = true;
          editingBaseCodeRef.current = null;
          setActiveCodeBlock(null);
          if (isLoading) {
            stopChat();
          }
        }}
        onCodeChange={handleCodeBlockChange}
        onAskAiEdit={(instruction) => handleSubmit(instruction)}
      />

      {/* MEMORY MANAGER PANEL */}
      <MemoryPanel isOpen={memoryPanelOpen} onClose={() => setMemoryPanelOpen(false)} />

      <AnimatePresence>
        {branchManagerOpen && (
          <BranchingTreePanel
            sessions={chatSessions?.sessions || []}
            activeSid={chatSessions?.activeSid || null}
            onSwitchSession={(sid) => chatSessions?.switchSession?.(sid)}
            onCreateSession={(msgs) => chatSessions?.createSession?.(msgs)}
            onClose={() => setBranchManagerOpen(false)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
};
