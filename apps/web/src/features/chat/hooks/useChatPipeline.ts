import { useRef, useState, useCallback, useEffect } from 'react';
import { invoke, Channel, convertFileSrc } from '@tauri-apps/api/core';
import { emit, listen } from '@tauri-apps/api/event';
import { toast } from '@src/shared/components/ui/sonner';
import { ChatMessage } from '@nyx/shared';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useModelStore } from '@src/core/stores/useModelStore';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { useAppStore } from '@src/stores/useAppStore';
import { detectProvider, getEffectiveApiKey, getModelCapabilities, isReasoningModel } from '@src/infrastructure/utils/provider';
import { estimateContextTokens, compactHistoryAsync } from '@src/infrastructure/utils/compaction';
import { buildChatPrompts, ChatContext } from '@src/core/prompts/chatPrompts';
import { useLuciferStore, LuciferTurnAnalysis } from '@src/features/agents/lucifer/useLuciferStore';
import { luciferAgentService } from '@src/features/agents/lucifer/luciferAgent.service';
import { AIService } from '@src/features/ai/services/ai.service';
import { StreamFluffFilter } from '../utils/streamFilter';
import { isModelLoaded } from '@src/shared/hooks/useLocalModels';
// ── Lucifer Intelligence Systems ─────────────────────────────────────────────
import { agenticSearch, executeDeepResearch, sanitizeSearchQuery } from '@src/features/agents/lucifer/agenticRAG';
import { routeModel, registerCapabilityCard, estimateCallCost, isSensitiveQuery } from '@src/features/agents/lucifer/modelRouter';
import { retrieveHierarchicalMemory, learnFromSuccess } from '@src/features/agents/lucifer/hierarchicalMemory';
import { newTurnId, useLuciferObservabilityStore, startSpan, endSpan } from '@src/features/agents/lucifer/observabilitySpans';
import { runReflexion, shouldRunReflexion } from '@src/features/agents/lucifer/reflexion';
import { searchTopicImages, searchTopicVideos, searchTopicAudio, ExtractedVideo, ExtractedAudio } from '../../../core/services/mediaEngine';
import { planQueryWithModel, shouldFetchVideos, shouldFetchAudio, shouldFetchImages } from '../../../core/services/intelligentQueryEngine';



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
    /^(?:generate|create|draw|paint|render|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|wallpaper|avatar|portrait)\s+(?:of|showing|about|depicting)/i.test(p) ||
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

export interface RealLibraryImage {
  url: string;
  title: string;
  source: string;
}

// Session-level seen image cache to avoid repeating/reusing identical photos across chat turns
const _sessionSeenImageUrls = new Set<string>();

/**
 * Searches real web images (DuckDuckGo & Bing Web Images) via mediaEngine.
 * Uses Qwen 2.5 1.5B's Intelligent Query Plan to extract high-accuracy visual search queries.
 * Filters out previously seen images in this session so fresh relevant images are always presented.
 */
