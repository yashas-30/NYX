import { useRef, useState, useCallback, useEffect } from 'react';
import { invoke, Channel, convertFileSrc } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { toast } from '@src/shared/components/ui/sonner';
import { ChatMessage } from '@nyx/shared';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useModelStore } from '@src/core/stores/useModelStore';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { useAppStore } from '@src/stores/useAppStore';
import {
  detectProvider,
  getEffectiveApiKey,
  getModelCapabilities,
  isReasoningModel,
} from '@src/infrastructure/utils/provider';
import { estimateContextTokens, compactHistoryAsync } from '@src/infrastructure/utils/compaction';
import { AIService } from '@src/features/ai/services/ai.service';
import {
  StreamFluffFilter,
  stripResponsePreamble,
  extractThinkingAndContent,
} from '../utils/streamFilter';
import {
  buildChatPrompts,
  ChatContext,
  isDiagramPrompt,
  isWebSearchPrompt,
  detectPromptCategory,
} from '@src/core/prompts/chatPrompts';
import { TOOL_REGISTRY, toolExecutor } from '@src/infrastructure/services/toolSystem';
import {
  isPresentationPrompt,
  compileResponseToSlidev,
  isSlidevContent,
} from '@src/features/presentation/utils/slidevCompiler';
import { ChatArtifact } from '@nyx/shared';
import { isModelLoaded } from '@src/shared/hooks/useLocalModels';
import { extractCoreSubject } from '@src/core/services/intelligentQueryEngine';
import { antigravityAgent } from '@src/core/agents/antigravityAgent';

// ── Module-level helpers ──────────────────────────────────────────────────────

function resolveSupportsVision(modelId: string, modelState: any): boolean {
  let hasVision = getModelCapabilities(modelId).supportsVision;
  const localModelDef = modelState.localLibraryModels?.find((m: any) => m.id === modelId);
  if (localModelDef && localModelDef.capabilities?.vision !== undefined) {
    hasVision = localModelDef.capabilities.vision;
  }
  return hasVision;
}

export function isExplicitImageGenerationRequest(prompt: string): boolean {
  const p = prompt.trim().toLowerCase();
  return (
    p.startsWith('/image') ||
    p.startsWith('/img') ||
    p.startsWith('image:') ||
    p.startsWith('draw:') ||
    p.startsWith('paint:') ||
    p.startsWith('generate image:') ||
    /^(?:generate|create|draw|paint|render|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|wallpaper|avatar|portrait)\s+(?:of|showing|about|depicting)/i.test(
      p
    ) ||
    /\b(?:please\s+)?(?:generate|create|draw|paint)\s+(?:an?\s+)?image\b/i.test(p)
  );
}

/**
 * Zero-copy lightweight URL normalizer for media URLs.
 * Avoids storing gigabyte-sized base64 strings in Zustand/React memory.
 */
export async function ensureOfflineImage(url: string): Promise<string> {
  return url || '';
}

/**
 * Lightweight message normalizer that preserves clean CDN image and video URLs
 * without allocating massive Base64 strings on the V8 heap.
 */
export async function inlineOfflineImagesInMessage(msg: ChatMessage): Promise<ChatMessage> {
  return msg;
}

export interface ChatImage {
  name: string;
  mimeType?: string;
  data?: string;
  url?: string;
  aspectRatio?: string;
}

export interface ChatPipelineOptions {
  historyRef: React.MutableRefObject<ChatMessage[]>;
  activeStreamRef: React.MutableRefObject<ChatMessage | null>;
  dispatch: React.Dispatch<any>;
  setActiveStreamMessage: (msg: ChatMessage | null) => void;
  persistHistory: (history: ChatMessage[]) => void;
  setTokensUsed: React.Dispatch<React.SetStateAction<number>>;
  maxContextTokens?: number;
  tokenBudget?: number;
  tokensUsed?: number;
  currentProvider?: string;
  gatewayUrl?: string;
  webSearchEnabled?: boolean;
  models?: Record<'nyx', string>;
}

