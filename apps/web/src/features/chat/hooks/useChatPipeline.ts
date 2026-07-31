import { useRef, useState, useCallback, useEffect } from 'react';
import { invoke, Channel, convertFileSrc } from '@tauri-apps/api/core';
import { emit } from '@tauri-apps/api/event';
import { toast } from '@src/shared/components/ui/sonner';
import { ChatMessage } from '@nyx/shared';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useModelStore } from '@src/core/stores/useModelStore';
import { useUsageStore } from '@src/core/stores/useUsageStore';
import { detectProvider, getEffectiveApiKey, getModelCapabilities, isReasoningModel } from '@src/infrastructure/utils/provider';
import { estimateContextTokens, compactHistoryAsync } from '@src/infrastructure/utils/compaction';
import { buildChatPrompts, ChatContext } from '@src/core/prompts/chatPrompts';
import { useLuciferStore } from '@src/features/agents/lucifer/useLuciferStore';
import { luciferAgentService } from '@src/features/agents/lucifer/luciferAgent.service';
import { AIService } from '@src/features/ai/services/ai.service';
import { StreamFluffFilter } from '../utils/streamFilter';

// ── Module-level helpers ──────────────────────────────────────────────────────

function resolveSupportsVision(modelId: string, modelState: any): boolean {
  let hasVision = getModelCapabilities(modelId).supportsVision;
  const localModelDef = modelState.localLibraryModels?.find((m: any) => m.id === modelId);
  if (localModelDef && localModelDef.capabilities?.vision !== undefined) {
    hasVision = localModelDef.capabilities.vision;
  }
  return hasVision;
}

export interface ChatImage {
  name: string;
  mimeType: string;
  data: string;
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

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const cancelPipeline = useCallback(() => {
    abortCtrlRef.current?.abort();
  }, []);

