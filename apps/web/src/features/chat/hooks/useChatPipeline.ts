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
import { getTopicMedia, generateVisualAsset, fetchImageAsBase64 } from '../../../core/services/mediaEngine';



// ── Module-level helpers ──────────────────────────────────────────────────────

function resolveSupportsVision(modelId: string, modelState: any): boolean {
  let hasVision = getModelCapabilities(modelId).supportsVision;
  const localModelDef = modelState.localLibraryModels?.find((m: any) => m.id === modelId);
  if (localModelDef && localModelDef.capabilities?.vision !== undefined) {
    hasVision = localModelDef.capabilities.vision;
  }
  return hasVision;
}

/**
 * Cleans raw headings or query strings into pure subject descriptions by removing:
 * - Leading numbers / bullets ("1.", "Step 2:", "###", "5. ")
 * - Dates / version tags ("(2020–2022)", "v1.4")
 * - Meta words ("overview", "illustration", "diagram", "real world application", "subtopic")
 */
function cleanSubjectString(raw: string): string {
  if (!raw) return '';
  const cleaned = raw
    .replace(/^(?:#+|\d+[\.\)]|\bstep\s*\d+:?|\bsection\s*\d+:?|\bpart\s*\d+:?)\s*/gi, '')
    .replace(/\(\d{4}(?:[–-]\d{4}|\s*to\s*\d{4})?\)/g, '')
    .replace(/\b(?:overview|illustration|diagram|real\s*world\s*application|subtopic|section|chapter|era)\b/gi, '')
    .replace(/[*_`~[\]]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || raw.trim();
}

/**
 * Transforms a section heading or topic into a stunning FLUX image prompt tailored by domain.
 */
function buildIllustrationPrompt(rawSubject: string): string {
  const subject = cleanSubjectString(rawSubject);
  const lower = subject.toLowerCase();

  const isConsumerTech = /\b(iphone|ipad|macbook|apple|samsung|galaxy|android|smartphone|laptop|headset|vision pro|pixel|gadget|hardware|device)\b/.test(lower);
  const isTechConcept = /\b(quantum|computing|algorithm|neural|ai|machine learning|code|software|processor|chip|network|protocol|data|database|cloud|server|blockchain|crypto|robot|automation|cybersecurity|physics|chemistry|biology|dna|molecule|atom|electron|particle)\b/.test(lower);
  const isHistory = /\b(history|historical|ancient|war|revolution|empire|medieval|renaissance|civilization|myth|legend|archaeology|historical)\b/.test(lower);
  const isNature = /\b(climate|ocean|space|galaxy|planet|animal|wildlife|forest|ecosystem|biodiversity|geology|astronomy|star|nebula|cosmos)\b/.test(lower);
  const isBusiness = /\b(finance|economy|market|startup|management|strategy|supply chain|manufacturing|logistics|stock|trading)\b/.test(lower);

  if (isConsumerTech) {
    return `Sleek studio product photography of ${subject}, dark background, studio softbox lighting, 8k resolution, crisp detail, photorealistic, cinematic shot`;
  }
  if (isTechConcept) {
    return `Futuristic 3D render illustration of ${subject}, glowing neon cyan and purple data accents, clean dark background, detailed digital visualization, 8k resolution, octane render`;
  }
  if (isHistory) {
    return `Epic cinematic historical painting of ${subject}, dramatic atmospheric lighting, rich textures, detailed artwork, 8k resolution, masterpiece`;
  }
  if (isNature) {
    return `Breathtaking National Geographic style photograph of ${subject}, vibrant rich color palette, ultra-high detail, 8k resolution, studio lighting`;
  }
  if (isBusiness) {
    return `Modern 3D isometric infographic visual representation of ${subject}, sleek dark mode aesthetic, elegant lighting, professional data artwork, 8k resolution`;
  }

  return `High-end 3D visual illustration of ${subject}, sleek modern aesthetic, studio lighting, clean dark background, 8k resolution, photorealistic detail`;
}

/**
 * Build Pollinations AI image URLs for a query and its predicted subtopics.
 * Synchronous — constructs deterministic FLUX prompts, no HTTP request needed.
 * The browser fetches each image on demand when the markdown renderer hits the URL.
 */
function buildVisionImageUrls(query: string): Array<{ url: string; label: string }> {
  const clean = cleanSubjectString(query);
  if (!clean) return [];

  const lq = clean.toLowerCase();
  const subtopicLabels: string[] = [];

  // Generate 3 meaningful subtopics with domain-specific visual focus
  if (/\b(iphone|smartphone|apple)\b/.test(lq)) {
    subtopicLabels.push(`${clean} iconic product design`, `${clean} display and camera hardware`, `${clean} wireless ecosystem and accessories`);
  } else if (/\b(quantum|physics|particle|relativity)\b/.test(lq)) {
    subtopicLabels.push(`${clean} quantum mechanics state`, `${clean} particle wave superposition`, `${clean} hardware and qubits`);
  } else if (/\b(ai|artificial intelligence|machine learning|neural|deep learning)\b/.test(lq)) {
    subtopicLabels.push(`${clean} neural network architecture`, `${clean} model data processing`, `${clean} AI chip hardware`);
  } else if (/\b(space|astronomy|galaxy|planet|cosmos|nasa)\b/.test(lq)) {
    subtopicLabels.push(`${clean} celestial body view`, `${clean} planetary system details`, `${clean} telescope deep space capture`);
  } else if (/\b(biology|dna|gene|cell|evolution|organism)\b/.test(lq)) {
    subtopicLabels.push(`${clean} molecular DNA structure`, `${clean} microscopic cell details`, `${clean} biological ecosystem`);
  } else if (/\b(history|war|ancient|civilization|empire)\b/.test(lq)) {
    subtopicLabels.push(`${clean} historical event scene`, `${clean} ancient artifacts and architecture`, `${clean} key historical moment`);
  } else if (/\b(economy|finance|market|stock|business)\b/.test(lq)) {
    subtopicLabels.push(`${clean} market trend analysis`, `${clean} strategic business framework`, `${clean} global financial ecosystem`);
  } else {
    subtopicLabels.push(`${clean} core concept breakdown`, `${clean} key architectural components`, `${clean} practical application`);
  }

  const topics = [clean, ...subtopicLabels.slice(0, 3)];

  return topics.map((label) => {
    const prompt = buildIllustrationPrompt(label);
    const seed = label.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000000;
    const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=800&height=450&nologo=true&seed=${seed}&model=flux`;
    return { url, label };
  });
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

/**
 * Searches real image libraries (Openverse, Wikimedia Commons, Pexels, Pixabay, DuckDuckGo) via Rust proxy.
 * Returns real photos, historical pictures, scientific diagrams, and stock assets.
 */
async function fetchRealLibraryImages(query: string, limit: number = 10): Promise<RealLibraryImage[]> {
  const cleaned = cleanSubjectString(query);
  if (!cleaned || cleaned.length < 2) return [];

  try {
    const rawJson = await invoke<string>('search_images_command', { query: cleaned, limit });
    if (!rawJson) return [];
    const parsed = JSON.parse(rawJson);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item: any) => item && typeof item.url === 'string' && item.url.startsWith('http'))
        .map((item: any) => ({
          url: item.url,
          title: item.title || cleaned,
          source: item.source || 'image-library',
        }));
    }
  } catch (err) {
    console.warn('[useChatPipeline] Real library image search error:', err);
  }
  return [];
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

    const modelToUse = options?.modelOverride || ((cloudModelId || localModelId) as string);

    // 1. Intercept No Model Selected
    if (!modelToUse) {
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
      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        role: 'assistant',
        content: '🤖 **No Model Selected**: Please select a model in the model selector to start chatting.\n\n**How to choose:**\n- Select a **Cloud Model** (Gemini, OpenRouter) and enter your API key in Settings.\n- Or select a **Local Model** (GGUF) to run fully on-device without an API key.',
        timestamp: Date.now(),
        status: 'success',
      };
      dispatch({ type: 'APPEND', message: assistantMsg });
      historyRef.current = [...historyRef.current, assistantMsg];
      persistHistory(historyRef.current);
      return true;
    }

    const resolvedProviderEarly = currentProvider || detectProvider(modelToUse);
    const isLocalModel = resolvedProviderEarly === 'nyx-native';
    const isCloud = ['gemini', 'openrouter'].includes(resolvedProviderEarly);

    // 2. Intercept Missing API Keys for Paid Cloud Models (Bypass for OpenRouter Free models)
    const isOpenRouterFreeModel = resolvedProviderEarly === 'openrouter' && (
      modelToUse.endsWith(':free') || 
      modelToUse === 'openrouter/auto' || 
      modelToUse.includes('free')
    );

    if (isCloud && !isOpenRouterFreeModel) {
      const apiKey = getEffectiveApiKey(resolvedProviderEarly, apiKeys);
      if (!apiKey || apiKey.trim() === '' || apiKey === 'free') {
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
        const providerDisplayName =
          resolvedProviderEarly === 'gemini' ? 'Gemini'
          : resolvedProviderEarly === 'openrouter' ? 'OpenRouter'
          : resolvedProviderEarly.charAt(0).toUpperCase() + resolvedProviderEarly.slice(1);

        const assistantMsg: ChatMessage = {
          id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
          role: 'assistant',
          content: `🔑 **${providerDisplayName} API Key Missing**: ${providerDisplayName} API key has not been given. Give the API key in the settings to start chatting or use local models.`,
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


    // 3. Intercept Unloaded Local Models & Auto-load downloaded models
    if (isLocalModel && !isModelLoaded(modelToUse, modelState.loadedLocalModel)) {
      const isDownloaded = modelState.localLibraryModels?.some((m: any) => m.id === modelToUse);
      
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
      toast.warning('Context window limit reached. Please increase the context length in model settings to generate the full response.');
      llmHistory = await compactHistoryAsync(historyRef.current, effectiveMaxCtx - estimatedInput - 4096, AIService, modelSettings);
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
      const lowerPrompt = prompt.toLowerCase().trim();
      const isExplicitImageCmd = lowerPrompt.startsWith('/image ');
      const isNaturalImageIntent =
        /^(create|generate|draw|make|design|render|paint)\s+(an?|a|the|some)?\s*(image|logo|picture|photo|illustration|artwork|banner|drawing|graphic|poster|avatar)\b/i.test(lowerPrompt) ||
        /\b(generate|create|draw|make)\s+an?\s+nyx\s+logo\b/i.test(lowerPrompt);

      // If the currently loaded local model is an image generation model, treat ANY prompt as image request.
      // Uses the pre-computed isActiveModelImageGen flag set by useModelStore.setLoadedLocalModel.
      const isImageModelActive = modelState.isActiveModelImageGen ||
        // Belt-and-suspenders: keyword check on the raw loaded model ID
        (!!modelState.loadedLocalModel && [
          'text_encoder', 'text-encoder', 'vae', 'transformer',
          'flux', 'diffusion', 'stable', 'sdxl', 'sd3', 'sd1', 'sd2',
          'controlnet', 'lora', 'unet',
        ].some(kw => modelState.loadedLocalModel!.toLowerCase().includes(kw)));

      if (isExplicitImageCmd || isImageModelActive) {
        const imagePrompt = isExplicitImageCmd ? prompt.substring(7).trim() : prompt.trim();
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
            dispatch({ type: 'APPEND', message: assistMsg });
            historyRef.current = [...historyRef.current, assistMsg];
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
      // Lucifer is always active — there is no NYX/bare-stream fallback path.
      // Both local (nyx-native) and cloud models route through run_lucifer_turn.
      const isLuciferActive = true;

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

      // Inject hierarchical memory context into the prompt if not empty
      if (memoryResult.status === 'fulfilled' && memoryResult.value && !memoryResult.value.isEmpty) {
        finalPrompt = `${memoryResult.value.consolidatedBlock}\n\nUser: ${finalPrompt}`;
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

      // Focused search intent pattern — explicit web commands, research queries, real-time/factual data topics.
      const searchIntentPattern = /^(?:\/search|\/web|\/deep|search:|google:|lookup:|web:|research:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|look\s*up\s+online|browse\s+the\s+web|research\s+about|research\s+on|find\s+info|information\s+on)\b|\b(?:latest|current|today's|breaking|live|real-time|price|prices|cost|expenses|living\s+expenses|salary|fee|fees|stock|stocks|crypto|weather|score|scores|winner|results|version|release|fixtures|standings|university|college|student|living\s+in)\b|\b(?:what\s+is|what\s+are|how\s+much|who\s+is|where\s+is|tell\s+me\s+about|give\s+me\s+information|research)\b/i;
      const cleanSearchQuery = sanitizeSearchQuery(searchQuery);

      const isDeepResearch =
        prompt.startsWith('/deep') ||
        /^(?:deep research\b|\/deep|deep:)/i.test(prompt.trim()) ||
        /\b(?:deep research|exhaustive research|deep dive|full analysis)\b/i.test(prompt);

      const isResearch =
        !isDeepResearch &&
        (prompt.startsWith('/research') ||
          /\b(?:research|compare|list every|best laptops|top laptops|reviews|laptops under|best laptop)\b/i.test(prompt));

      const isStandardWebSearch =
        !isDeepResearch &&
        !isResearch &&
        (liveWebSearchEnabled || searchIntentPattern.test(searchQuery) || luciferAnalysis?.requires_search === true);

      const shouldSearch = isDeepResearch || isResearch || isStandardWebSearch;

      if (shouldSearch) {
        const tavilyKey = searchProvider === 'tavily' ? getEffectiveApiKey('tavily', apiKeys) : undefined;
        let totalResultsCount = 0;
        let subQueriesCount = 1;
        // Collected citations from all search modes — populated below and merged into finalMsg
        let collectedCitations: Array<{ id: string; index: number; title: string; url: string; snippet: string; domain?: string }> = [];

        try {
          // Fast-path: Microsecond in-memory prompt response cache lookup (<0.01ms)
          const cachedPromptResult = await invoke<string | null>('check_prompt_cache_command', { prompt: cleanSearchQuery }).catch(() => null);
          if (cachedPromptResult) {
            searchResult = cachedPromptResult;
            toast.success('⚡ Microsecond search cache hit (<0.01ms)');
          } else {
            if (activeStreamRef.current) {
              const reasoningText = isDeepResearch
                ? '> 🧬 Autonomous Deep Research Engine Active... Running multi-hop gap-fill matrix & scraping 25+ web sources...\n'
                : isResearch
                ? '> 🔬 Multi-Source Synthesis Research Active... Querying 20+ web sources & extracting article bodies...\n'
                : '> 🌐 Web Search Active... Querying live search index...\n';
              const updated = {
                ...activeStreamRef.current,
                reasoning: reasoningText
              };
              activeStreamRef.current = updated;
              setActiveStreamMessage(updated);
            }

            if (isDeepResearch) {
              // ── DEEP RESEARCH MODE: Multi-Hop Graph + 25+ Pages Scraped + 5-Angle Gap Matrix ──
              const appendResearchProgress = (msg: string) => {
                if (activeStreamRef.current) {
                  const updated = {
                    ...activeStreamRef.current,
                    reasoning: (activeStreamRef.current.reasoning || '') + `> ${msg}\n`
                  };
                  activeStreamRef.current = updated;
                  setActiveStreamMessage(updated);
                }
              };

              const deepResult = await executeDeepResearch(cleanSearchQuery, {
                provider: searchProvider as any,
                tavilyApiKey: tavilyKey,
                maxPages: 25,
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
                toast.success(`Deep Research Complete: ${totalResultsCount} web sources scraped (${deepResult.reflectionHops} hops)`);
              } else {
                toast.warning('No deep research results found.');
              }
            } else if (isResearch) {
              // ── RESEARCH MODE: Multi-Query Sub-Decomposition + Scraped Article Bodies (20+ Sources) ──
              const ragResult = await agenticSearch(cleanSearchQuery, {
                provider: searchProvider as any,
                tavilyApiKey: tavilyKey,
                maxSubQueries: 5,
                resultsPerQuery: 8,
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
                // Build citations from AgenticRAG results (deduplicated by URL)
                const seen = new Set<string>();
                ragResult.results.forEach((r, i) => {
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

                // Extract specific product entities from research results and fetch targeted images for each entity
                try {
                  const extractedProducts: string[] = [];
                  const productRegex = /\b(?:MacBook\s+(?:Air|Pro)(?:\s+M\d+)?|ASUS\s+ZenBook[^\n,]*|Dell\s+XPS[^\n,]*|Lenovo\s+ThinkPad[^\n,]*|Samsung\s+Galaxy\s+Book[^\n,]*|HP\s+Spectre[^\n,]*|Microsoft\s+Surface[^\n,]*|Acer\s+Swift[^\n,]*)\b/gi;
                  
                  ragResult.results.forEach((r) => {
                    const text = (r.title + ' ' + r.snippet).slice(0, 1000);
                    let m;
                    while ((m = productRegex.exec(text)) !== null) {
                      const cleanName = m[0].trim();
                      if (cleanName.length > 5 && !extractedProducts.some(p => p.toLowerCase().includes(cleanName.toLowerCase()))) {
                        extractedProducts.push(cleanName);
                      }
                    }
                  });

                  const imageQueries = extractedProducts.length >= 2 
                    ? extractedProducts.slice(0, 5) 
                    : [cleanSearchQuery, `${cleanSearchQuery} product`, `${cleanSearchQuery} laptop`].slice(0, 4);

                  const imagePromises = imageQueries.map((q) =>
                    invoke<string>('search_images_command', { query: q, limit: 1 })
                      .then((jsonStr) => {
                        const parsed = JSON.parse(jsonStr || '[]');
                        return Array.isArray(parsed) && parsed.length > 0 ? { entity: q, img: parsed[0] } : null;
                      })
                      .catch(() => null)
                  );

                  const fetchedEntities = (await Promise.all(imagePromises)).filter(Boolean) as Array<{ entity: string; img: any }>;

                  // Attach entity images directly to the assistant message gallery
                  // rather than injecting prompt directives.
                  if (fetchedEntities.length > 0) {
                    const entityImages = fetchedEntities
                      .filter((e) => e.img?.url)
                      .map((e) => ({
                        url: e.img.url as string,
                        name: (e.img.title || e.entity) as string,
                        aspectRatio: '16:9' as const,
                        engine: 'Entity Search' as string,
                      }));
                    assistantMsg.images = [...(assistantMsg.images || []), ...entityImages];
                  }
                } catch (err) {
                  console.warn('[useChatPipeline] Entity image fetch failed:', err);
                }

                toast.success(`Research Synthesis Complete: ${totalResultsCount} web sources across ${subQueriesCount} queries`);
              } else {
                toast.warning('No research results found.');
              }
            } else {
              // ── WEB SEARCH MODE: Ultra-Fast Direct Millisecond Web Search ──
              const searchPromise = invoke<string>('search_web_command', {
                query: cleanSearchQuery,
                numResults: 6,
                searchProvider: searchProvider === 'tavily' ? 'tavily' : 'duckduckgo',
                apiKey: tavilyKey,
              }).catch(() => '');
              const searchTimeout = new Promise<string>((res) => setTimeout(() => res(''), 2500));
              const combinedRawSearch = await Promise.race([searchPromise, searchTimeout]);

              if (combinedRawSearch && combinedRawSearch.trim().length > 0) {
                searchResult = combinedRawSearch;
                totalResultsCount = 6;
                subQueriesCount = 1;

                // Extract URL + title citations from raw search result text
                const urlPattern = /(?:^|\n)URL:\s*(https?:\/\/[^\s\n]+)/gm;
                const titlePattern = /(?:^|\n)Title:\s*([^\n]+)/gm;
                const snippetPattern = /(?:^|\n)(?:Snippet|Summary|Description):\s*([^\n]+)/gm;
                const urls: string[] = [];
                const titles: string[] = [];
                const snippets: string[] = [];
                let m: RegExpExecArray | null;
                while ((m = urlPattern.exec(combinedRawSearch)) !== null) urls.push(m[1].trim());
                while ((m = titlePattern.exec(combinedRawSearch)) !== null) titles.push(m[1].trim());
                while ((m = snippetPattern.exec(combinedRawSearch)) !== null) snippets.push(m[1].trim());
                const seen = new Set<string>();
                urls.forEach((url, i) => {
                  if (!seen.has(url)) {
                    seen.add(url);
                    try {
                      collectedCitations.push({
                        id: String(collectedCitations.length + 1),
                        index: collectedCitations.length + 1,
                        title: titles[i] || url,
                        url,
                        snippet: snippets[i]?.slice(0, 200) || '',
                        domain: new URL(url).hostname.replace('www.', ''),
                      });
                    } catch { /* skip invalid URLs */ }
                  }
                });
              }
            }


            // Fetch topic media for optional vision context injection into LLM
            const mediaAssets = await getTopicMedia(cleanSearchQuery).catch(() => null);
            const resolvedImageUrl = mediaAssets?.imageUrl;

            if (resolvedImageUrl) {
              // Vision inputs — top image sent as actual LLM vision content for cloud models.
              const supportsVisionForSearch = resolveSupportsVision(modelToUse, modelState);
              if (supportsVisionForSearch && !isLocalModel && llmHistory.length > 0) {
                let lastUserIdx = -1;
                for (let i = llmHistory.length - 1; i >= 0; i--) {
                  if (llmHistory[i].role === 'user') { lastUserIdx = i; break; }
                }
                if (lastUserIdx >= 0) {
                  const existing = llmHistory[lastUserIdx];
                  llmHistory[lastUserIdx] = {
                    ...existing,
                    images: [
                      ...(existing.images || []),
                      { name: cleanSearchQuery, url: resolvedImageUrl, mimeType: 'image/jpeg', data: '' },
                    ],
                  };
                }
              }
            }

            if (activeStreamRef.current && collectedCitations.length > 0) {
              const updated = {
                ...activeStreamRef.current,
                citations: collectedCitations,
              };
              activeStreamRef.current = updated;
              setActiveStreamMessage(updated);
            }



            if (searchResult) {
              invoke('save_prompt_cache_command', { prompt: cleanSearchQuery, response: searchResult }).catch(() => {});
            }
          }

          if (activeStreamRef.current) {
            const searchReasoningSnippet = searchResult
              ? `> 🌐 **Live Web Search (${searchProvider === 'tavily' ? 'Tavily' : 'DuckDuckGo'})**: Retrieved ${totalResultsCount} results across ${subQueriesCount} query path(s):\n${searchResult.split('\n').map(l => '> ' + l).slice(0, 15).join('\n')}\n\n`
              : '> 🌐 **Live Web Search**: No results found.\n\n';

            const updated = {
              ...activeStreamRef.current,
              reasoning: (activeStreamRef.current.reasoning || '') + searchReasoningSnippet
            };
            activeStreamRef.current = updated;
            setActiveStreamMessage(updated);
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || e.message === 'Aborted') {
            throw e;
          }
          const msg = e?.message || String(e);
          console.warn('[web search] AgenticRAG failed:', msg);
          toast.error(`Web search failed: ${msg}`);
        }
      }

      // ── IMAGE GENERATION DISPATCH: Handle /image commands or Lucifer intent ──
      const isImageCmdTrigger = /^(?:\/image|\/img|image:|draw:|generate\s+image:)\s*/i.test(prompt);
      const shouldGenerateImage = isImageCmdTrigger || (luciferAnalysis?.requires_image_gen && !isGreeting);

      if (shouldGenerateImage) {
        try {
          const rawImagePrompt = prompt.replace(/^(?:\/image|\/img|image:|draw:|generate\s+image:)\s*/i, '').trim() || cleanSearchQuery || prompt;
          
          let aspectRatio: '1:1' | '16:9' | '9:16' | '4:3' = '16:9';
          if (/\b(?:portrait|avatar|square|1:1)\b/i.test(rawImagePrompt)) aspectRatio = '1:1';
          else if (/\b(?:mobile|story|phone|9:16)\b/i.test(rawImagePrompt)) aspectRatio = '9:16';
          else if (/\b(?:diagram|infographic|4:3)\b/i.test(rawImagePrompt)) aspectRatio = '4:3';

          toast.info(`🎨 Generating visual asset (${aspectRatio})...`);
          const imgResult = await generateVisualAsset(rawImagePrompt, aspectRatio);
          if (imgResult && imgResult.success) {
            const newImageObj = {
              url: imgResult.imageUrl,
              name: rawImagePrompt,
              aspectRatio: imgResult.aspectRatio,
              engine: imgResult.engine,
            };
            assistantMsg.images = [...(assistantMsg.images || []), newImageObj];

            // Inject visual asset context into systemPromptAddon so the LLM model receives the generated image URL and embeds it in text
            const generatedAssetContext =
              `\n\n[GENERATED VISUAL ASSET ATTACHMENT]\n` +
              `Prompt: "${rawImagePrompt}"\n` +
              `Image URL: ${imgResult.imageUrl}\n` +
              `Engine: ${imgResult.engine}\n` +
              `Aspect Ratio: ${imgResult.aspectRatio}\n` +
              `INSTRUCTION: Acknowledge the generated image asset warmly and embed it directly at the top of your response text using: !["${rawImagePrompt}"](${imgResult.imageUrl})\n` +
              `[/GENERATED VISUAL ASSET ATTACHMENT]\n\n`;

            searchResult = (searchResult || '') + generatedAssetContext;


            if (activeStreamRef.current) {
              const updated = {
                ...activeStreamRef.current,
                images: assistantMsg.images,
              };
              activeStreamRef.current = updated;
              setActiveStreamMessage(updated);
            }
            toast.success(`Visual asset rendered via ${imgResult.engine}`);
          }
        } catch (imgErr) {
          console.warn('[ChatPipeline] Image generation failed:', imgErr);
        }
      }



      if (abortCtrlRef.current?.signal.aborted) {
        throw new DOMException('Aborted', 'AbortError');
      }

      if (prompt.startsWith('/deep')) {
        const queryText = prompt.replace('/deep', '').trim();
        
        // Use activeStreamMessage for consistent streaming UX (same as chat)
        assistantMsg.reasoning = '🔬 Initializing Deep Research...\n';
        setActiveStreamMessage(assistantMsg);
        activeStreamRef.current = assistantMsg;
        
        let currentContent = '';
        let reasoningContent = '🔬 Initializing Deep Research...\n';
        
        onProgress.onmessage = (message) => {
          if (!mountedRef.current) return;
          if (!activeStreamRef.current) return;
          // Drop stale events from a cancelled/previous stream.
          if (generationIdRef.current !== currentGenerationId) return;

          if (message.type === 'progress') {
              reasoningContent += `> ${message.message}\n`;
          } else if (message.type === 'result_chunk') {
              currentContent += message.content;
          } else if (message.type === 'error') {
              toast.error(message.message);
          }
          
          const updatedMsg = {
              ...activeStreamRef.current,
              content: currentContent || activeStreamRef.current.content,
              reasoning: reasoningContent,
          };
          activeStreamRef.current = updatedMsg;
          setActiveStreamMessage(updatedMsg);
        };
        
        try {
          setIsSupervising(true);
          const deepSignal = abortCtrlRef.current?.signal;
          let deepAbortCleanup: (() => void) | undefined;
          const deepAbortPromise = new Promise<never>((_, reject) => {
            if (deepSignal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
            const handler = () => reject(new DOMException('Aborted', 'AbortError'));
            deepSignal?.addEventListener('abort', handler);
            deepAbortCleanup = () => deepSignal?.removeEventListener('abort', handler);
          });
          let deepResult: { source: string; data: string; sources: Array<{ url: string; title: string; snippet: string }> };
          try {
            deepResult = await Promise.race([
              invoke<{ source: string; data: string; sources: Array<{ url: string; title: string; snippet: string }> }>('start_deep_research', { 
                  query: { 
                      prompt: queryText, 
                      depth_limit: 3, 
                      provider: detectProvider(modelToUse), 
                      model_id: modelToUse, 
                      api_key: getEffectiveApiKey(detectProvider(modelToUse), apiKeys) || '' 
                  }, 
                  onProgress
              }),
              deepAbortPromise,
            ]);
          } finally {
            deepAbortCleanup?.();
          }
          
          // Commit from activeStreamRef into history (same pattern as chat)
          if (activeStreamRef.current) {
            const citations = (deepResult.sources || []).map((src, i) => ({
              id: String(i + 1),
              index: i + 1,
              title: src.title,
              url: src.url,
              snippet: src.snippet,
            }));
            
            const finalMsg: ChatMessage = {
              ...activeStreamRef.current,
              content: currentContent || activeStreamRef.current.content,
              status: 'success',
              citations,
            };
            
            dispatch({ type: 'APPEND', message: finalMsg });
            historyRef.current = [...historyRef.current, finalMsg];
            activeStreamRef.current = null;
            setActiveStreamMessage(null);
            persistHistory(historyRef.current);
          }
        } catch (e: any) {
          toast.error(e.toString());
          if (activeStreamRef.current) {
            const finalMsg = {
              ...activeStreamRef.current,
              status: 'error' as const,
              content: (currentContent || activeStreamRef.current.content) + `\n\n**Deep Research Error**: ${e}`,
            };
            dispatch({ type: 'APPEND', message: finalMsg });
            historyRef.current = [...historyRef.current, finalMsg];
            activeStreamRef.current = null;
            setActiveStreamMessage(null);
            persistHistory(historyRef.current);
          }
        } finally {
          setIsSupervising(false);
          onProgress.onmessage = (): void => {};
        }
        return false;
      }

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
      


      // ── REAL IMAGE LIBRARY DATA: Fetch real photos/diagrams from Pexels, Pixabay, Openverse, Wikimedia ──────
      if (!isGreeting && !shouldGenerateImage && cleanSearchQuery.length > 2) {
        try {
          const realImages = await fetchRealLibraryImages(cleanSearchQuery, 10);
          if (realImages.length > 0) {
            // 1. Attach top 3 real images as vision inputs to vision models
            const supportsVisionNow = resolveSupportsVision(modelToUse, modelState);
            if (supportsVisionNow && !isLocalModel) {
              let lastUserIdx = -1;
              for (let i = llmHistory.length - 1; i >= 0; i--) {
                if (llmHistory[i].role === 'user') { lastUserIdx = i; break; }
              }
              if (lastUserIdx >= 0) {
                const existing = llmHistory[lastUserIdx];
                llmHistory[lastUserIdx] = {
                  ...existing,
                  images: [
                    ...(existing.images || []),
                    ...realImages.slice(0, 3).map(({ url, title }) => ({
                      name: title,
                      url,
                      mimeType: 'image/jpeg' as const,
                      data: '',
                    })),
                  ],
                };
              }
            }

            // 2. Add real image library dataset context for the LLM to select from
            const imageLibraryBlock = `

[VERIFIED REAL IMAGE LIBRARY DATASET FOR THIS TOPIC]
The following REAL stock photos, historical pictures, scientific diagrams, and topic media were retrieved from verified image libraries (Openverse, Wikimedia Commons, Pexels, Pixabay, DuckDuckGo):

${realImages.map((img, i) => `[Image ${i + 1}]
Title: "${img.title}"
Source: ${img.source}
URL: ${img.url}`).join('\n\n')}

MANDATORY INSTRUCTIONS FOR REAL IMAGE SELECTION & PLACEMENT:
1. Review the real images listed above. Select the most accurate real image representation for EACH major topic/subtopic section in your response.
2. Embed the selected real image IMMEDIATELY under its corresponding section heading using standard markdown image syntax:
   ![Descriptive Title](EXACT_URL)
3. Do NOT invent fake URLs or write placeholder text. ONLY use the verified real image URLs listed above.
4. Integrate each selected real image naturally into your explanation under each section heading.`;

            finalPrompt = finalPrompt + imageLibraryBlock;
          }
        } catch (err) {
          console.warn('[useChatPipeline] Error attaching real image library data:', err);
        }
      }

      // Pass searchResult separately so buildChatPrompts formats it into the [LIVE WEB SEARCH RESULTS] block
      const promptResult = buildChatPrompts(modelToUse, chatContext, finalPrompt, llmHistory, searchResult, resolvedProviderEarly2);

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
              resolvedProvider
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
        
        // Dynamic Max Tokens & High-Capacity Context Window for Local & Research Models
        let dynamicMaxTokens = maxContextTokens - finalTotalInputTokens - 500;
        if (dynamicMaxTokens < 1024) {
           dynamicMaxTokens = 1024;
        }
        
        const isFactualOrSearch = !!searchResult || liveWebSearchEnabled || /^(?:who|what|when|where|which|how|why|research|find|tell|explain|list|show|compare|get|cost|price|living)\b/i.test(prompt.trim());
        // Enable reasoning for reasoning models, research queries, and web search turns
        const shouldEnableReasoning = isReasoningModel(modelToUse) || isDeepResearch || isFactualOrSearch || isReasoning;

        // For research turns and local models, allocate high generation headroom (8,192–16,384 tokens)
        const researchMaxTokens = isDeepResearch ? 16384 : (isFactualOrSearch ? 8192 : 4096);
        const finalMaxTokens = Math.max(dynamicMaxTokens, researchMaxTokens);

        // High-Capacity Context Window: Default to 65,536 (floor 32,768) so local GGUF models have massive context headroom
        const effectiveContextWindow = Math.max(
          maxContextTokens > 0 ? maxContextTokens : 65536,
          isLocalModel ? 65536 : 32768
        );

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
          
          dispatch({ type: 'APPEND', message: finalMsg });
          historyRef.current = [...historyRef.current, finalMsg];
          activeStreamRef.current = null;
          setActiveStreamMessage(null);
      } else {
          const finalHistory = [...historyRef.current];
          const lastIdx = finalHistory.length - 1;
          if (lastIdx >= 0 && finalHistory[lastIdx]?.role === 'assistant') {
              finalHistory[lastIdx] = {
                  ...finalHistory[lastIdx],
                  status: isAborted ? 'stopped' : 'success',
              } satisfies typeof finalHistory[number];
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
          (useLuciferStore.getState() as any).setVoiceText?.(finalResponseContent.slice(0, 1000));
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