export function useChatPipeline({
  historyRef,
  activeStreamRef,
  dispatch,
  setActiveStreamMessage,
  persistHistory,
  setTokensUsed,
  maxContextTokens = 128000,
  tokenBudget = Infinity,
  tokensUsed = 0,
  currentProvider,
  gatewayUrl,
  webSearchEnabled = false,
  models,
}: ChatPipelineOptions) {
  const [isSupervising, setIsSupervising] = useState(false);
  const abortCtrlRef = useRef<AbortController | null>(null);
  const lastRunRef = useRef<number>(0);
  const mountedRef = useRef(true);
  // Monotonically-incrementing generation ID.
  // Each runChat call captures the current value; the onProgress closure
  // uses it to discard in-flight events from a prior (cancelled) stream.
  const generationIdRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const cancelPipeline = useCallback(() => {
    abortCtrlRef.current?.abort();
  }, []);

  const runChat = useCallback(
    async (
      prompt: string,
      images?: ChatImage[],
      options?: {
        skipUserMessage?: boolean;
        modelOverride?: string;
        userDisplayPrompt?: string;
        contextInjection?: string;
      }
    ): Promise<boolean> => {
      const now = Date.now();
      if (now - lastRunRef.current < 300) return false;
      lastRunRef.current = now;

      // Increment generation ID so any in-flight events from the previous stream
      // are automatically ignored by their onProgress.onmessage closure.
      const currentGenerationId = ++generationIdRef.current;

      if (!prompt.trim() && (!images || images.length === 0)) return false;
      if (prompt.length > 50000) {
        toast.error('Message exceeds maximum length of 50,000 characters.');
        return false;
      }

      // Capture state immediately at function execution
      const nyxState = useNyxStore.getState();
      const modelState = useModelStore.getState();
      const usageState = useUsageStore.getState();

      const {
        cloudModelId,
        localModelId,
        executionMode,
        searchProvider,
        apiKeys: rawNyxKeys,
        modelSettings,
        modelSystemPrompts,
      } = nyxState;

      const appStateKeys = useAppStore.getState().apiKeys || {};
      const nyxStateKeys = rawNyxKeys || {};
      const apiKeys: Record<string, string> = {
        ...appStateKeys,
        ...nyxStateKeys,
      };
      for (const [k, v] of Object.entries(appStateKeys)) {
        if (v && v.trim() !== '') apiKeys[k] = v.trim();
      }
      for (const [k, v] of Object.entries(nyxStateKeys)) {
        if (v && v.trim() !== '') apiKeys[k] = v.trim();
      }

      const estimatedInput = Math.ceil(prompt.length / 4) + (images?.length || 0) * 512;
      const contextTokens = estimateContextTokens(historyRef.current);
      const projectedTotal = contextTokens + estimatedInput + 4096;

      const userSelectedModel =
        options?.modelOverride ||
        cloudModelId ||
        localModelId ||
        nyxState.cloudModelId ||
        nyxState.localModelId ||
        nyxState.currentModel?.id ||
        models?.nyx ||
        useModelStore.getState().modelsState?.chat ||
        useAppStore.getState().selectedModel?.id ||
        '';

      let modelToUse = userSelectedModel;
      let resolvedProviderEarly =
        detectProvider(modelToUse, currentProvider) ||
        (nyxState.currentModel?.id === modelToUse ? nyxState.currentModel.provider : undefined) ||
        (useAppStore.getState().selectedModel?.provider as any);
      let isLocalModel = resolvedProviderEarly === 'nyx-native';
      let isCloud = [
        'gemini',
        'openrouter',
        'openai',
        'anthropic',
        'deepseek',
        'groq',
        'mistral',
      ].includes(resolvedProviderEarly);

      // Intercept Missing API Keys for Cloud Models
      if (isCloud) {
        const apiKey = getEffectiveApiKey(resolvedProviderEarly, apiKeys);
        if (!apiKey || apiKey.trim() === '' || apiKey === 'free') {
          const providerName =
            resolvedProviderEarly === 'openrouter'
              ? 'OpenRouter'
              : resolvedProviderEarly.charAt(0).toUpperCase() + resolvedProviderEarly.slice(1);
          const extraHint =
            resolvedProviderEarly === 'openrouter'
              ? ' OpenRouter models require a free API key from openrouter.ai/keys.'
              : '';
          toast.error(
            `No API key found for ${providerName}.${extraHint} Go to Settings → API Keys and add your ${providerName} key to use ${modelToUse}.`,
            { duration: 7000 }
          );
          return false;
        }
      }

      if (isLocalModel && !isModelLoaded(modelToUse, modelState.loadedLocalModel)) {
        // Check if the model file exists in the local library (by filename match, not virtual alias)
        const isDownloaded = modelState.localLibraryModels?.some(
          (m: any) =>
            m.id === modelToUse ||
            (m.id || '').toLowerCase().replace(/\\/g, '/').split('/').pop() ===
              (modelToUse || '').toLowerCase().replace(/\\/g, '/').split('/').pop()
        );

        if (!options?.skipUserMessage) {
          const userMsg: ChatMessage = {
            id: crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2, 15),
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          };
          dispatch({ type: 'APPEND', message: userMsg });
          historyRef.current = [...historyRef.current, userMsg];
        }

        if (isDownloaded) {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2, 15),
            role: 'assistant',
            content: `⚙️ **Auto-loading Local Model**: Starting local inference server for **${modelToUse}**… This may take up to 30 seconds depending on model size and hardware.`,
            timestamp: Date.now(),
            status: 'loading',
            model: modelToUse,
          };
          dispatch({ type: 'APPEND', message: assistantMsg });
          historyRef.current = [...historyRef.current, assistantMsg];
          persistHistory(historyRef.current);

          try {
            const listenPromise = new Promise<{ unlisten: () => void; promise: Promise<any> }>(
              (resolve, reject) => {
                let unlistenReady: (() => void) | undefined;
                let unlistenError: (() => void) | undefined;
                const cleanup = () => {
                  unlistenReady?.();
                  unlistenError?.();
                };
                const readyPromise = new Promise<{ status: string }>((res) => {
                  listen<{ status: string }>('llm-server-ready', (event) => {
                    cleanup();
                    res(event.payload);
                  }).then((fn) => {
                    unlistenReady = fn;
                  });
                });
                const errorPromise = new Promise<never>((_, rej) => {
                  listen<{ error: string }>('llm-server-error', (event) => {
                    cleanup();
                    rej(new Error(event.payload.error));
                  }).then((fn) => {
                    unlistenError = fn;
                  });
                });
                const timeoutPromise = new Promise<never>((_, rej) => {
                  setTimeout(() => {
                    cleanup();
                    rej(new Error('Model load timed out after 60 seconds.'));
                  }, 60000);
                });

                resolve({
                  unlisten: cleanup,
                  promise: Promise.race([readyPromise, errorPromise, timeoutPromise]),
                });
              }
            );

            const { unlisten, promise } = await listenPromise;

            await invoke('start_local_server', {
              modelId: modelToUse,
              contextSize: modelSettings?.contextSize ?? 0,
              gpuLayers:
                modelSettings?.gpuLayers === -1 ? null : (modelSettings?.gpuLayers ?? null),
              cpuThreads: modelSettings?.threads || 0,
              flashAttention: modelSettings?.flashAttention ?? false,
              kvCacheType: modelSettings?.kvCacheType || 'auto',
              useMlock: modelSettings?.useMlock ?? false,
              batchSize: modelSettings?.batchSize || 0,
              draftModelId: modelSettings?.draftModelId,
              disableKvOffload: modelSettings?.disableKvOffload ?? false,
              splitMode: modelSettings?.splitMode,
              tensorSplit: modelSettings?.tensorSplit,
            });

            await promise;
            modelState.setLoadedLocalModel(modelToUse);

            // Clear loading message and proceed with generation recursively
            const finalHistory = historyRef.current.filter((m) => m.id !== assistantMsg.id);
            dispatch({ type: 'SET', messages: finalHistory });
            historyRef.current = finalHistory;

            return runChat(prompt, undefined, { ...options, skipUserMessage: true });
          } catch (err: any) {
            const errMsg = err?.message || String(err);
            const errorMsg: ChatMessage = {
              id: crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2, 15),
              role: 'assistant',
              content: `❌ **Failed to auto-load local model**: ${errMsg}. Please verify system memory or try starting the model manually from the registry.`,
              timestamp: Date.now(),
              status: 'success',
              model: modelToUse,
            };
            const finalHistory = historyRef.current.map((m) =>
              m.id === assistantMsg.id ? errorMsg : m
            );
            dispatch({ type: 'SET', messages: finalHistory });
            historyRef.current = finalHistory;
            persistHistory(historyRef.current);
            return true;
          }
        } else {
          const assistantMsg: ChatMessage = {
            id: crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2, 15),
            role: 'assistant',
            content: `⚙️ **Local Model Not Loaded**: Please load the model, you have not loaded the model. Select and load **${modelToUse}** from the model selector or settings panel to proceed.`,
            timestamp: Date.now(),
            status: 'success',
            model: modelToUse,
          };
          dispatch({ type: 'APPEND', message: assistantMsg });
          historyRef.current = [...historyRef.current, assistantMsg];
          persistHistory(historyRef.current);
          return true;
        }
      }

      // dynamically size effectiveMaxCtx
      let effectiveMaxCtx = maxContextTokens;
      if (isLocalModel && modelSettings?.contextSize && modelSettings.contextSize > 0) {
        effectiveMaxCtx = modelSettings.contextSize;
      }

      let llmHistory = historyRef.current;
      if (projectedTotal > effectiveMaxCtx) {
        const outputReserve = Math.min(Math.floor(effectiveMaxCtx * 0.25), 1024);
        const targetHistoryBudget = Math.max(effectiveMaxCtx - estimatedInput - outputReserve, 256);
        llmHistory = await compactHistoryAsync(
          historyRef.current,
          targetHistoryBudget,
          AIService,
          modelSettings
        );
      }

      if (tokensUsed + estimatedInput > tokenBudget) {
        toast.error('Token budget exhausted');
        return false;
      }

      abortCtrlRef.current = new AbortController();

      let onProgress = new Channel<any>();

      try {
        const supportsVision = resolveSupportsVision(modelToUse, modelState);
        let finalPrompt = prompt;
        if (options?.contextInjection) {
          finalPrompt = `${options.contextInjection}\n\n${prompt}`;
        }
        if (images && images.length > 0 && !supportsVision) {
          toast.info('Attached image context provided as text reference to active model.');
          const imgRefText = images
            .map(
              (img) =>
                `[USER ATTACHED IMAGE: ${img.name || 'Image'} (URL: ${img.url || 'Attached'})]`
            )
            .join('\n');
          finalPrompt = `${finalPrompt}\n\n[USER ATTACHED IMAGES]\n${imgRefText}\n[/USER ATTACHED IMAGES]`;
        }

        const skipUserMessage = options?.skipUserMessage;

        // ── Handle image generation (explicit /image command, natural intent, OR active image model) ──
        // ── Handle image generation (ONLY when user explicitly requests image generation or active image model loaded) ──
        const isExplicitImageCmd = isExplicitImageGenerationRequest(prompt);

        // If the currently loaded local model is an image generation model, treat prompt as image request.
        // Uses the pre-computed isActiveModelImageGen flag set by useModelStore.setLoadedLocalModel.
        const isImageModelActive =
          modelState.isActiveModelImageGen ||
          (!!modelState.loadedLocalModel &&
            [
              'text_encoder',
              'text-encoder',
              'vae',
              'transformer',
              'flux',
              'diffusion',
              'stable',
              'sdxl',
              'sd3',
              'sd1',
              'sd2',
              'controlnet',
              'lora',
              'unet',
            ].some((kw) => modelState.loadedLocalModel!.toLowerCase().includes(kw)));

        if (isExplicitImageCmd || isImageModelActive) {
          const imagePrompt =
            prompt
              .replace(/^(?:\/image|\/img|image:|draw:|paint:|generate\s+image:)\s*/i, '')
              .replace(
                /^(?:generate|create|draw|paint|render|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|wallpaper|avatar|portrait)\s+(?:of|showing|about|depicting)\s*/i,
                ''
              )
              .trim() || prompt.trim();

          toast.info(`Generating image asset for "${imagePrompt}"…`);

          if (!skipUserMessage) {
            const userMsg: ChatMessage = {
              id: crypto.randomUUID
                ? crypto.randomUUID()
                : Math.random().toString(36).substring(2, 15),
              role: 'user',
              content: prompt,
              timestamp: Date.now(),
            };
            dispatch({ type: 'APPEND', message: userMsg });
            historyRef.current = [...historyRef.current, userMsg];
            persistHistory(historyRef.current);
          }

          try {
            const res = await invoke<{
              success: boolean;
              image_path: string;
              prompt: string;
              error?: string;
            }>('generate_local_image', {
              prompt: imagePrompt,
              width: 1024,
              height: 1024,
            });

            if (res?.success && res.image_path) {
              let displaySrc = res.image_path;
              try {
                displaySrc = convertFileSrc(res.image_path);
              } catch {
                const normalizedPath = res.image_path.replace(/\\/g, '/');
                displaySrc = `file:///${normalizedPath}`;
              }

              const assistMsg: ChatMessage = {
                id: crypto.randomUUID
                  ? crypto.randomUUID()
                  : Math.random().toString(36).substring(2, 15),
                role: 'assistant',
                content: `🎨 **Generated Image** for _"${imagePrompt}"_:\n\n![Generated Image](${displaySrc})`,
                timestamp: Date.now(),
                status: 'success',
              };
              const offlineAssistMsg = await inlineOfflineImagesInMessage(assistMsg);
              dispatch({ type: 'APPEND', message: offlineAssistMsg });
              historyRef.current = [...historyRef.current, offlineAssistMsg];
              persistHistory(historyRef.current);
              toast.success('Image generated successfully!');
            } else {
              const errMsg = res?.error || 'Image generation returned no output.';
              toast.error(`Image generation failed: ${errMsg}`);
            }
          } catch (err: any) {
            toast.error(`Image generation failed: ${err?.message || String(err)}`);
          }

          // Return early — image generated, no further text LLM pass needed for explicit image command
          setTokensUsed((prev) => prev + estimatedInput);
          return true;
        }

        // ── Run Local PaddleOCR Text Extraction if image attached ─────────
        if (images && images.length > 0) {
          try {
            const ocrRes = await invoke<{ success: boolean; extracted_text: string }>(
              'run_local_ocr',
              {
                imageDataOrPath: images[0].data || images[0].name,
              }
            );
            if (ocrRes?.success && ocrRes.extracted_text) {
              finalPrompt = `${finalPrompt}\n\n[🔍 Extracted OCR Document Text]:\n${ocrRes.extracted_text}`;
            }
          } catch (err) {
            console.warn('Local OCR skipped:', err);
          }
        }

        if (!skipUserMessage) {
          const userMsg: ChatMessage = {
            id: crypto.randomUUID
              ? crypto.randomUUID()
              : Math.random().toString(36).substring(2, 15),
            role: 'user',
            content: options?.userDisplayPrompt || prompt,
            timestamp: Date.now(),
            images: images
              ?.map((img) => ({
                name: img.name,
                mimeType: img.mimeType || 'image/jpeg',
                data: img.data || '',
              }))
              .filter((img) => !!img.data),
          };
          dispatch({ type: 'APPEND', message: userMsg });
          historyRef.current = [...historyRef.current, userMsg];
          persistHistory(historyRef.current);
          llmHistory = [...llmHistory, userMsg];
        }

        let initialWarning = '';
        const contextSize = modelSettings?.contextSize ?? 0;
        const isContextTooSmall = contextSize > 0 && contextSize < 4096;
        const isContextNearLimit = contextSize > 0 && projectedTotal > contextSize * 0.8;

        if (isContextTooSmall) {
          initialWarning = `> ⚠️ **Low Context Length**: The configured context length of the model is low (${contextSize} tokens). Auto mode recommended.\n\n`;
        } else if (isContextNearLimit) {
          initialWarning = `> ⚠️ **Context Near Limit**: Total tokens (${projectedTotal}) are close to configured context size (${contextSize} tokens).\n\n`;
        }

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          role: 'assistant',
          content: initialWarning,
          timestamp: Date.now(),
          status: 'loading',
          model: modelToUse,
        };

        setActiveStreamMessage(assistantMsg);
        activeStreamRef.current = assistantMsg;
        await new Promise((resolve) => setTimeout(resolve, 0));

        const isReasoning = isReasoningModel(modelToUse);
        const resolvedProviderEarly2 = resolvedProviderEarly;
        const promptCat = detectPromptCategory(prompt);
        const isExplicitSearchOrResearch =
          promptCat === 'websearch' || promptCat === 'research' || isWebSearchPrompt(prompt);

        const isGreetingOrTrivial =
          /^(?:hi|hello|hey|greetings|howdy|yo|sup|thanks|thank you|good\s+(?:morning|afternoon|evening))\b/i.test(
            prompt.trim()
          ) || prompt.trim().length <= 3;
        const isPureDiagramSyntax =
          /^(?:draw|create|generate|make|build)\s+(?:an?\s+)?(?:mermaid\s+)?(?:diagram|flowchart|sequence\s+diagram|class\s+diagram|state\s+diagram|er\s+diagram)\s+(?:of|for|between)?\s*(?:[A-Z0-9_\s]{1,20})$/i.test(
            prompt.trim()
          );

        // Only search the web if user toggled Web Search ON or explicitly requested search/research
        const liveWebSearchEnabled =
          !isGreetingOrTrivial &&
          !isPureDiagramSyntax &&
          (useAppStore.getState().webSearchEnabled ||
            webSearchEnabled ||
            isExplicitSearchOrResearch);
        const cleanSearchQuery = extractCoreSubject(prompt) || prompt;

        // Execute live web search or deep research DAG via Rust engine
        let webSearchResults: string | undefined = undefined;
        if (liveWebSearchEnabled) {
          try {
            const storeState = useNyxStore.getState();
            const searchProvider = storeState.searchProvider || 'duckduckgo';
            const apiKey = storeState.apiKeys[searchProvider] || '';

            const searchPromise = invoke<string>('search_web_command', {
              query: cleanSearchQuery,
              numResults: promptCat === 'research' ? 8 : 5,
              searchProvider,
              apiKey,
            });

            // Bounded timeout: 4-second max for quick web search
            const timeoutSearch = new Promise<string>((resolve) =>
              setTimeout(() => resolve(''), 4000)
            );

            const searchRes = await Promise.race([searchPromise, timeoutSearch]).catch(() => '');
            if (searchRes && typeof searchRes === 'string' && searchRes.trim().length > 0) {
              webSearchResults = searchRes.trim();
            }

            const isMediaSearchExplicit =
              /\b(?:pictures?|images?|photos?|videos?|youtube|clip|movie)\b/i.test(prompt) &&
              !/\b(?:code|html|css|js|javascript|typescript|python|bug|fix|error|component|refactor|function|script|app|application|cursor|freeze|glitch)\b/i.test(
                prompt
              );

            if (webSearchResults && isMediaSearchExplicit) {
              const mediaMatch = webSearchResults.match(/<!-- NYX_MEDIA_DATA:\s*([\s\S]*?)\s*-->/);
              if (mediaMatch && mediaMatch[1]) {
                try {
                  const parsedMedia = JSON.parse(mediaMatch[1]);
                  if (
                    parsedMedia.images &&
                    Array.isArray(parsedMedia.images) &&
                    parsedMedia.images.length > 0
                  ) {
                    assistantMsg.images = parsedMedia.images.map((img: any) => ({
                      url: img.url,
                      name: img.title,
                      engine: img.source || 'DuckDuckGo Images',
                    }));
                  }
                  if (
                    parsedMedia.videos &&
                    Array.isArray(parsedMedia.videos) &&
                    parsedMedia.videos.length > 0
                  ) {
                    (assistantMsg as any).videos = parsedMedia.videos.map((vid: any) => ({
                      url: vid.url,
                      previewUrl: vid.thumbnail_url,
                      title: vid.title,
                      duration: vid.duration,
                      source: 'YouTube',
                      author: vid.uploader,
                    }));
                  }
                  activeStreamRef.current = { ...assistantMsg };
                  setActiveStreamMessage({ ...assistantMsg });
                } catch (e) {
                  console.warn('[useChatPipeline] Failed to parse NYX_MEDIA_DATA:', e);
                }
              }
            }
          } catch (searchErr) {
            console.warn('[useChatPipeline] Live web search/research execution failed:', searchErr);
          }
        }

        const isPresentationReq = isPresentationPrompt(prompt);
        const activeTools = isPresentationReq
          ? TOOL_REGISTRY.filter((t) =>
              ['web_search', 'search_images', 'search_videos', 'generate_image'].includes(t.name)
            )
          : TOOL_REGISTRY;

        const standardTools = activeTools.map((t) => ({
          type: 'function',
          function: {
            name: t.name,
            description: t.description,
            parameters: t.parameters,
          },
        }));

        const eventName = `dag_update_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)}`;

        const chatContext: ChatContext = {
          conversationTone: 'casual',
          detectedLanguage: 'English',
          previousMessages: historyRef.current.length,
          reasoningEnabled: isReasoning,
          localModel: resolvedProviderEarly2 === 'nyx-native',
          customSystemPrompt: modelSystemPrompts?.[modelToUse] || undefined,
          hasWebSearch: liveWebSearchEnabled,
          hasDeepResearch: promptCat === 'research',
          availableTools:
            resolvedProviderEarly2 === 'nyx-native' ? (activeTools as any) : undefined,
        };

        // Retrieve relevant semantic context from TurboVec LanceDB memory store (with 300ms timeout guard)
        let memoryContext: string | undefined = undefined;
        try {
          const tvPromise = invoke<Array<{ text: string; metadata: string }>>(
            'turbovec_search_chat_history',
            { query: prompt, limit: 3 }
          );
          const tvTimeout = new Promise<Array<{ text: string; metadata: string }>>((resolve) =>
            setTimeout(() => resolve([]), 300)
          );
          const tvResults = await Promise.race([tvPromise, tvTimeout]).catch(() => []);
          if (tvResults && tvResults.length > 0) {
            const memSnippets = tvResults
              .map((r, idx) => `[Memory Snippet ${idx + 1} (${r.metadata})]: ${r.text}`)
              .join('\n\n');
            memoryContext = `[TURBOVEC RELEVANT CHAT CONTEXT (Gemini 3.5 Flash-Lite Extracted)]:\n${memSnippets}`;
          }
        } catch (e) {}

        const promptResult = buildChatPrompts(
          modelToUse,
          chatContext,
          finalPrompt,
          llmHistory,
          webSearchResults,
          resolvedProviderEarly2,
          undefined,
          memoryContext
        );

        let currentContent = initialWarning;
        let currentReasoning = '';
        let thinkStartIdx = -1;
        let thinkTagLen = 0;
        let thinkEndIdx = -1;
        let thinkEndTagLen = 0;
        let thinkingEndTime = -1;
        let lastUpdateTime = 0;
        let THROTTLE_MS = 24;
        const streamFilter = new StreamFluffFilter();

        setIsSupervising(true);

        onProgress.onmessage = (message) => {
          if (!mountedRef.current) return;
          if (!activeStreamRef.current) return;
          // Drop stale events from a cancelled/previous stream.
          if (generationIdRef.current !== currentGenerationId) return;

          if (message) {
            const eventType = message.event_type || message.type;
            const now = Date.now();

            if (eventType === 'text') {
              const rawChunk = message.content || '';
              const filteredChunk = streamFilter.processChunk(rawChunk);
              currentContent += filteredChunk;

              if (thinkStartIdx === -1) {
                const match = currentContent.match(/<(?:think|thought|thinking)(?:\s+[^>]*?)?>/i);
                if (match) {
                  thinkStartIdx = match.index!;
                  thinkTagLen = match[0].length;
                }
              }

              if (thinkStartIdx !== -1 && thinkEndIdx === -1) {
                const searchArea = currentContent.substring(thinkStartIdx + thinkTagLen);
                const match = searchArea.match(/<\/(?:think|thought|thinking)>/i);
                if (match) {
                  thinkEndIdx = thinkStartIdx + thinkTagLen + match.index!;
                  thinkEndTagLen = match[0].length;
                  thinkingEndTime = Date.now();
                }
              }

              let displayContent = currentContent;
              let extractedReasoning = '';
              const isModelReasoningType = isReasoningModel(modelToUse);

              if (thinkStartIdx !== -1 && isModelReasoningType) {
                const innerText =
                  thinkEndIdx !== -1
                    ? currentContent.substring(thinkStartIdx + thinkTagLen, thinkEndIdx).trim()
                    : currentContent.substring(thinkStartIdx + thinkTagLen).trim();

                const outsideText =
                  thinkEndIdx !== -1
                    ? (
                        currentContent.substring(0, thinkStartIdx) +
                        currentContent.substring(thinkEndIdx + thinkEndTagLen)
                      ).trim()
                    : currentContent.substring(0, thinkStartIdx).trim();

                extractedReasoning = innerText;
                displayContent = outsideText;
              } else if (thinkStartIdx !== -1 && !isModelReasoningType) {
                displayContent = currentContent
                  .replace(/<\/?(?:think|thought|thinking)(?:\s+[^>]*?)?>/gi, '')
                  .trim();
                extractedReasoning = '';
              }

              if (now - lastUpdateTime > THROTTLE_MS) {
                lastUpdateTime = now;
                let currentThinkingTimeMs: number | undefined =
                  activeStreamRef.current.thinkingTimeMs;
                if (extractedReasoning && isModelReasoningType) {
                  if (thinkEndIdx !== -1) {
                    currentThinkingTimeMs =
                      thinkingEndTime - (activeStreamRef.current.timestamp || Date.now());
                  } else {
                    currentThinkingTimeMs =
                      Date.now() - (activeStreamRef.current.timestamp || Date.now());
                  }
                }

                const effectiveReasoning =
                  extractedReasoning ||
                  currentReasoning ||
                  activeStreamRef.current?.reasoning ||
                  undefined;

                const updatedMsg = {
                  ...activeStreamRef.current,
                  content: displayContent,
                  reasoning: effectiveReasoning,
                  thinkingTimeMs: currentThinkingTimeMs || activeStreamRef.current?.thinkingTimeMs,
                };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }
            } else if (eventType === 'tool_start') {
              pendingToolName = message.name as string | undefined;
              pendingToolId = (message.tool_call as any)?.id as string | undefined;
              pendingToolArgs = '';
              const thoughtSig =
                (message.metadata as any)?.thoughtSignature ||
                (message.metadata as any)?.thought_signature;
              if (pendingToolName) {
                const newCall = {
                  id:
                    pendingToolId ||
                    (crypto.randomUUID
                      ? crypto.randomUUID()
                      : Math.random().toString(36).substring(2, 15)),
                  type: 'function' as const,
                  thoughtSignature: thoughtSig,
                  function: { name: pendingToolName, arguments: '{}' },
                  status: 'running' as const,
                };
                const updatedMsg = {
                  ...activeStreamRef.current,
                  toolCalls: [...(activeStreamRef.current.toolCalls || []), newCall],
                };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }
            } else if (eventType === 'tool_call') {
              pendingToolArgs += (message.content as string) || '';
            } else if (eventType === 'tool_call_complete') {
              const toolName = pendingToolName;
              const toolId =
                pendingToolId ||
                (crypto.randomUUID
                  ? crypto.randomUUID()
                  : Math.random().toString(36).substring(2, 15));
              const toolArgsStr = pendingToolArgs || '{}';

              let parsedArgs: Record<string, any> = {};
              try {
                parsedArgs = JSON.parse(toolArgsStr);
              } catch {
                parsedArgs = {};
              }

              if (toolName && activeStreamRef.current?.toolCalls) {
                const calls = [...activeStreamRef.current.toolCalls];
                const lastCallIdx = calls.findIndex(
                  (c) => c.function.name === toolName && c.status === 'running'
                );
                if (lastCallIdx >= 0) {
                  calls[lastCallIdx] = {
                    ...calls[lastCallIdx],
                    function: { name: toolName, arguments: toolArgsStr },
                    status: 'running' as const,
                  };
                  const updatedMsg = { ...activeStreamRef.current, toolCalls: calls };
                  activeStreamRef.current = updatedMsg;
                  setActiveStreamMessage(updatedMsg);
                }

                // Asynchronously execute the tool call via ToolExecutor
                toolExecutor
                  .executeSingle({
                    id: toolId,
                    name: toolName,
                    arguments: parsedArgs,
                    rawArguments: toolArgsStr,
                  })
                  .then((res) => {
                    if (!activeStreamRef.current) return;

                    // If media was returned, dynamically attach to the visual cards!
                    if (toolName === 'search_images' && res.content?.images) {
                      const currImgs = activeStreamRef.current.images || [];
                      const newImgs = (res.content.images as any[]).map((img: any) => ({
                        name: img.title || 'Image',
                        url: img.url,
                        engine: img.source || 'Web Search',
                      }));
                      const seen = new Set(currImgs.map((i: any) => i.url));
                      const deduped = newImgs.filter((i: any) => !seen.has(i.url));
                      activeStreamRef.current = {
                        ...activeStreamRef.current,
                        images: [...currImgs, ...deduped],
                      };
                    } else if (toolName === 'search_videos' && res.content?.videos) {
                      const currVids = (activeStreamRef.current as any).videos || [];
                      const newVids = (res.content.videos as any[]).map((vid: any) => ({
                        url: vid.url,
                        previewUrl: vid.previewUrl,
                        title: vid.title,
                        duration: vid.duration,
                        author: vid.channel || vid.author,
                        source: vid.source || 'YouTube',
                      }));
                      const seen = new Set(currVids.map((v: any) => v.url));
                      const deduped = newVids.filter((v: any) => !seen.has(v.url));
                      activeStreamRef.current = {
                        ...activeStreamRef.current,
                        videos: [...currVids, ...deduped],
                      };
                    } else if (toolName === 'generate_image' && res.content?.imageUrl) {
                      const currImgs = activeStreamRef.current.images || [];
                      activeStreamRef.current = {
                        ...activeStreamRef.current,
                        images: [
                          ...currImgs,
                          {
                            name: res.content.prompt || 'Generated Image',
                            url: res.content.imageUrl,
                            engine: res.content.source || 'AI Generator',
                          },
                        ],
                      };
                    }

                    // Update toolCall status in message
                    if (activeStreamRef.current.toolCalls) {
                      const updatedCalls = activeStreamRef.current.toolCalls.map((c) =>
                        c.function.name === toolName && c.status === 'running'
                          ? {
                              ...c,
                              status: (res.status === 'success' ? 'success' : 'error') as
                                | 'success'
                                | 'error',
                              result:
                                typeof res.content === 'string'
                                  ? res.content
                                  : JSON.stringify(res.content),
                            }
                          : c
                      );
                      activeStreamRef.current = {
                        ...activeStreamRef.current,
                        toolCalls: updatedCalls,
                      };
                      setActiveStreamMessage(activeStreamRef.current);
                    }
                  })
                  .catch((err) => {
                    if (activeStreamRef.current?.toolCalls) {
                      const updatedCalls = activeStreamRef.current.toolCalls.map((c) =>
                        c.function.name === toolName && c.status === 'running'
                          ? { ...c, status: 'error' as const, result: String(err) }
                          : c
                      );
                      activeStreamRef.current = {
                        ...activeStreamRef.current,
                        toolCalls: updatedCalls,
                      };
                      setActiveStreamMessage(activeStreamRef.current);
                    }
                  });
              }

              pendingToolName = undefined;
              pendingToolId = undefined;
              pendingToolArgs = '';
            } else if (eventType === 'tool_result') {
              if (activeStreamRef.current?.toolCalls) {
                const calls = [...activeStreamRef.current.toolCalls];
                const targetName = (message.name as string) || pendingToolName;
                const lastCallIdx = targetName
                  ? calls.findIndex((c) => c.function.name === targetName && c.status === 'running')
                  : calls.length - 1;
                if (lastCallIdx >= 0) {
                  calls[lastCallIdx] = {
                    ...calls[lastCallIdx],
                    status: 'success' as const,
                    result: message.result,
                  };
                  const updatedMsg = { ...activeStreamRef.current, toolCalls: calls };
                  activeStreamRef.current = updatedMsg;
                  setActiveStreamMessage(updatedMsg);
                }
              }
              pendingToolName = undefined;
              pendingToolId = undefined;
              pendingToolArgs = '';
            } else if (eventType === 'thinking') {
              currentReasoning += message.content || '';

              if (now - lastUpdateTime > THROTTLE_MS) {
                lastUpdateTime = now;
                const fullReasoning = activeStreamRef.current?.reasoning
                  ? `${activeStreamRef.current.reasoning}\n${currentReasoning}`
                  : currentReasoning;
                const updatedMsg = {
                  ...activeStreamRef.current,
                  reasoning: fullReasoning || undefined,
                  thinkingTimeMs: Date.now() - (activeStreamRef.current.timestamp || Date.now()),
                };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }
            } else if (eventType === 'done') {
              const remaining = streamFilter.flush();
              if (remaining && activeStreamRef.current) {
                currentContent += remaining;
              }
              if (activeStreamRef.current) {
                const extracted = extractThinkingAndContent(currentContent, currentReasoning);
                const finalReasoningCombined = extracted.parsedReasoning
                  ? activeStreamRef.current.reasoning
                    ? `${activeStreamRef.current.reasoning}\n\n${extracted.parsedReasoning}`
                    : extracted.parsedReasoning
                  : activeStreamRef.current.reasoning || undefined;

                const updatedMsg = {
                  ...activeStreamRef.current,
                  content: extracted.parsedContent,
                  reasoning: finalReasoningCombined,
                };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }
            } else if (eventType === 'error') {
              toast.error(message.error || message.content || 'Generation error');
            }
          }
        };

        let onAbort = () => {
          emit(`cancel_${eventName}`);
        };
        const currentSignal = abortCtrlRef.current?.signal;
        currentSignal?.addEventListener('abort', onAbort);

        // Track the currently-streaming tool call so we can assemble it
        // from tool_start → tool_call (args chunks) → tool_call_complete.
        let pendingToolName: string | undefined;
        let pendingToolId: string | undefined;
        let pendingToolArgs = '';

        try {
          const filteredHistory = llmHistory.filter((m) => {
            if (m.role === 'assistant') {
              const hasText =
                typeof m.content === 'string' ? m.content.trim().length > 0 : !!m.content;
              const hasTools = m.toolCalls && m.toolCalls.length > 0;
              const hasReasoning = m.reasoning && m.reasoning.trim().length > 0;
              return hasText || hasTools || hasReasoning;
            }
            return true;
          });

          // Find the index of the last user message
          let lastUserIdx = -1;
          for (let j = filteredHistory.length - 1; j >= 0; j--) {
            if (filteredHistory[j].role === 'user') {
              lastUserIdx = j;
              break;
            }
          }

          const backendMessages = filteredHistory.map((m, i) => {
            const textContent = i === lastUserIdx ? promptResult.userPrompt : m.content;

            let content: any = textContent;
            const msgSupportsVision = resolveSupportsVision(modelToUse, modelState);

            if (m.images && m.images.length > 0 && msgSupportsVision) {
              const resolvedProvider = currentProvider || detectProvider(modelToUse);
              const isLocalModelMsg = resolvedProvider === 'nyx-native';
              // Build image parts respecting three tiers:
              //   1. Base64 already available (user uploads, OCR pre-processing)
              //   2. Direct URL — accepted by Gemini, GPT-4o, Claude (cloud models)
              //   3. URL-only on local model → already fetched as base64 by the vision flow above;
              //      if somehow still URL-only here, skip rather than send a broken data URI.
              const imageParts = m.images
                .map((img) => {
                  if (img.data && img.data.trim().length > 0) {
                    // Base64 path (user uploads, OCR, or pre-fetched via Rust)
                    const dataUrl = img.data.startsWith('data:')
                      ? img.data
                      : `data:${img.mimeType || 'image/jpeg'};base64,${img.data}`;
                    return { type: 'image_url' as const, image_url: { url: dataUrl } };
                  }
                  if (img.url && !isLocalModelMsg) {
                    // Cloud models accept direct URLs
                    return { type: 'image_url' as const, image_url: { url: img.url } };
                  }
                  // Local model with URL-only image: skip (base64 should have been pre-fetched)
                  return null;
                })
                .filter(Boolean) as Array<{ type: 'image_url'; image_url: { url: string } }>;

              if (imageParts.length > 0) {
                content = [{ type: 'text', text: textContent }, ...imageParts];
              }
            }

            return {
              role: m.role,
              content,
            };
          });

          const resolvedProvider = detectProvider(modelToUse, currentProvider);
          const finalSystemInstruction = promptResult.systemPrompt;

          if (abortCtrlRef.current?.signal.aborted) {
            throw new Error('Aborted');
          }

          let finalTotalInputTokens = Math.ceil((finalSystemInstruction || '').length / 4);
          for (const m of backendMessages) {
            if (typeof m.content === 'string') {
              finalTotalInputTokens += Math.ceil(m.content.length / 4);
            } else if (Array.isArray(m.content)) {
              for (const part of m.content) {
                if (part.type === 'text') {
                  finalTotalInputTokens += Math.ceil(part.text.length / 4);
                }
                if (part.type === 'image_url') {
                  finalTotalInputTokens += 512;
                }
              }
            }
          }

          const effectiveContextWindow = isLocalModel
            ? modelSettings?.contextSize && modelSettings.contextSize > 0
              ? modelSettings.contextSize
              : 8192
            : maxContextTokens > 0
              ? maxContextTokens
              : 128000;

          const isReasoningUserActive = useAppStore.getState().reasoningEnabled ?? true;
          const geminiThinkingLevel = useAppStore.getState().geminiThinkingLevel || 'max';
          const shouldEnableReasoning = isReasoningUserActive;
          const configuredMaxTokens = modelSettings?.maxTokens;
          const finalMaxTokens = isLocalModel
            ? configuredMaxTokens && configuredMaxTokens > 0
              ? configuredMaxTokens
              : Math.max(Math.min(4096, Math.floor(effectiveContextWindow * 0.5)), 2048)
            : configuredMaxTokens && configuredMaxTokens > 0
              ? configuredMaxTokens
              : isPresentationReq
                ? 16384
                : 8192;

          const modelCaps = getModelCapabilities(modelToUse);
          const lowerModel = modelToUse.toLowerCase();
          const isGemma = lowerModel.includes('gemma');
          const isImageGen =
            lowerModel.includes('imagen') ||
            lowerModel.includes('flux') ||
            lowerModel.includes('diffusion');
          const isReasoningOnly =
            lowerModel.includes('deepseek-r1') ||
            lowerModel.includes('deepseek/deepseek-r1') ||
            lowerModel.includes('qwq');
          const shouldPassTools =
            modelCaps.supportsTools && !isImageGen && !isReasoningOnly && !isGreetingOrTrivial;

          const isAntigravitySupervisorActive = modelSettings?.antigravity !== false;

          let enrichedSystemInstruction = finalSystemInstruction;

          // ── Pass 1: Antigravity Agent Controller & Orchestrator (Brain & Memory) ──
          // The Universal Antigravity Agent SDK orchestrates the active model,
          // reviews conversation memory, coordinates tools, and produces a live thinking plan in the ThinkingBlock.
          if (isAntigravitySupervisorActive) {
            const initialThought = `━━━ [Antigravity Controller] Supervising & Orchestrating ━━━\n🔍 Analyzing user specifications for ${modelToUse} (${resolvedProvider})...\n🧠 Reviewing conversation history & TurboVec semantic memory...`;
            if (activeStreamRef.current) {
              activeStreamRef.current.reasoning = initialThought;
              activeStreamRef.current.thinkingTimeMs = 50;
              setActiveStreamMessage({ ...activeStreamRef.current });
            }

            try {
              const planPromise = antigravityAgent.orchestrateAndPlan({
                prompt: finalPrompt,
                history: backendMessages,
                systemInstruction: finalSystemInstruction || undefined,
                targetModel: modelToUse,
                targetProvider: resolvedProvider,
                onStep: (step) => {
                  if (!activeStreamRef.current) return;

                  if (step.thought) {
                    const prev = activeStreamRef.current.reasoning || '';
                    activeStreamRef.current.reasoning = `${prev}\n${step.thought}`;
                    activeStreamRef.current.thinkingTimeMs =
                      Date.now() - (activeStreamRef.current.timestamp || Date.now());
                  }

                  if (step.tool_name) {
                    const callId = `ag_${Date.now()}_${step.tool_name}`;
                    const callStatus: 'running' | 'success' | 'error' = step.is_finished
                      ? 'success'
                      : step.is_error
                        ? 'error'
                        : 'running';
                    const newCall = {
                      id: callId,
                      type: 'function' as const,
                      function: {
                        name: step.tool_name,
                        arguments: JSON.stringify(step.tool_args || {}),
                      },
                      status: callStatus,
                      result: step.tool_result,
                    };
                    activeStreamRef.current.toolCalls = [
                      ...(activeStreamRef.current.toolCalls || []),
                      newCall,
                    ];
                  }

                  setActiveStreamMessage({ ...activeStreamRef.current });
                },
                customFunctionHandler: async (name, args) => {
                  const res = await toolExecutor.executeSingle({
                    id: `ag_call_${Date.now()}`,
                    name,
                    arguments: args,
                    rawArguments: JSON.stringify(args),
                  });
                  return res.content;
                },
              });

              // Fast timeout: Do not block generation for more than 4 seconds
              const timeoutPromise = new Promise<{
                contextEnrichment?: string;
                toolOutputs: any[];
              }>((resolve) =>
                setTimeout(() => resolve({ contextEnrichment: '', toolOutputs: [] }), 4000)
              );

              const planResult = await Promise.race([planPromise, timeoutPromise]);

              if (planResult.contextEnrichment) {
                enrichedSystemInstruction = `${enrichedSystemInstruction}\n\n${planResult.contextEnrichment}`;
              }
            } catch (planErr) {
              console.warn('[useChatPipeline] Antigravity orchestrator planning skipped:', planErr);
            }
          }

          // ── Pass 2: Selected Model Generates Response & Code Artifacts ──
          // The model selected in the model selector (Gemini 3.7 Flash, Claude 3.5 Sonnet, GPT-4o, LLaMA 3.3 70B, etc.)
          // streams the final output and code into the chat and Artifact Canvas.
          let toolIteration = 0;
          const maxToolIterations = 5;

          while (toolIteration < maxToolIterations) {
            toolIteration++;
            const currentIterationCalls = (activeStreamRef.current?.toolCalls || []).length;

            const sharedReq = {
              provider: resolvedProvider,
              model_id: modelToUse,
              api_key: getEffectiveApiKey(resolvedProvider, apiKeys) || '',
              messages: backendMessages,
              temperature: modelSettings?.temperature ?? 0.7,
              top_p: modelSettings?.topP ?? 0.95,
              top_k: 40,
              repeat_penalty: 1.0,
              system_instruction: enrichedSystemInstruction || undefined,
              event_name: eventName,
              max_tokens: finalMaxTokens,
              execution_mode: executionMode,
              reasoning_enabled: shouldEnableReasoning,
              thinking_level: resolvedProvider === 'gemini' ? geminiThinkingLevel : undefined,
              context_window: effectiveContextWindow,
              tools: shouldPassTools ? standardTools : undefined,
              web_search_enabled: liveWebSearchEnabled && !isGemma,
            };

            if (resolvedProvider === 'nyx-native') {
              await invoke('llm_local_stream_request', {
                req: sharedReq,
                onEvent: onProgress,
              });
            } else {
              await invoke('llm_stream_request', {
                req: sharedReq,
                onEvent: onProgress,
              });
            }

            if (abortCtrlRef.current?.signal.aborted) break;

            // Check if new tool calls were emitted in this iteration
            let allCalls: NonNullable<ChatMessage['toolCalls']> = activeStreamRef.current?.toolCalls
              ? [...activeStreamRef.current.toolCalls]
              : [];
            let newCalls: NonNullable<ChatMessage['toolCalls']> =
              allCalls.slice(currentIterationCalls);

            // Fallback: detect XML/prose tool calls emitted directly in text by open-weights models (e.g. Nemotron, Llama)
            if (newCalls.length === 0 && currentContent) {
              const xmlToolMatch = currentContent.match(
                /<(deep_research|calculate|web_search|search_images|read_file)>([\s\S]*?)<\/\1>/i
              );
              if (xmlToolMatch) {
                const toolName = xmlToolMatch[1].toLowerCase();
                const innerText = xmlToolMatch[2].trim();
                let parsedArgs: Record<string, any> = { query: innerText };
                if (toolName === 'calculate') parsedArgs = { expression: innerText };
                try {
                  if (innerText.startsWith('{')) parsedArgs = JSON.parse(innerText);
                } catch {}
                const xmlCall = {
                  id: `call_${Date.now()}`,
                  type: 'function' as const,
                  function: { name: toolName, arguments: JSON.stringify(parsedArgs) },
                  status: 'running' as const,
                };
                newCalls = [xmlCall];
                allCalls = [...allCalls, xmlCall];
                if (activeStreamRef.current) {
                  activeStreamRef.current = {
                    ...activeStreamRef.current,
                    toolCalls: allCalls,
                  };
                  setActiveStreamMessage({ ...activeStreamRef.current });
                }
                // Strip the tool tag from current content so it doesn't leak into output
                currentContent = currentContent.replace(xmlToolMatch[0], '').trim();
              }
            }

            if (newCalls.length > 0) {
              // Execute all pending tool calls from this turn
              const results = await Promise.all(
                newCalls.map(async (call: any) => {
                  let parsed = {};
                  try {
                    parsed = JSON.parse(call.function.arguments || '{}');
                  } catch {}
                  const res = await toolExecutor.executeSingle({
                    id: call.id,
                    name: call.function.name,
                    arguments: parsed,
                    rawArguments: call.function.arguments,
                  });
                  return { call, res };
                })
              );

              // Update status & results on active message
              if (activeStreamRef.current) {
                const updatedCalls = activeStreamRef.current.toolCalls?.map((c: any) => {
                  const match = results.find((r) => r.call.id === c.id);
                  if (match) {
                    return {
                      ...c,
                      status: (match.res.status === 'success' ? 'success' : 'error') as
                        | 'success'
                        | 'error',
                      result:
                        typeof match.res.content === 'string'
                          ? match.res.content
                          : JSON.stringify(match.res.content),
                    };
                  }
                  return c;
                });
                const updatedMsg: ChatMessage = {
                  ...activeStreamRef.current,
                  toolCalls: updatedCalls,
                };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }

              // Append assistant tool-call turn + tool-result turns to backendMessages
              backendMessages.push({
                role: 'assistant',
                content: [
                  ...(currentContent ? [{ type: 'text', text: currentContent }] : []),
                  ...newCalls.map((c: any) => ({
                    type: 'tool_call',
                    id: c.id,
                    thoughtSignature: c.thoughtSignature || c.thought_signature,
                    function: { name: c.function.name, arguments: c.function.arguments },
                  })),
                ] as any,
              });

              for (const { call, res } of results) {
                backendMessages.push({
                  role: 'tool' as any,
                  content: [
                    {
                      tool_call_id: call.id,
                      name: call.function.name,
                      content:
                        typeof res.content === 'string' ? res.content : JSON.stringify(res.content),
                    },
                  ] as any,
                });
              }

              // Reset tool parsing buffers and accumulators for the next model synthesis turn
              pendingToolName = undefined;
              pendingToolId = undefined;
              pendingToolArgs = '';
              currentContent = '';
              currentReasoning = '';
              thinkStartIdx = -1;
              thinkEndIdx = -1;
              continue;
            }

            // If no new tool calls, model gave the final textual response
            break;
          }
        } finally {
          currentSignal?.removeEventListener('abort', onAbort);
        }

        const isAborted = abortCtrlRef.current?.signal.aborted;

        if (activeStreamRef.current) {
          let displayContent = currentContent;
          let extractedReasoning = '';
          if (thinkStartIdx !== -1) {
            if (thinkEndIdx !== -1) {
              extractedReasoning = currentContent
                .substring(thinkStartIdx + thinkTagLen, thinkEndIdx)
                .trim();
              const outsideText = (
                currentContent.substring(0, thinkStartIdx) +
                currentContent.substring(thinkEndIdx + thinkEndTagLen)
              ).trim();
              displayContent = outsideText || extractedReasoning;
            } else {
              extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen).trim();
              const outsideText = currentContent.substring(0, thinkStartIdx).trim();
              displayContent = outsideText || extractedReasoning;
            }
          }
          const combinedReasoning =
            currentReasoning +
            (extractedReasoning ? (currentReasoning ? '\n' : '') + extractedReasoning : '');
          const parsedFinal = extractThinkingAndContent(currentContent, combinedReasoning);
          const finalReasoning = parsedFinal.parsedReasoning || combinedReasoning;
          const finalContent =
            parsedFinal.parsedContent.trim() ||
            displayContent.trim() ||
            activeStreamRef.current.content;

          const isPresentationReq = isPresentationPrompt(prompt);
          const isDiagramReq = isDiagramPrompt(prompt);
          let msgArtifacts = activeStreamRef.current.artifacts
            ? [...activeStreamRef.current.artifacts]
            : [];

          if (isPresentationReq || isSlidevContent(finalContent)) {
            const slidevDeck = isSlidevContent(finalContent)
              ? finalContent
              : compileResponseToSlidev(finalContent, prompt);

            const cleanTitle = (prompt || 'Interactive Presentation')
              .replace(
                /(?:generate|create|make|build|write|give\s+me|show\s+me|a\s+ppt\s+for|a\s+ppt\s+of|ppt\s+for|ppt\s+of|presentation\s+for|presentation\s+of|presentation\s+on|slides\s+for|slides\s+on)/gi,
                ''
              )
              .replace(/\b(?:ppt|presentation|powerpoint|slides|slide\s*deck)\b/gi, '')
              .trim();
            const deckTitle = cleanTitle
              ? cleanTitle
                  .split(/\s+/)
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ')
              : 'Presentation Deck';

            if (
              !msgArtifacts.some(
                (a) =>
                  a.type === 'slidev' ||
                  a.type === 'presentation' ||
                  (a as any).language === 'slidev'
              )
            ) {
              msgArtifacts.push({
                id: `artifact-slidev-${Date.now()}`,
                type: 'slidev',
                title: deckTitle,
                content: slidevDeck,
                language: 'slidev',
              } as ChatArtifact);
            }
          }

          // Diagram Artifact Extraction — mermaid only.
          // HTML/SVG code fences render in the CodeBlock iframe and must NOT
          // create a diagram artifact (which would auto-open the ArtifactCanvas).
          // Only pure mermaid syntax — either an explicit ```mermaid fence or a
          // bare unfenced mermaid block — becomes a diagram artifact.
          const mermaidFenceMatch = finalContent.match(/```mermaid\s*\n([\s\S]*?)```/i);
          const hasRawMermaid =
            !finalContent.includes('<svg') &&
            !finalContent.match(
              /```(?:typescript|javascript|python|rust|go|java|c\+\+|cpp|sql|bash|sh|yaml|json|css|tsx|jsx|html|svg)\s*\n/
            ) &&
            /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|C4Context|C4Container)\b/im.test(
              finalContent
            );

          let diagramCode = '';
          let diagramLang = 'mermaid';

          if (mermaidFenceMatch) {
            diagramCode = mermaidFenceMatch[1].trim();
            diagramLang = 'mermaid';
          } else if (hasRawMermaid) {
            diagramCode = finalContent.trim();
            diagramLang = 'mermaid';
          }

          if (
            diagramCode &&
            !msgArtifacts.some((a) => a.type === 'diagram' || a.language === 'mermaid')
          ) {
            const cleanTitle = (prompt || 'Architecture Diagram')
              .replace(
                /(?:generate|create|make|build|draw|show|give\s+me|a\s+diagram\s+for|diagram\s+of|diagram\s+for|mermaid\s+diagram\s+of|mermaid\s+for)/gi,
                ''
              )
              .replace(/\b(?:diagram|mermaid|flowchart|architecture|system)\b/gi, '')
              .trim();
            const diagramTitle = cleanTitle
              ? cleanTitle
                  .split(/\s+/)
                  .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                  .join(' ') + ' Diagram'
              : 'Architecture Diagram';

            msgArtifacts.push({
              id: `artifact-diagram-${Date.now()}`,
              type: 'diagram',
              title: diagramTitle,
              content: diagramCode,
              language: diagramLang,
            } as ChatArtifact);
          }

          const completedToolCalls = activeStreamRef.current.toolCalls?.map((c) =>
            c.status === 'running' ? { ...c, status: 'success' as const } : c
          );

          let currentThinkingTimeMs: number | undefined = activeStreamRef.current.thinkingTimeMs;
          if (thinkStartIdx !== -1) {
            if (thinkEndIdx !== -1) {
              currentThinkingTimeMs =
                thinkingEndTime - (activeStreamRef.current.timestamp || Date.now());
            } else {
              currentThinkingTimeMs =
                Date.now() - (activeStreamRef.current.timestamp || Date.now());
            }
          } else if (finalReasoning) {
            currentThinkingTimeMs = Date.now() - (activeStreamRef.current.timestamp || Date.now());
          }

          const extractedFinal = extractThinkingAndContent(
            finalContent,
            finalReasoning || activeStreamRef.current.reasoning || ''
          );
          const finalMsg: ChatMessage = {
            ...activeStreamRef.current,
            content: extractedFinal.parsedContent,
            reasoning: extractedFinal.parsedReasoning || undefined,
            thinkingTimeMs: currentThinkingTimeMs,
            toolCalls: completedToolCalls?.length
              ? completedToolCalls
              : activeStreamRef.current.toolCalls,
            artifacts: msgArtifacts.length > 0 ? msgArtifacts : activeStreamRef.current.artifacts,
            status: isAborted ? 'stopped' : 'success',
          };

          const offlineFinalMsg = await inlineOfflineImagesInMessage(finalMsg);
          dispatch({ type: 'APPEND', message: offlineFinalMsg });
          historyRef.current = [...historyRef.current, offlineFinalMsg];
          activeStreamRef.current = null;
          setActiveStreamMessage(null);
        } else {
          const finalHistory = [...historyRef.current];
          const lastIdx = finalHistory.length - 1;
          if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
            const isPresentationReq = isPresentationPrompt(prompt);
            const isDiagramReq = isDiagramPrompt(prompt);
            const existingContent = (finalHistory[lastIdx].content as string) || '';
            let existingArtifacts = finalHistory[lastIdx].artifacts
              ? [...finalHistory[lastIdx].artifacts]
              : [];
            if (
              (isPresentationReq || isSlidevContent(existingContent)) &&
              !existingArtifacts.some((a) => a.type === 'slidev' || a.type === 'presentation')
            ) {
              const slidevDeck = isSlidevContent(existingContent)
                ? existingContent
                : compileResponseToSlidev(existingContent, prompt);
              const cleanTitle = (prompt || 'Interactive Presentation')
                .replace(
                  /(?:generate|create|make|build|write|give\s+me|show\s+me|a\s+ppt\s+for|a\s+ppt\s+of|ppt\s+for|ppt\s+of|presentation\s+for|presentation\s+of|presentation\s+on|slides\s+for|slides\s+on)/gi,
                  ''
                )
                .replace(/\b(?:ppt|presentation|powerpoint|slides|slide\s*deck)\b/gi, '')
                .trim();
              const deckTitle = cleanTitle
                ? cleanTitle
                    .split(/\s+/)
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ')
                : 'Presentation Deck';
              existingArtifacts.push({
                id: `artifact-slidev-${Date.now()}`,
                type: 'slidev',
                title: deckTitle,
                content: slidevDeck,
                language: 'slidev',
              } as ChatArtifact);
            }

            // Diagram Artifact Extraction — mermaid only.
            // HTML/SVG code fences render in the CodeBlock iframe and must NOT
            // create a diagram artifact (which would auto-open the ArtifactCanvas).
            const mermaidFenceMatch = existingContent.match(/```mermaid\s*\n([\s\S]*?)```/i);
            const hasRawMermaid =
              !existingContent.includes('<svg') &&
              !existingContent.match(
                /```(?:typescript|javascript|python|rust|go|java|c\+\+|cpp|sql|bash|sh|yaml|json|css|tsx|jsx|html|svg)\s*\n/
              ) &&
              /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|C4Context|C4Container)\b/im.test(
                existingContent
              );

            let diagramCode = '';
            let diagramLang = 'mermaid';

            if (mermaidFenceMatch) {
              diagramCode = mermaidFenceMatch[1].trim();
              diagramLang = 'mermaid';
            } else if (hasRawMermaid) {
              diagramCode = existingContent.trim();
              diagramLang = 'mermaid';
            }

            if (
              diagramCode &&
              !existingArtifacts.some((a) => a.type === 'diagram' || a.language === 'mermaid')
            ) {
              const cleanTitle = (prompt || 'Architecture Diagram')
                .replace(
                  /(?:generate|create|make|build|draw|show|give\s+me|a\s+diagram\s+for|diagram\s+of|diagram\s+for|mermaid\s+diagram\s+of|mermaid\s+for)/gi,
                  ''
                )
                .replace(/\b(?:diagram|mermaid|flowchart|architecture|system)\b/gi, '')
                .trim();
              const diagramTitle = cleanTitle
                ? cleanTitle
                    .split(/\s+/)
                    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                    .join(' ') + ' Diagram'
                : 'Architecture Diagram';

              existingArtifacts.push({
                id: `artifact-diagram-${Date.now()}`,
                type: 'diagram',
                title: diagramTitle,
                content: diagramCode,
                language: diagramLang,
              } as ChatArtifact);
            }

            const updatedLast = await inlineOfflineImagesInMessage({
              ...finalHistory[lastIdx],
              artifacts:
                existingArtifacts.length > 0 ? existingArtifacts : finalHistory[lastIdx].artifacts,
              status: isAborted ? 'stopped' : 'success',
            } satisfies (typeof finalHistory)[number]);
            finalHistory[lastIdx] = updatedLast;
          }
          dispatch({ type: 'SET', messages: finalHistory });
          historyRef.current = finalHistory;
        }
        persistHistory(historyRef.current);

        setTokensUsed((prev) => prev + estimatedInput);

        return true;
      } catch (error: any) {
        if (error.name !== 'AbortError' && error.message !== 'Aborted') {
          const errorMessage =
            error?.message || (typeof error === 'string' ? error : '') || 'Generation failed';

          if (errorMessage.includes('429')) {
            toast.error('Rate limit reached (429). Please wait or switch models.');
            const provider = detectProvider(modelToUse);
            const apiKey = getEffectiveApiKey(provider, apiKeys) || '';
            usageState.resetLimitForModel(modelToUse, apiKey);
          } else {
            toast.error(errorMessage);
          }

          if (activeStreamRef.current) {
            const finalMsg = {
              ...activeStreamRef.current,
              status: 'error' as const,
              content: errorMessage,
            };
            dispatch({ type: 'APPEND', message: finalMsg });
            historyRef.current = [...historyRef.current, finalMsg];
            activeStreamRef.current = null;
            setActiveStreamMessage(null);
          }
          persistHistory(historyRef.current);
        } else {
          if (activeStreamRef.current) {
            const finalMsg = {
              ...activeStreamRef.current,
              status: 'stopped' as const,
            };
            dispatch({ type: 'APPEND', message: finalMsg });
            historyRef.current = [...historyRef.current, finalMsg];
            activeStreamRef.current = null;
            setActiveStreamMessage(null);
          }
          persistHistory(historyRef.current);
        }
        return false;
      } finally {
        setIsSupervising(false);
        abortCtrlRef.current = null;
        onProgress.onmessage = (): void => {};
      }
    },
    [
      dispatch,
      historyRef,
      activeStreamRef,
      persistHistory,
      setActiveStreamMessage,
      setTokensUsed,
      currentProvider,
      gatewayUrl,
      maxContextTokens,
      tokenBudget,
      tokensUsed,
    ]
  );

  return { runChat, isSupervising, cancelPipeline };
}