  const runChat = useCallback(async (
    prompt: string, 
    images?: ChatImage[], 
    options?: { skipUserMessage?: boolean; modelOverride?: string }
  ): Promise<boolean> => {
    const now = Date.now();
    if (now - lastRunRef.current < 300) return false;
    lastRunRef.current = now;

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
    if (!modelToUse) {
      toast.error('Please select at least one model (Cloud or Local).');
      return false;
    }

    const resolvedProviderEarly = currentProvider || detectProvider(modelToUse);
    const isLocalModel = resolvedProviderEarly === 'nyx-native';
    
    // dynamically size effectiveMaxCtx
    let effectiveMaxCtx = maxContextTokens;
    if (isLocalModel && modelSettings?.contextSize && modelSettings.contextSize > 0) {
        effectiveMaxCtx = modelSettings.contextSize;
    }

    let llmHistory = historyRef.current;
    if (projectedTotal > effectiveMaxCtx) {
      toast.info('Compacting context to fit token limit...');
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
      if (images && images.length > 0 && !supportsVision) {
        toast.error('The selected model does not support vision/images.');
        return false;
      }

      let finalPrompt = prompt;
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

      if (isExplicitImageCmd || isNaturalImageIntent || isImageModelActive) {
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

        // If an image model is active, return early — no text completion backend is running
        if (isImageModelActive) {
          setTokensUsed((prev) => prev + estimatedInput);
          return true;
        }

        // For natural intent on a text model, continue to LLM with contextualized prompt
        finalPrompt = `The user requested image generation for "${imagePrompt}". The image asset has been generated and displayed above. Provide your creative breakdown, color palette details, and SVG representation.`;
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

      const assistantMsg: ChatMessage = {
        id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
        role: 'assistant',
        content: '',
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

      // Anchored greeting detection — mirrors GREETING_REGEX in lucifer.rs.
      // Uses end anchor $ so "hi search for X" is NOT treated as a greeting.
      const isGreeting = prompt.trim().length <= 30 &&
        /^(hi|hello|hey|greetings|good\s+(?:morning|afternoon|evening|day)|yo|sup|ping|test|howdy|what's\s+up|whats\s+up|hiya)(?:[\s!.,?]+(?:lucifer|nyx|there|bot|assistant))?[\s!.,?]*$/i.test(prompt.trim());

      // Focused search intent pattern — only explicit web commands and real-time data queries.
      // Removed 150+ generic words (find, table, result, vs, what is, how to) that caused
      // false web search triggers for coding, math, and logic questions.
      const searchIntentPattern = /^(?:\/search|\/web|search:|google:|lookup:|web:)\s*|\b(?:search\s+(?:the\s+)?web|search\s+online|google\s+for|look\s*up\s+online|browse\s+the\s+web)\b|\b(?:latest|current|today's|breaking|live|real-time)\s+(?:news|weather|score|scores|stock|stocks|price|prices|market|release|version|fixtures|standings)\b|\b(?:what\s+is\s+the\s+latest|what\s+happened\s+today|who\s+won\s+today|breaking\s+news|trending\s+now)\b/i;
      const shouldSearch = (webSearchEnabled || searchIntentPattern.test(prompt)) && !prompt.startsWith('/deep') && !isGreeting;

      if (shouldSearch) {
        const apiKey = searchProvider === 'tavily' ? getEffectiveApiKey('tavily', apiKeys) : undefined;
        try {
          if (activeStreamRef.current) {
            const updated = {
              ...activeStreamRef.current,
              reasoning: '> Searching the web for relevant information...\n'
            };
            activeStreamRef.current = updated;
            setActiveStreamMessage(updated);
          }

          toast.info(`Searching web via ${searchProvider}...`);
          const searchSignal = abortCtrlRef.current?.signal;
          let searchAbortCleanup: (() => void) | undefined;
          const searchAbortPromise = new Promise<never>((_, reject) => {
            if (searchSignal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
            const handler = () => reject(new DOMException('Aborted', 'AbortError'));
            searchSignal?.addEventListener('abort', handler);
            searchAbortCleanup = () => searchSignal?.removeEventListener('abort', handler);
          });
          try {
            searchResult = await Promise.race([
              invoke<string>('search_web_command', {
                query: prompt,
                numResults: 5,
                provider: searchProvider,
                apiKey: apiKey
              }),
              searchAbortPromise,
            ]);
          } finally {
            searchAbortCleanup?.();
          }

          if (abortCtrlRef.current?.signal.aborted) {
            throw new DOMException('Aborted', 'AbortError');
          }

          if (activeStreamRef.current) {
            const updated = {
              ...activeStreamRef.current,
              reasoning: (activeStreamRef.current.reasoning || '') + '> Processing search results and sending to model...\n'
            };
            activeStreamRef.current = updated;
            setActiveStreamMessage(updated);
          }

          if (searchResult) {
            finalPrompt = `[LIVE WEB SEARCH RESULTS - CURRENT INFORMATION]
${searchResult}
[END LIVE WEB SEARCH RESULTS]

User Question: ${prompt}

Instruction: Use the live web search results above to answer the user's question directly, accurately, and with precise details. Do not state that you lack real-time access.`;
          }
        } catch (e: any) {
          if (e.name === 'AbortError' || e.message === 'Aborted') {
            throw e;
          }
          const msg = e?.message || String(e);
          console.error('[web search] failed:', e);
          toast.error(`Web search failed: ${msg}`);
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
      
      const isReasoning = isReasoningModel(modelToUse);
      const resolvedProviderEarly2 = currentProvider || detectProvider(modelToUse);
      const isAgenticIntent = 
        executionMode === 'coder' || 
        executionMode === ('lucifer' as any) || 
        /search|find|latest|news|remember|memory|generate image|draw|picture|speak|voice|create file|write file|build|fix|run|tool|agent/i.test(finalPrompt);

      const isLuciferActive = useLuciferStore.getState().isLuciferActive || isAgenticIntent;

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
      
      // Pass finalPrompt (which contains [RESEARCH] web search results when Web Search is enabled)
      const promptResult = buildChatPrompts(modelToUse, chatContext, finalPrompt, llmHistory, undefined);

      let currentContent = '';
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

              if (!isModelReasoningType) {
                // Non-reasoning model outputted <think> tags — strip the tags, keep inner text as response content, do NOT treat as reasoning
                displayContent = outsideText ? `${outsideText}\n${innerText}` : innerText;
                extractedReasoning = '';
              } else if (!outsideText && innerText) {
                // Safety net: Reasoning model outputted 100% of text inside <think> — fall back to innerText so message is not empty
                displayContent = innerText;
                extractedReasoning = '';
              } else {
                displayContent = outsideText;
                extractedReasoning = innerText;
              }
            }

            if (now - lastUpdateTime > THROTTLE_MS) {
              lastUpdateTime = now;
              const combinedReasoning = isModelReasoningType
                ? currentReasoning + (extractedReasoning ? (currentReasoning ? '\n' : '') + extractedReasoning : '')
                : undefined;
              
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
              
              THROTTLE_MS = Math.min(50 + Math.floor(currentContent.length / 1000) * 15, 200);
            }
          } else if (eventType === 'tool_call') {
            const newCall = {
              id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15),
              type: 'function' as const,
              function: { name: message.tool_name, arguments: message.tool_args },
              status: 'running' as const,
            };
            const updatedMsg = {
                ...activeStreamRef.current,
                toolCalls: [...(activeStreamRef.current.toolCalls || []), newCall]
            };
            activeStreamRef.current = updatedMsg;
            setActiveStreamMessage(updatedMsg);
          } else if (eventType === 'tool_result') {
            if (activeStreamRef.current.toolCalls) {
                const calls = [...activeStreamRef.current.toolCalls];
                const lastCallIdx = calls.length - 1;
                if (lastCallIdx >= 0 && calls[lastCallIdx].function.name === message.tool_name) {
                  calls[lastCallIdx] = { ...calls[lastCallIdx], status: 'success' as const, result: message.result };
                  const updatedMsg = { ...activeStreamRef.current, toolCalls: calls };
                  activeStreamRef.current = updatedMsg;
                  setActiveStreamMessage(updatedMsg);
                }
            }
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
               const updatedMsg = { ...activeStreamRef.current, content: currentContent.trim() };
               activeStreamRef.current = updatedMsg;
               setActiveStreamMessage(updatedMsg);
             }
          } else if (eventType === 'error') {
            toast.error(message.error || message.content || 'Generation error');
          }
        }
      };

      const onAbort = () => {
        emit(`cancel_${eventName}`);
      };
      const currentSignal = abortCtrlRef.current?.signal;
      currentSignal?.addEventListener('abort', onAbort);

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
              ? finalPrompt
              : m.content;
              
            let content: any = textContent;
            const msgSupportsVision = resolveSupportsVision(modelToUse, modelState);

            if (m.images && m.images.length > 0 && msgSupportsVision) {
              content = [
                { type: 'text', text: textContent },
                ...m.images.map(img => ({
                  type: 'image_url',
                  image_url: {
                    url: img.data?.startsWith('data:') ? img.data : `data:${img.mimeType};base64,${img.data}`
                  }
                }))
              ];
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
            const analysis = await luciferAgentService.analyzeTurn(backendMessages, resolvedProvider);
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
        
        let dynamicMaxTokens = maxContextTokens - finalTotalInputTokens - 500;
        if (dynamicMaxTokens < 512) {
           dynamicMaxTokens = 512;
        }
        
        const userMaxTokens = modelSettings?.maxTokens && modelSettings.maxTokens > 0 ? modelSettings.maxTokens : undefined;
        const finalMaxTokens = userMaxTokens ?? (isLocalModel ? Math.max(dynamicMaxTokens, 16384) : dynamicMaxTokens);

        const sharedReq = {
          provider: resolvedProvider,
          model_id: modelToUse,
          api_key: getEffectiveApiKey(resolvedProvider, apiKeys) || '',
          messages: backendMessages,
          temperature: modelSettings?.temperature ?? 0.7,
          top_p: modelSettings?.topP ?? 0.95,
          top_k: modelSettings?.topK ?? 40,
          repeat_penalty: modelSettings?.repeatPenalty ?? 1.1,
          system_instruction: finalSystemInstruction,
          event_name: eventName,
          max_tokens: finalMaxTokens,
          execution_mode: executionMode,
          reasoning_enabled: isReasoningModel(modelToUse),
          context_window: modelSettings?.contextSize && modelSettings.contextSize > 0 ? modelSettings.contextSize : (maxContextTokens > 0 ? maxContextTokens : 32768),
        };

        if (isLuciferActive) {
          await invoke('run_lucifer_turn', {
            request: sharedReq,
            onEvent: onProgress,
          });
        } else if ((executionMode as any) === 'coder') {
          await invoke('run_orchestrator_turn', {
            request: sharedReq,
            onEvent: onProgress,
          });
        } else {
          if (sharedReq.provider === 'nyx-native') {
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
              displayContent = currentContent.substring(0, thinkStartIdx) + currentContent.substring(thinkEndIdx + thinkEndTagLen);
            } else {
              extractedReasoning = currentContent.substring(thinkStartIdx + thinkTagLen).trim();
              displayContent = currentContent.substring(0, thinkStartIdx);
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

          const finalMsg: ChatMessage = {
              ...activeStreamRef.current,
              content: displayContent.trim() || activeStreamRef.current.content,
              reasoning: combinedReasoning || activeStreamRef.current.reasoning,
              thinkingTimeMs: currentThinkingTimeMs,
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