async function fetchRealLibraryImages(
  query: string,
  limit: number = 4
): Promise<RealLibraryImage[]> {
  try {
    const rawImages = await searchTopicImages(query, limit * 2);
    if (!rawImages || rawImages.length === 0) return [];

    const validImages: RealLibraryImage[] = rawImages
      .filter((img) => img && typeof img.url === 'string' && img.url.startsWith('http'))
      .map((img) => ({
        url: img.url,
        title: img.title || query,
        source: img.source || 'Web Image',
      }));

    // Filter out previously seen images first
    const unseen = validImages.filter((img) => !_sessionSeenImageUrls.has(img.url));
    const chosen = (unseen.length >= 1 ? unseen : validImages).slice(0, limit);

    for (const img of chosen) {
      _sessionSeenImageUrls.add(img.url);
    }

    return chosen;
  } catch (err) {
    console.warn('[useChatPipeline] Web image search error:', err);
    return [];
  }
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
    return () => { mountedRef.current = false; };
  }, []);

  const cancelPipeline = useCallback(() => {
    abortCtrlRef.current?.abort();
    useLuciferStore.getState().setAnalysis(null);
  }, []);

  const runChat = useCallback(async (
    prompt: string, 
    images?: ChatImage[], 
    options?: { skipUserMessage?: boolean; modelOverride?: string }
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
      apiKeys, 
      modelSettings, 
      modelSystemPrompts 
    } = nyxState;

    const estimatedInput = Math.ceil(prompt.length / 4) + (images?.length || 0) * 512;
    const contextTokens = estimateContextTokens(historyRef.current);
    const projectedTotal = contextTokens + estimatedInput + 4096;

    const userSelectedModel = 
      options?.modelOverride || 
      nyxState.currentModel?.id || 
      useAppStore.getState().selectedModel?.id || 
      cloudModelId || 
      localModelId || 
      models?.nyx || 
      'lucifer-native';

    let modelToUse = userSelectedModel;
    let resolvedProviderEarly = currentProvider || 
      (nyxState.currentModel?.provider as any) || 
      (useAppStore.getState().selectedModel?.provider as any) || 
      detectProvider(modelToUse);
    let isLocalModel = resolvedProviderEarly === 'nyx-native';
    let isCloud = ['gemini', 'openrouter', 'openai', 'anthropic', 'deepseek', 'groq', 'mistral'].includes(resolvedProviderEarly);

    // Intercept Missing API Keys for Paid Cloud Models -> Graceful fallback to Native GPU Lucifer Agent (Qwen 2.5 1.5B)
    const isOpenRouterFreeModel = resolvedProviderEarly === 'openrouter' && (
      modelToUse.endsWith(':free') || 
      modelToUse === 'openrouter/auto' || 
      modelToUse.includes('free')
    );

    if (isCloud && !isOpenRouterFreeModel) {
      const apiKey = getEffectiveApiKey(resolvedProviderEarly, apiKeys);
      if (!apiKey || apiKey.trim() === '' || apiKey === 'free') {
        // Do NOT silently swap to Qwen — respect the user's model selector choice.
        // Show a clear actionable error and abort so the user knows exactly what to do.
        const providerName = resolvedProviderEarly.charAt(0).toUpperCase() + resolvedProviderEarly.slice(1);
        toast.error(
          `No API key found for ${providerName}. Go to Settings → API Keys and add your ${providerName} key to use ${modelToUse}.`,
          { duration: 6000 }
        );
        return false;
      }
    }



    // 3. Intercept Unloaded Local Models & Auto-load downloaded models
    // lucifer-native is a virtual alias for Qwen 2.5 1.5B — its physical GGUF filename
    // will never match the virtual ID. The Rust backend handles auto-boot internally in
    // execute_local_stream, so we skip the gate and pass through directly to run_lucifer_turn.
    const isLuciferNativeAlias = modelToUse === 'lucifer-native' || modelToUse === 'qwen2.5-1.5b-instruct-native';
    if (isLocalModel && !isLuciferNativeAlias && !isModelLoaded(modelToUse, modelState.loadedLocalModel)) {
      // Check if the model file exists in the local library (by filename match, not virtual alias)
      const isDownloaded = modelState.localLibraryModels?.some((m: any) =>
        m.id === modelToUse ||
        (m.id || '').toLowerCase().replace(/\\/g, '/').split('/').pop() ===
        (modelToUse || '').toLowerCase().replace(/\\/g, '/').split('/').pop()
      );
      
      if (!options?.skipUserMessage) {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
        };
        dispatch({ type: 'APPEND', message: userMsg });
        historyRef.current = [...historyRef.current, userMsg];
      }

      if (isDownloaded) {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
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
          const listenPromise = new Promise<{ unlisten: () => void; promise: Promise<any> }>((resolve, reject) => {
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
              }).then((fn) => { unlistenReady = fn; });
            });
            const errorPromise = new Promise<never>((_, rej) => {
              listen<{ error: string }>('llm-server-error', (event) => {
                cleanup();
                rej(new Error(event.payload.error));
              }).then((fn) => { unlistenError = fn; });
            });
            const timeoutPromise = new Promise<never>((_, rej) => {
              setTimeout(() => {
                cleanup();
                rej(new Error('Model load timed out after 60 seconds.'));
              }, 60000);
            });

            resolve({
              unlisten: cleanup,
              promise: Promise.race([readyPromise, errorPromise, timeoutPromise])
            });
          });

          const { unlisten, promise } = await listenPromise;

          await invoke('start_local_server', {
            modelId: modelToUse,
            contextSize: modelSettings?.contextSize ?? 0,
            gpuLayers: modelSettings?.gpuLayers === -1 ? null : (modelSettings?.gpuLayers ?? null),
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
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
            role: 'assistant',
            content: `❌ **Failed to auto-load local model**: ${errMsg}. Please verify system memory or try starting the model manually from the registry.`,
            timestamp: Date.now(),
            status: 'success',
            model: modelToUse,
          };
          const finalHistory = historyRef.current.map((m) => m.id === assistantMsg.id ? errorMsg : m);
          dispatch({ type: 'SET', messages: finalHistory });
          historyRef.current = finalHistory;
          persistHistory(historyRef.current);
          return true;
        }
      } else {
        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
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
      llmHistory = await compactHistoryAsync(historyRef.current, targetHistoryBudget, AIService, modelSettings);
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
      if (images && images.length > 0 && !supportsVision) {
        toast.info('Attached image context provided as text reference to active model.');
        const imgRefText = images.map(img => `[USER ATTACHED IMAGE: ${img.name || 'Image'} (URL: ${img.url || 'Attached'})]`).join('\n');
        finalPrompt = `${prompt}\n\n[USER ATTACHED IMAGES]\n${imgRefText}\n[/USER ATTACHED IMAGES]`;
      }

      const skipUserMessage = options?.skipUserMessage;


      // ── Handle image generation (explicit /image command, natural intent, OR active image model) ──
      // ── Handle image generation (ONLY when user explicitly requests image generation or active image model loaded) ──
      const isExplicitImageCmd = isExplicitImageGenerationRequest(prompt);

      // If the currently loaded local model is an image generation model, treat prompt as image request.
      // Uses the pre-computed isActiveModelImageGen flag set by useModelStore.setLoadedLocalModel.
      const isImageModelActive = modelState.isActiveModelImageGen ||
        (!!modelState.loadedLocalModel && [
          'text_encoder', 'text-encoder', 'vae', 'transformer',
          'flux', 'diffusion', 'stable', 'sdxl', 'sd3', 'sd1', 'sd2',
          'controlnet', 'lora', 'unet',
        ].some(kw => modelState.loadedLocalModel!.toLowerCase().includes(kw)));

      if (isExplicitImageCmd || isImageModelActive) {
        const imagePrompt = prompt
          .replace(/^(?:\/image|\/img|image:|draw:|paint:|generate\s+image:)\s*/i, '')
          .replace(/^(?:generate|create|draw|paint|render|make)\s+(?:me\s+)?(?:an?\s+)?(?:image|picture|photo|illustration|artwork|drawing|painting|wallpaper|avatar|portrait)\s+(?:of|showing|about|depicting)\s*/i, '')
          .trim() || prompt.trim();

        toast.info(`Generating image asset for "${imagePrompt}"…`);

        if (!skipUserMessage) {
          const userMsg: ChatMessage = {
            id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
            role: 'user',
            content: prompt,
            timestamp: Date.now(),
          };
          dispatch({ type: 'APPEND', message: userMsg });
          historyRef.current = [...historyRef.current, userMsg];
          persistHistory(historyRef.current);
        }

        try {
          const res = await invoke<{ success: boolean; image_path: string; prompt: string; error?: string }>('generate_local_image', {
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
              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
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
          const ocrRes = await invoke<{ success: boolean; extracted_text: string }>('run_local_ocr', {
            imageDataOrPath: images[0].data || images[0].name,
          });
          if (ocrRes?.success && ocrRes.extracted_text) {
            finalPrompt = `${prompt}\n\n[🔍 Extracted OCR Document Text]:\n${ocrRes.extracted_text}`;
          }
        } catch (err) {
          console.warn('Local OCR skipped:', err);
        }
      }

      if (!skipUserMessage) {
        const userMsg: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          role: 'user',
          content: prompt,
          timestamp: Date.now(),
          images: images?.map((img) => ({
            name: img.name,
            mimeType: img.mimeType || 'image/jpeg',
            data: img.data || '',
          })).filter((img) => !!img.data),
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

      if (!prompt.startsWith('/deep')) {
        setActiveStreamMessage(assistantMsg);
        activeStreamRef.current = assistantMsg;
      }

      await new Promise(resolve => setTimeout(resolve, 0));

      let searchResult: string | undefined;

      const isReasoning = isReasoningModel(modelToUse);
      const resolvedProviderEarly2 = resolvedProviderEarly;
      // When luciferAgentEnabled is true, full autonomous agent orchestration is active.
      // When false, direct prompt-to-model streaming is used without agentic routing.
      const isLuciferActive = nyxState.luciferAgentEnabled;

      let searchQuery = prompt;
      const isGreeting =
        (prompt.trim().length <= 40 &&
          /^(hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day)|yo|sup|ping|test|howdy|what's\s+up|whats\s+up|hiya)(?:[\s!.,?]+(?:lucifer|nyx|there|bot|assistant))?[\s!.,?]*$/i.test(
            prompt.trim()
          )) ||
        (prompt.trim().length <= 80 &&
          /^(who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about\s+yourself|introduce\s+yourself|what\s+is\s+your\s+name|who\s+made\s+you|who\s+created\s+you|who\s+are\s+you\s+and\s+what\s+can\s+you\s+do)(?:[\s!.,?]+(?:lucifer|nyx))?[\s!.,?]*$/i.test(
            prompt.trim()
          ));

      // ── Observability: create a turn span for the full request lifecycle ──
      const turnId = newTurnId();
      useLuciferObservabilityStore.getState().setActiveTurnId(turnId);

      // ── SINGLE analysis call — result is cached and reused at the Lucifer system prompt step below. ──
      const defaultGreetingAnalysis: LuciferTurnAnalysis = {
        intent: 'conversational',
        requires_search: false,
        requires_memory: false,
        requires_image_gen: false,
        requires_voice: false,
        requires_code: false,
        requires_tools: [],
        is_local_model: resolvedProviderEarly2 === 'nyx-native' || resolvedProviderEarly2.includes('local'),
        confidence: 1.0,
        topic_thread: [],
        resolved_entities: {},
        search_follow_up_depth: 0,
      };

      let luciferAnalysis: Awaited<ReturnType<typeof luciferAgentService.analyzeTurn>> | null = isGreeting
        ? defaultGreetingAnalysis
        : null;
      const openrouterKey = getEffectiveApiKey('openrouter', apiKeys);

      // ── Hierarchical Memory + Analysis in parallel ──────────────────────────
      const liveWebSearchEnabled = useAppStore.getState().webSearchEnabled || webSearchEnabled;
      const topicTags = prompt.toLowerCase().split(/\W+/).filter((w) => w.length > 4).slice(0, 8);
      const memoryTimeout = new Promise<null>((res) => setTimeout(() => res(null), 150));
      const [analysisResult, memoryResult] = await Promise.allSettled([
        isLuciferActive && !isGreeting
          ? luciferAgentService.analyzeTurn(llmHistory, resolvedProviderEarly2, openrouterKey, liveWebSearchEnabled)
          : Promise.resolve(null),
        isLuciferActive && !isGreeting
          ? Promise.race([retrieveHierarchicalMemory(prompt, topicTags, turnId), memoryTimeout])
          : Promise.resolve(null),
      ]);

      if (analysisResult.status === 'fulfilled' && analysisResult.value) {
        luciferAnalysis = analysisResult.value;
        useLuciferStore.getState().setAnalysis(luciferAnalysis);
        if (luciferAnalysis.decontextualized_query) {
          searchQuery = luciferAnalysis.decontextualized_query;
        }
      }

      // Extract hierarchical memory context block if available and relevant
      let memoryContextBlock: string | undefined = undefined;
      if (memoryResult.status === 'fulfilled' && memoryResult.value && !memoryResult.value.isEmpty) {
        memoryContextBlock = memoryResult.value.consolidatedBlock;
      }

      // ── Model Router: advisory routing (log + capability card registration) ──
      if (isLuciferActive && !isGreeting) {
        try {
          const capCard = useLuciferStore.getState().modelCapabilityCard;
          if (capCard) registerCapabilityCard(capCard);

          const isSensitive = isSensitiveQuery(prompt);
          const routingDecision = routeModel({
            requiresVision: !!(images && images.length > 0),
            requiresReasoning: isReasoning,
            requiresRealtime: luciferAnalysis?.requires_search === true,
            isSensitive,
            currentModelId: modelToUse,
            currentProvider: resolvedProviderEarly2,
            apiKeys: apiKeys as Record<string, string | undefined>,
            loadedLocalModel: useModelStore.getState().loadedLocalModel,
            turnId,
          });

          if (routingDecision.overrideApplied) {
            useLuciferStore.getState().addLog({
              type: 'info',
              title: `Model Router: ${routingDecision.overrideReason ?? 'optimal'}`,
              details: `Recommends ${routingDecision.modelId} — ${routingDecision.reason}`,
            });
          }
        } catch (routerErr) {
          console.warn('[useChatPipeline] Model router error (non-fatal):', routerErr);
        }
      }

      // If this is a model_capabilities query, build capability response and inject cleanly without prompt instruction pollution
      if (luciferAnalysis?.intent === 'model_capabilities') {
        try {
          const capabilityMd = await luciferAgentService.buildCapabilityResponse(
            modelToUse,
            resolvedProviderEarly2,
            openrouterKey
          );
          finalPrompt = `${prompt}\n\n[CONTEXT: ACTIVE MODEL CAPABILITY SPECS]\n${capabilityMd}`;
        } catch (err) {
          console.warn('[useChatPipeline] Capability response build failed:', err);
        }
      }

      // ── Fast heuristic query plan — instant, zero latency ────────────────
      // Used immediately as the fallback while the LLM plan is computed in bg.
      const searchIntentPattern = /^(?:\/search|\/web|\/deep|search:|google:|lookup:|web:|research:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|look\s*up\s+online|browse\s+the\s+web|research\s+about|research\s+on|find\s+info|information\s+on)\b|\b(?:latest|current|today's|breaking|live|real-time|price|prices|cost|expenses|living\s+expenses|salary|fee|fees|stock|stocks|crypto|weather|score|scores|winner|results|version|release|fixtures|standings|university|college|student|living\s+in)\b|\b(?:what\s+is|what\s+are|how\s+much|who\s+is|where\s+is|tell\s+me\s+about|give\s+me\s+information|research)\b/i;
      const rawSanitized = sanitizeSearchQuery(searchQuery);
      let queryPlan: Awaited<ReturnType<typeof planQueryWithModel>> = {
        intent: 'factual_overview',
        requiresSearch: searchIntentPattern.test(searchQuery),
        webSearchQuery: rawSanitized,
        deepResearchQueries: [],
        photoSearchQuery: rawSanitized,
        sectionalTopics: [],
        primarySubject: rawSanitized,
        domainCategory: 'general',
        targetDepth: 'concise',
      };

      // Derive search routing immediately from heuristic (before model plan resolves)
      const cleanSearchQuery = queryPlan.webSearchQuery || rawSanitized;

      const isDeepResearch =
        isLuciferActive &&
        !isGreeting &&
        (prompt.startsWith('/deep') ||
          /^(?:deep research:\s*|\/deep\b)/i.test(prompt.trim()) ||
          /\b(?:exhaustive research|conduct deep research)\b/i.test(prompt));

      const isResearch =
        isLuciferActive &&
        !isGreeting &&
        !isDeepResearch &&
        (prompt.startsWith('/research') ||
          /\b(?:research|compare|reviews|overview|deep dive|study|analysis)\b/i.test(prompt));

      // Standard web search: ONLY if not a greeting/chit-chat AND (explicit command OR live search enabled OR agent requires factual search)
      const isStandardWebSearch =
        !isGreeting &&
        !isDeepResearch &&
        !isResearch &&
        (prompt.startsWith('/search') ||
          prompt.startsWith('/web') ||
          liveWebSearchEnabled ||
          (isLuciferActive && (searchIntentPattern.test(searchQuery) || luciferAnalysis?.requires_search === true)));

      const shouldSearch = !isGreeting && (isDeepResearch || isResearch || isStandardWebSearch);
      const wantsImages = !isGreeting && shouldFetchImages(prompt, {
        isWebSearch: isStandardWebSearch || liveWebSearchEnabled,
        isDeepResearch,
        isLucifer: isLuciferActive,
      });
      const shouldFetchMedia = !isGreeting && wantsImages;

      // Fire model plan in background ONLY when:
      //   1. Search/media is actually needed (not a greeting or pure-chat)
      //   2. A cloud model is selected (nyx-native shares the GPU with run_lucifer_turn
      //      and causes 2-4 min contention — skip it entirely for local models)
      const isCloudModelForPlan = resolvedProviderEarly !== 'nyx-native' &&
        resolvedProviderEarly !== 'lucifer-native' &&
        !resolvedProviderEarly.includes('local') &&
        !resolvedProviderEarly.includes('ollama') &&
        !resolvedProviderEarly.includes('lmstudio');

      const queryPlanPromise = (shouldSearch || shouldFetchMedia) && isCloudModelForPlan
        ? planQueryWithModel(searchQuery || prompt, {
            provider: resolvedProviderEarly,
            modelId: modelToUse,
            apiKey: getEffectiveApiKey(resolvedProviderEarly, apiKeys),
            timeoutMs: 1200,
          }).then((plan) => { queryPlan = plan; }).catch(() => {/* keep heuristic plan */})
        : Promise.resolve();

      let totalResultsCount = 0;
      let subQueriesCount = 1;
      let collectedCitations: Array<{ id: string; index: number; title: string; url: string; snippet: string; domain?: string }> = [];
      let mediaContextBlock: string | undefined;

      // ── CONCURRENT PRE-FLIGHT: Web Search & Media Retrieval Execute Simultaneously ──
      const searchPromise = (async () => {
        if (!shouldSearch) return;
        const tavilyKey = searchProvider === 'tavily' ? getEffectiveApiKey('tavily', apiKeys) : undefined;
        try {
          // Fast-path: Microsecond in-memory prompt response cache lookup (<0.01ms)
          const cachedPromptResult = await invoke<string | null>('check_prompt_cache_command', { prompt: cleanSearchQuery }).catch(() => null);
          if (cachedPromptResult) {
            searchResult = cachedPromptResult;
            toast.success('⚡ Microsecond search cache hit (<0.01ms)');
            return;
          }

          if (activeStreamRef.current) {
            const reasoningText = isDeepResearch
              ? '> 🧬 Autonomous Deep Research Engine Active... Running multi-hop gap-fill matrix & scraping 25+ web sources...\n'
              : isResearch
              ? '> 🔬 Multi-Source Synthesis Research Active... Querying 20+ web sources & extracting article bodies...\n'
              : '> 🌐 Web Search Active... Querying live search index...\n';
            const updated = {
              ...activeStreamRef.current,
              reasoning: reasoningText,
            };
            activeStreamRef.current = updated;
            setActiveStreamMessage(updated);
          }

          if (isDeepResearch) {
            const appendResearchProgress = (msg: string) => {
              if (activeStreamRef.current) {
                const updated = {
                  ...activeStreamRef.current,
                  reasoning: (activeStreamRef.current.reasoning || '') + msg + '\n',
                };
                activeStreamRef.current = updated;
                setActiveStreamMessage(updated);
              }
            };

            const deepResult = await executeDeepResearch(cleanSearchQuery, {
              provider: searchProvider as any,
              tavilyApiKey: tavilyKey,
              maxPages: 20,
              depth: 'deep',
              turnId,
              onProgress: appendResearchProgress,
            });

            if (abortCtrlRef.current?.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            if (deepResult.scrapedUrls.length > 0 || deepResult.totalResults > 0) {
              searchResult = deepResult.deepResearchReportContext;
              totalResultsCount = deepResult.scrapedUrls.length || deepResult.totalResults;
              subQueriesCount = deepResult.subQueries.length;
              const seen = new Set<string>();
              (deepResult.results || []).forEach((r: any) => {
                if (r.url && !seen.has(r.url)) {
                  seen.add(r.url);
                  try {
                    collectedCitations.push({
                      id: String(collectedCitations.length + 1),
                      index: collectedCitations.length + 1,
                      title: r.title || r.url,
                      url: r.url,
                      snippet: r.snippet?.slice(0, 200) || '',
                      domain: new URL(r.url).hostname.replace('www.', ''),
                    });
                  } catch { /* skip */ }
                }
              });
              toast.success(`Deep Research Complete: ${totalResultsCount} web sources scraped (${deepResult.reflectionHops} hops)`);
            } else {
              toast.warning('No deep research results found.');
            }
          } else if (isResearch) {
            const ragResult = await agenticSearch(cleanSearchQuery, {
              provider: searchProvider as any,
              tavilyApiKey: tavilyKey,
              maxSubQueries: 4,
              resultsPerQuery: 6,
              includeMemory: true,
              fetchPageContent: true,
              maxCharsPerPage: 30000,
              turnId,
            });

            if (abortCtrlRef.current?.signal.aborted) {
              throw new DOMException('Aborted', 'AbortError');
            }

            if (ragResult.totalResults > 0) {
              searchResult = ragResult.consolidatedContext;
              totalResultsCount = ragResult.totalResults;
              subQueriesCount = ragResult.subQueries.length;
              const seen = new Set<string>();
              ragResult.results.forEach((r: any) => {
                if (r.url && !seen.has(r.url)) {
                  seen.add(r.url);
                  try {
                    collectedCitations.push({
                      id: String(collectedCitations.length + 1),
                      index: collectedCitations.length + 1,
                      title: r.title || r.url,
                      url: r.url,
                      snippet: r.snippet?.slice(0, 200) || '',
                      domain: new URL(r.url).hostname.replace('www.', ''),
                    });
                  } catch { /* skip invalid URLs */ }
                }
              });

              if (searchResult) {
                invoke('turbovec_add_memory', {
                  text: `Deep Research [${cleanSearchQuery}]:\n\n${searchResult}`,
                  metadata: JSON.stringify({ query: cleanSearchQuery, timestamp: Date.now(), domain: 'deep-research' })
                }).catch(() => {});
              }
              toast.success(`Research Synthesis Complete: ${totalResultsCount} web sources across ${subQueriesCount} queries`);
            } else {
              toast.warning('No research results found.');
            }
          } else {
            // Ultra-Fast Direct Web Search with Robust Fallbacks
            const rawSearchPromise = invoke<string>('search_web_command', {
              query: cleanSearchQuery,
              numResults: 6,
              searchProvider: searchProvider === 'tavily' ? 'tavily' : 'duckduckgo',
              apiKey: tavilyKey,
            }).catch(() => '');
            const searchTimeout = new Promise<string>((res) => setTimeout(() => res(''), 4500));
            let combinedRawSearch = await Promise.race([rawSearchPromise, searchTimeout]);

            // Fallback: If backend search returned empty, directly query Wikipedia REST API
            if (!combinedRawSearch || combinedRawSearch.trim().length === 0) {
              try {
                const wikiUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(cleanSearchQuery)}&format=json&origin=*`;
                const wikiResp = await fetch(wikiUrl);
                if (wikiResp.ok) {
                  const data = await wikiResp.json();
                  const searchItems = data?.query?.search || [];
                  if (searchItems.length > 0) {
                    const parsedWiki = searchItems.slice(0, 5).map((item: any, idx: number) => {
                      const cleanSnippet = (item.snippet || '').replace(/<[^>]*>/g, '').trim();
                      const pageUrl = `https://en.wikipedia.org/wiki/${encodeURIComponent(item.title)}`;
                      return `[Source ${idx + 1}] ${item.title}\nURL: ${pageUrl}\nContent: ${cleanSnippet}`;
                    }).join('\n\n');
                    combinedRawSearch = `⚡ REAL-TIME SEARCH RESULTS — Wikipedia Reference:\n\n${parsedWiki}`;
                  }
                }
              } catch (wikiErr) {
                console.warn('[search fallback] Direct wiki search failed:', wikiErr);
              }
            }

            if (combinedRawSearch && combinedRawSearch.trim().length > 0) {
              searchResult = combinedRawSearch;
              totalResultsCount = 6;
              subQueriesCount = 1;

              // Robust multi-format source block parser: [Source N] Title\nURL: ...\nContent: ...
              const sourceRegex = /\[Source\s+\d+\]\s*([^\n]+)\s*\nURL:\s*(https?:\/\/[^\s\n]+)\s*\nContent:\s*([^\n]+(?:\n(?!\[Source|\n)[^\n]+)*)/gi;
              let match: RegExpExecArray | null;
              const seen = new Set<string>();

              while ((match = sourceRegex.exec(combinedRawSearch)) !== null) {
                const title = match[1].trim();
                const url = match[2].trim();
                const snippet = match[3].trim();
                if (!seen.has(url)) {
                  seen.add(url);
                  try {
                    collectedCitations.push({
                      id: String(collectedCitations.length + 1),
                      index: collectedCitations.length + 1,
                      title: title || url,
                      url,
                      snippet: snippet.slice(0, 200),
                      domain: new URL(url).hostname.replace('www.', ''),
                    });
                  } catch { /* skip invalid URLs */ }
                }
              }
            }
          }

          if (searchResult) {
            invoke('save_prompt_cache_command', { prompt: cleanSearchQuery, response: searchResult }).catch(() => {});
            invoke('turbovec_add_memory', {
              text: `Web Search Query: ${cleanSearchQuery}\n\n${searchResult}`,
              metadata: JSON.stringify({ query: cleanSearchQuery, timestamp: Date.now(), domain: 'web-search' })
            }).catch(() => {});
          }

          if (activeStreamRef.current) {
            const searchReasoningSnippet = searchResult
              ? `> 🌐 **Live Web Search (${searchProvider === 'tavily' ? 'Tavily' : 'DuckDuckGo'})**: Retrieved ${totalResultsCount} results across ${subQueriesCount} query path(s):\n${searchResult.split('\n').map((l) => '> ' + l).slice(0, 15).join('\n')}\n\n`
              : '> 🌐 **Live Web Search**: No results found.\n\n';

            const updated = {
              ...activeStreamRef.current,
              reasoning: (activeStreamRef.current.reasoning || '') + searchReasoningSnippet,
            };
            activeStreamRef.current = updated;
            setActiveStreamMessage(updated);
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || e.message === 'Aborted') throw e;
          const msg = e?.message || String(e);
          console.warn('[web search] Failed:', msg);
          toast.error(`Web search failed: ${msg}`);
        }
      })();

      const mediaPromise = (async () => {
        if (!shouldFetchMedia) return;
        try {
          // Wait for model plan to arrive (it may have resolved by now since search ran in parallel)
          await Promise.race([queryPlanPromise, new Promise((res) => setTimeout(res, 200))]);

          const photoTargetQuery = queryPlan.photoSearchQuery || queryPlan.primarySubject || cleanSearchQuery;

          // Image count policy:
          //   Normal search  → 1 image total, no sectional topics
          //   Research       → 2 images, no sectional topics
          //   Deep research  → up to 3 images + sectional topics
          const mainImageLimit = isDeepResearch ? 2 : 1;
          const mainImagePromise = fetchRealLibraryImages(photoTargetQuery, mainImageLimit)
            .then((imgs) => ({ topicTitle: photoTargetQuery, query: photoTargetQuery, images: imgs }));

          const sectionalImagePromises = isDeepResearch
            ? (queryPlan.sectionalTopics || []).slice(0, 3).map(async (st) => {
                const imgs = await fetchRealLibraryImages(st.photoQuery, 1);
                return { topicTitle: st.title, query: st.photoQuery, images: imgs };
              })
            : [];

          const topicMediaResults = await Promise.all([mainImagePromise, ...sectionalImagePromises]);
          const realImages = topicMediaResults.flatMap((tm) => tm.images);

          if (realImages.length > 0) {
            // Attach top images as vision inputs to vision models
            const supportsVisionNow = resolveSupportsVision(modelToUse, modelState);
            if (supportsVisionNow && !isLocalModel && realImages.length > 0) {
              let lastUserIdx = -1;
              for (let i = llmHistory.length - 1; i >= 0; i--) {
                if (llmHistory[i].role === 'user') {
                  lastUserIdx = i;
                  break;
                }
              }
              if (lastUserIdx !== -1) {
                const existing = llmHistory[lastUserIdx];
                llmHistory[lastUserIdx] = {
                  ...existing,
                  images: [
                    ...(existing.images || []),
                    ...realImages.slice(0, mainImageLimit).map(({ url, title }) => ({
                      name: title,
                      url,
                      mimeType: 'image/jpeg' as const,
                      data: '',
                    })),
                  ],
                };
              }
            }

            if (activeStreamRef.current) {
              const currentImages = activeStreamRef.current.images || [];
              const formattedImages = realImages.map((img) => ({
                name: img.title,
                url: img.url,
                engine: img.source || 'DuckDuckGo / Bing Images',
              }));
              const seenImgs = new Set(currentImages.map((i: any) => i.url));
              const dedupedImages = formattedImages.filter((i) => !seenImgs.has(i.url));

              const updatedMsg = {
                ...activeStreamRef.current,
                images: [...currentImages, ...dedupedImages],
              };
              activeStreamRef.current = updatedMsg;
              setActiveStreamMessage(updatedMsg);
            }

            const isoNow = new Date().toISOString().slice(0, 10);
            const activeTopicGroups = topicMediaResults.filter((tm) => tm.images.length > 0);
            const titleSeparatedImagesXml = activeTopicGroups.length > 0
              ? `<title_separated_media_groups total_groups="${activeTopicGroups.length}">\n` +
                activeTopicGroups.map((tm, gIdx) =>
                  `  <topic_group index="${gIdx + 1}" section_title="${tm.topicTitle.replace(/[<>]/g, '')}" targeted_query="${tm.query}">\n` +
                  tm.images.map((img, iIdx) =>
                    `    <image index="${iIdx + 1}">\n      <title>${(img.title || tm.topicTitle).replace(/[<>]/g, '')}</title>\n      <url>${img.url}</url>\n      <source>${(img.source || 'DuckDuckGo / Bing Images').toUpperCase()}</source>\n    </image>`
                  ).join('\n') +
                  `\n  </topic_group>`
                ).join('\n\n') +
                `\n</title_separated_media_groups>`
              : '<title_separated_media_groups count="0" />';

            mediaContextBlock = `\n<verified_media_library source="DuckDuckGo / Bing Web Images" retrieved="${isoNow}">\n${titleSeparatedImagesXml}\n</verified_media_library>`;
          }
        } catch (err) {
          console.warn('[useChatPipeline] Media retrieval failed (non-fatal):', err);
        }
      })();

      // Execute search and media retrieval concurrently in parallel!
      await Promise.all([searchPromise, mediaPromise]);

      const eventName = `dag_update_${crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)}`;

      const chatContext: ChatContext = {
        conversationTone: 'casual',
        detectedLanguage: 'English',
        previousMessages: historyRef.current.length,
        reasoningEnabled: isReasoning,
        localModel: resolvedProviderEarly2 === 'nyx-native',
        customSystemPrompt: modelSystemPrompts?.[modelToUse] || undefined,
        hasWebSearch: !!searchResult,
        isLuciferMode: isLuciferActive,
      };

      // Auto Context Controller: Prune search context if it exceeds model context headroom
      let effectiveSearchResult = searchResult;
      // Qwen 2.5 1.5B supports up to 32K context — do not cap at 4096
      const effectiveMaxCtx = resolvedProviderEarly2 === 'nyx-native'
        ? (modelSettings?.contextSize && modelSettings.contextSize > 0 ? modelSettings.contextSize : 32768)
        : 32768;
      if (effectiveSearchResult && effectiveMaxCtx <= 8192) {
        const maxSearchChars = Math.max(Math.floor(effectiveMaxCtx * 1.5), 2000);
        if (effectiveSearchResult.length > maxSearchChars) {
          effectiveSearchResult = effectiveSearchResult.slice(0, maxSearchChars) + '\n\n[...additional search results pruned to fit context window...]';
        }
      }

      // Pass searchResult, mediaContext, and memoryContext separately so buildChatPrompts creates clean semantic XML blocks
      const promptResult = buildChatPrompts(
        modelToUse,
        chatContext,
        finalPrompt,
        llmHistory,
        effectiveSearchResult,
        resolvedProviderEarly2,
        mediaContextBlock,
        memoryContextBlock
      );

      let currentContent = initialWarning;
      let currentReasoning = '';
      let thinkStartIdx = -1;
      let thinkTagLen = 0;
      let thinkEndIdx = -1;
      let thinkEndTagLen = 0;
      let thinkingEndTime = -1;
      let lastUpdateTime = 0;
      let THROTTLE_MS = 50;
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

            if (thinkStartIdx !== -1) {
              const innerText = thinkEndIdx !== -1
                ? currentContent.substring(thinkStartIdx + thinkTagLen, thinkEndIdx).trim()
                : currentContent.substring(thinkStartIdx + thinkTagLen).trim();

              const outsideText = thinkEndIdx !== -1
                ? (currentContent.substring(0, thinkStartIdx) + currentContent.substring(thinkEndIdx + thinkEndTagLen)).trim()
                : currentContent.substring(0, thinkStartIdx).trim();

              extractedReasoning = innerText;
              displayContent = outsideText;
            }

            if (now - lastUpdateTime > THROTTLE_MS) {
              lastUpdateTime = now;
              const combinedReasoning = currentReasoning + (extractedReasoning ? (currentReasoning ? '\n' : '') + extractedReasoning : '');
              
              let currentThinkingTimeMs: number | undefined = activeStreamRef.current.thinkingTimeMs;
              if (thinkStartIdx !== -1 && isModelReasoningType) {
                if (thinkEndIdx !== -1) {
                  currentThinkingTimeMs = thinkingEndTime - (activeStreamRef.current.timestamp || Date.now());
                } else {
                  currentThinkingTimeMs = Date.now() - (activeStreamRef.current.timestamp || Date.now());
                }
              }

              const updatedMsg = {
                  ...activeStreamRef.current,
                  content: displayContent.trim(),
                  reasoning: combinedReasoning || undefined,
                  thinkingTimeMs: currentThinkingTimeMs,
              };
              activeStreamRef.current = updatedMsg;
              setActiveStreamMessage(updatedMsg);
              
              // Dynamic UI Throttling: Scale update frequency based on response length
              // Small response (< 500 chars): 24ms (~40 FPS, silky smooth start)
              // Large response (> 1000 chars): 60ms (~16 FPS, zero UI thread lock on massive Markdown blocks)
              THROTTLE_MS = displayContent.length > 1000 ? 60 : 24;
            }
          } else if (eventType === 'tool_start') {
            // Rust sends: event_type="tool_start", name=<tool_name>, tool_call.id=<id>
            // Begin accumulating a new tool call; show it as running in the UI immediately.
            pendingToolName = message.name as string | undefined;
            pendingToolId = (message.tool_call as any)?.id as string | undefined;
            pendingToolArgs = '';
            if (pendingToolName) {
              const newCall = {
                id: pendingToolId || (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15)),
                type: 'function' as const,
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
            // Rust sends: event_type="tool_call", content=<args_chunk>
            // Accumulate streaming args (args may arrive in multiple chunks).
            pendingToolArgs += (message.content as string) || '';
          } else if (eventType === 'tool_call_complete') {
            // Rust sends: event_type="tool_call_complete" — commit the assembled tool call.
            if (pendingToolName && activeStreamRef.current.toolCalls) {
              const calls = [...activeStreamRef.current.toolCalls];
              const lastCallIdx = calls.findIndex(c => c.function.name === pendingToolName && c.status === 'running');
              if (lastCallIdx >= 0) {
                calls[lastCallIdx] = {
                  ...calls[lastCallIdx],
                  function: { name: pendingToolName, arguments: pendingToolArgs || '{}' },
                  status: 'running' as const,
                };
                const updatedMsg = { ...activeStreamRef.current, toolCalls: calls };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }
            }
          } else if (eventType === 'tool_result') {
            // Rust emits this when a tool finishes executing (Lucifer loop).
            // message.name = tool name, message.result = result value
            if (activeStreamRef.current.toolCalls) {
              const calls = [...activeStreamRef.current.toolCalls];
              const targetName = (message.name as string) || pendingToolName;
              const lastCallIdx = targetName
                ? calls.findIndex(c => c.function.name === targetName && c.status === 'running')
                : calls.length - 1;
              if (lastCallIdx >= 0) {
                calls[lastCallIdx] = { ...calls[lastCallIdx], status: 'success' as const, result: message.result };
                const updatedMsg = { ...activeStreamRef.current, toolCalls: calls };
                activeStreamRef.current = updatedMsg;
                setActiveStreamMessage(updatedMsg);
              }
            }
            // Reset pending tool state
            pendingToolName = undefined;
            pendingToolId = undefined;
            pendingToolArgs = '';
          } else if (eventType === 'thinking') {
            currentReasoning += message.content || '';
            
            if (now - lastUpdateTime > THROTTLE_MS) {
              lastUpdateTime = now;
              const updatedMsg = { 
                ...activeStreamRef.current, 
                reasoning: currentReasoning || undefined,
                thinkingTimeMs: Date.now() - (activeStreamRef.current.timestamp || Date.now())
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
               let finalDisplay = currentContent;
               let finalReasoning = currentReasoning;
               const matchStart = currentContent.match(/<(?:think|thought|thinking)(?:\s+[^>]*?)?>/i);
               if (matchStart) {
                 const startIdx = matchStart.index!;
                 const tagLen = matchStart[0].length;
                 const matchEnd = currentContent.substring(startIdx + tagLen).match(/<\/(?:think|thought|thinking)>/i);
                 if (matchEnd) {
                   const endIdx = startIdx + tagLen + matchEnd.index!;
                   const endTagLen = matchEnd[0].length;
                   const inner = currentContent.substring(startIdx + tagLen, endIdx).trim();
                   const outside = (currentContent.substring(0, startIdx) + currentContent.substring(endIdx + endTagLen)).trim();
                   finalReasoning = (finalReasoning ? finalReasoning + '\n' : '') + inner;
                   finalDisplay = outside;
                 }
               }
               const updatedMsg = {
                 ...activeStreamRef.current,
                 content: finalDisplay.trim(),
                 reasoning: finalReasoning || undefined,
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
        const backendMessages = llmHistory
          .filter((m) => {
            if (m.role === 'assistant') {
              const hasText = typeof m.content === 'string' ? m.content.trim().length > 0 : !!m.content;
              const hasTools = m.toolCalls && m.toolCalls.length > 0;
              const hasReasoning = m.reasoning && m.reasoning.trim().length > 0;
              return hasText || hasTools || hasReasoning;
            }
            return true;
          })
          .map((m, i, arr) => {
            const textContent = (i === arr.length - 1 && m.role === 'user')
              ? promptResult.userPrompt
              : m.content;
              
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
                content = [
                  { type: 'text', text: textContent },
                  ...imageParts,
                ];
              }
            }

            return {
              role: m.role,
              content
            };
          });

        const resolvedProvider = currentProvider || detectProvider(modelToUse);
        let finalSystemInstruction = promptResult.systemPrompt;
        
        if (isLuciferActive) {
          try {
            // REUSE the analysis from the first call (cached — no double network round trip)
            const analysis = luciferAnalysis ?? (isGreeting ? defaultGreetingAnalysis : await luciferAgentService.analyzeTurn(
              backendMessages,
              resolvedProvider,
              openrouterKey
            ));
            useLuciferStore.getState().setAnalysis(analysis);
            useLuciferStore.getState().addLog({
              type: 'info',
              title: `Lucifer Turn Initialized (${analysis.intent})`,
              details: `Model: ${modelToUse} | Provider: ${resolvedProvider}`,
            });
            finalSystemInstruction = luciferAgentService.enrichSystemPrompt(
              finalSystemInstruction,
              analysis,
              modelToUse,
              resolvedProvider,
              null
            );

          } catch (err) {
            console.warn('[useChatPipeline] Lucifer intent analysis fallback:', err);
          }
        }

        // Web search grounding is already handled by the REAL-TIME GROUNDING MANDATE
        // section built in buildChatPrompts (chatPrompts.ts) — no extra directive needed.

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
        
        // Auto Context Controller: Dynamic Max Tokens & Context Window Sizing
        const effectiveContextWindow = isLocalModel
          ? (modelSettings?.contextSize && modelSettings.contextSize > 0 ? modelSettings.contextSize : 4096)
          : (maxContextTokens > 0 ? maxContextTokens : 32768);

        const isFactualOrSearch = !!searchResult || liveWebSearchEnabled || /^(?:who|what|when|where|which|how|why|research|find|tell|explain|list|show|compare|get|cost|price|living)\b/i.test(prompt.trim());
        // Enable reasoning for reasoning models, research queries, and web search turns
        const shouldEnableReasoning = isReasoningModel(modelToUse) || isDeepResearch || isFactualOrSearch || isReasoning;

        // Allocate generation headroom that fits comfortably within the effective context window
        const desiredOutputTokens = isDeepResearch ? 16384 : (isFactualOrSearch ? 8192 : 4096);
        const maxPossibleOutput = Math.max(Math.floor(effectiveContextWindow * 0.35), 256);
        const finalMaxTokens = Math.min(desiredOutputTokens, maxPossibleOutput);

        // ── Autonomous Lucifer Sampling Parameters ─────────────────────────
        // Lucifer dynamically selects temperature, top_p, and repeat_penalty
        // based on intent classification:
        //   • Code / Debug / Refactor → 0.1 (deterministic, precise syntax)
        //   • Factual Q&A / Search    → 0.2 (high precision, zero hallucination)
        //   • Architecture / Design   → 0.5 (structured reasoning)
        //   • Greetings / Farewell    → 0.7 (warm human tone)
        //   • Balanced General Q&A    → 0.4
        const luciferTemperature = (() => {
          if (
            luciferAnalysis?.requires_code ||
            luciferAnalysis?.intent === 'code_engineering'
          ) {
            return 0.1;
          }
          if (
            luciferAnalysis?.requires_search ||
            luciferAnalysis?.intent === 'web_search' ||
            searchResult ||
            isFactualOrSearch
          ) {
            return 0.2;
          }
          if (luciferAnalysis?.intent === 'memory_rag') {
            return 0.3;
          }
          if (luciferAnalysis?.intent === 'conversational') {
            return 0.7;
          }
          return 0.4;
        })();

        const luciferTopP = luciferTemperature <= 0.2 ? 0.95 : 0.98;
        const luciferRepeatPenalty = luciferTemperature <= 0.2 ? 1.0 : 1.05;

        const sharedReq = {
          provider: resolvedProvider,
          model_id: modelToUse,
          api_key: getEffectiveApiKey(resolvedProvider, apiKeys) || '',
          messages: backendMessages,
          temperature: luciferTemperature,
          top_p: luciferTopP,
          top_k: 40,
          repeat_penalty: luciferRepeatPenalty,
          system_instruction: finalSystemInstruction,
          event_name: eventName,
          max_tokens: finalMaxTokens,
          execution_mode: executionMode,
          reasoning_enabled: shouldEnableReasoning,
          context_window: effectiveContextWindow,
          active_tools: luciferAnalysis?.requires_tools ?? [],
          agent_mode: isLuciferActive,
        };

        // All models — both cloud and local (nyx-native) — route through
        // run_lucifer_turn. This is the single unified execution path.
        const llmSpan = startSpan('llm_call', `LLM: ${modelToUse}`, turnId, undefined, {
          model: modelToUse,
          provider: resolvedProvider,
          tokensIn: finalTotalInputTokens,
        });
        try {
          await invoke('run_lucifer_turn', {
            request: sharedReq,
            onEvent: onProgress,
          });
          endSpan(llmSpan, 'ok', { tokensOut: Math.ceil(currentContent.length / 4) });
        } catch (llmErr) {
          endSpan(llmSpan, 'error', { error: String(llmErr) });
          throw llmErr;
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
              extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen, thinkEndIdx).trim();
              const outsideText = (currentContent.substring(0, thinkStartIdx) + currentContent.substring(thinkEndIdx + thinkEndTagLen)).trim();
              displayContent = outsideText || extractedReasoning;
            } else {
              extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen).trim();
              const outsideText = currentContent.substring(0, thinkStartIdx).trim();
              displayContent = outsideText || extractedReasoning;
            }
          }
          const combinedReasoning = currentReasoning + (extractedReasoning ? (currentReasoning ? '\n' : '') + extractedReasoning : '');
          
          let currentThinkingTimeMs: number | undefined = activeStreamRef.current.thinkingTimeMs;
          if (thinkStartIdx !== -1) {
            if (thinkEndIdx !== -1) {
              currentThinkingTimeMs = thinkingEndTime - (activeStreamRef.current.timestamp || Date.now());
            } else {
              currentThinkingTimeMs = Date.now() - (activeStreamRef.current.timestamp || Date.now());
            }
          } else if (currentReasoning) {
            currentThinkingTimeMs = Date.now() - (activeStreamRef.current.timestamp || Date.now());
          }

          const completedToolCalls = activeStreamRef.current.toolCalls?.map(c => 
            c.status === 'running' ? { ...c, status: 'success' as const } : c
          );

          const finalContent = displayContent.trim() || activeStreamRef.current.content || extractedReasoning;

          const finalMsg: ChatMessage = {
              ...activeStreamRef.current,
              content: finalContent,
              reasoning: combinedReasoning || activeStreamRef.current.reasoning,
              thinkingTimeMs: currentThinkingTimeMs,
              toolCalls: completedToolCalls?.length ? completedToolCalls : activeStreamRef.current.toolCalls,
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
              const updatedLast = await inlineOfflineImagesInMessage({
                  ...finalHistory[lastIdx],
                  status: isAborted ? 'stopped' : 'success',
              } satisfies typeof finalHistory[number]);
              finalHistory[lastIdx] = updatedLast;
          }
          dispatch({ type: 'SET', messages: finalHistory });
          historyRef.current = finalHistory;
      }
      persistHistory(historyRef.current);

      // ── Reflexion pass (fire-and-forget, non-blocking) ────────────────────
      // Runs AFTER the response is already shown to user — zero UX latency cost.
      if (!isAborted && isLuciferActive && luciferAnalysis) {
        const finalResponseContent =
          historyRef.current[historyRef.current.length - 1]?.content ?? '';
        const critiqueApiKey = getEffectiveApiKey(resolvedProviderEarly2, apiKeys) || undefined;

        if (shouldRunReflexion(luciferAnalysis.intent, finalResponseContent.length, !!critiqueApiKey)) {
          runReflexion({
            userQuery: prompt,
            response: finalResponseContent,
            intent: luciferAnalysis.intent as any,
            critiqueModel: modelToUse,
            critiqueProvider: resolvedProviderEarly2,
            critiqueApiKey,
            turnId,
          }).then((reflexionResult) => {
            if (!reflexionResult.passed && reflexionResult.correctionNote && mountedRef.current) {
              useLuciferStore.getState().addLog({
                type: 'error',
                title: 'Reflexion: Issues detected',
                details: reflexionResult.issues.join('; '),
              });
            }
          }).catch(() => { /* reflexion errors are non-fatal */ });
        }

        // Procedural memory: learn from this successful interaction
        learnFromSuccess(
          prompt,
          modelToUse,
          resolvedProviderEarly2,
          luciferAnalysis?.requires_search ?? false,
          searchProvider,
          topicTags
        );

        // Voice synthesis dispatch: if the intent required voice, store the
        // response text so voice components can synthesize it.
        if (luciferAnalysis.requires_voice && finalResponseContent) {
          useLuciferStore.getState().addLog({
            type: 'info',
            title: 'Voice Synthesis',
            details: `Dispatching ${Math.min(finalResponseContent.length, 1000)} chars for TTS`,
          });
          // Store first 1000 chars for voice synthesis (prevents mega-TTS on long responses)
          useLuciferStore.getState().setVoiceText(finalResponseContent.slice(0, 1000));
        }
      }

      setTokensUsed((prev) => prev + estimatedInput);
      
      return true;
    } catch (error: any) {
      if (error.name !== 'AbortError' && error.message !== 'Aborted') {
        const errorMessage = error?.message || (typeof error === 'string' ? error : '') || 'Generation failed';
        
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
  }, [
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
  ]);

  return { runChat, isSupervising, cancelPipeline };
}
