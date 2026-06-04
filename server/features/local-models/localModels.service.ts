import logger from '../../lib/logger.ts';
import { LocalModelManager } from './localModelManager.ts';
import { LocalModelRunner } from './localModelRunner.ts';
import { ModelWarmCache } from './warmCache.ts';
import { CodebaseScanner } from '../workspace/codebaseScanner.ts';
import { RulesDb } from '../admin/admin.service.ts';
import { LOCAL_MODEL_PORT } from '../../../src/config/ports.ts';

function shouldTriggerWebSearch(query: string): boolean {
  const trimmed = query.trim();

  if (trimmed.includes('[WEB SEARCH RESULTS]')) {
    return false;
  }

  const GREETINGS =
    /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)\b/i;
  const IDENTITY =
    /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;

  if (GREETINGS.test(trimmed) || IDENTITY.test(trimmed)) {
    return false;
  }

  const lower = query.toLowerCase();

  const searchKeywords = [
    'latest',
    'recent',
    'current',
    'today',
    'news',
    'price',
    'weather',
    'documentation',
    'docs',
    'release',
    'version',
    'modern',
    'how to use',
    'api of',
    'npm',
    'pip',
    'github link',
    'url',
    'webpage',
    'scrape',
    'scrapling',
    'search',
    'google',
    'find out',
    'lookup',
    'what is the current',
    'current state',
    'qualifier',
    'qualifires',
    'ipl',
    'playoff',
    'final',
    'match',
    'score',
    'schedule',
  ];
  if (searchKeywords.some((keyword) => lower.includes(keyword))) {
    return true;
  }

  const questionWords = /\b(what|how|who|where|when|why|which|show|find|search|lookup)\b/i;
  if (questionWords.test(trimmed)) {
    return true;
  }

  return false;
}

export class LocalModelsService {
  listModels() {
    const list = LocalModelManager.listModels();
    const activeModelId = LocalModelRunner.getActiveModel();
    const runnerStatus = LocalModelRunner.getStartStatus();
    return {
      models: list,
      activeModelId,
      runnerStatus,
    };
  }

  async getDeviceCompatibility() {
    return await LocalModelManager.getDeviceCompatibility();
  }

  async autoSetup() {
    const compatibility = await LocalModelManager.getDeviceCompatibility();
    const recommendedModelId = compatibility.recommendedModelId;
    const downloadResult = LocalModelManager.startDownload(recommendedModelId);
    return {
      status: 'downloading',
      message: `Optimal model selected based on your system specs. Triggered download for: ${recommendedModelId}`,
      recommendedModelId,
      downloadResult,
      specs: compatibility.specs,
    };
  }

  async downloadAllCompatible() {
    const compatibility = await LocalModelManager.getDeviceCompatibility();
    const allCompatibleModelIds = compatibility.allCompatibleModelIds;
    const results: Record<string, any> = {};
    for (const modelId of allCompatibleModelIds) {
      try {
        results[modelId] = LocalModelManager.startDownload(modelId);
      } catch (error: any) {
        results[modelId] = { error: error.message };
      }
    }
    return {
      status: 'downloading_all',
      message: `Triggered download for all ${allCompatibleModelIds.length} compatible models.`,
      compatibleModelIds: allCompatibleModelIds,
      results,
    };
  }

  startDownload(modelId: string, quantization?: string) {
    return LocalModelManager.startDownload(modelId, quantization);
  }

  getProgress(modelId: string) {
    return LocalModelManager.getProgress(modelId);
  }

  pauseDownload(modelId: string) {
    return LocalModelManager.pauseDownload(modelId);
  }

  resumeDownload(modelId: string) {
    return LocalModelManager.resumeDownload(modelId);
  }

  cancelDownload(modelId: string) {
    return LocalModelManager.cancelDownload(modelId);
  }

  async runModel(modelId: string, settings?: any) {
    await ModelWarmCache.getInstance().keepWarm(modelId, settings);
    return { status: 'running', modelId };
  }

  async stopModel() {
    await ModelWarmCache.getInstance().stop();
    return { status: 'stopped' };
  }

  deleteModel(modelId: string) {
    const activeModel = LocalModelRunner.getActiveModel();
    if (activeModel === modelId) {
      ModelWarmCache.getInstance()
        .stop()
        .catch(() => {});
    }
    return LocalModelManager.deleteModel(modelId);
  }

  getStartStatus() {
    return LocalModelRunner.getStartStatus();
  }

  async chat(
    params: {
      model?: string;
      messages: any[];
      temperature?: number;
      max_tokens?: number;
      agentMode?: 'chat' | 'coder';
      webSearch?: boolean;
    },
    signal?: AbortSignal
  ): Promise<Response> {
    const requestedModel = params.model || 'nyx-gemma-4-e2b-it';
    const { messages, temperature, max_tokens, agentMode, webSearch } = params;

    // 1. Gather the latest user prompt
    const lastUserMessage = [...messages].reverse().find((m) => m.role === 'user');
    const query = lastUserMessage ? lastUserMessage.content : '';

    // Check if we have a client-defined system prompt and if it is conversational (general chat)
    const clientSystemMessage = messages.find((m) => m.role === 'system');
    const isGeneralChat =
      agentMode === 'chat' ||
      (agentMode === undefined &&
        clientSystemMessage &&
        clientSystemMessage.content.toLowerCase().includes('assistant') &&
        !clientSystemMessage.content.toLowerCase().includes('software engineering') &&
        !clientSystemMessage.content.toLowerCase().includes('expert software engineering'));

    logger.info(`[localModels.service.ts] General chat check:`, {
      isGeneralChat,
      agentMode,
      hasSystemMessage: !!clientSystemMessage,
      systemMessageLength: clientSystemMessage?.content.length,
      first100Chars: clientSystemMessage?.content.substring(0, 100),
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const dateDirective = `Current Date: ${dateStr}\nCurrent Year: ${now.getFullYear()}\n`;

    // 1b. Perform Web Search if auto-trigger matches
    let webSearchContext = '';
    const shouldSearch = webSearch !== false && query && shouldTriggerWebSearch(query);
    if (shouldSearch) {
      try {
        logger.info(
          `[localModels.service.ts] Automatically triggering backend web search for: "${query.substring(0, 60)}..."`
        );
        const { SearchService } = await import('../nyx/search.service.ts');
        const searchService = new SearchService();

        let cleanedQuery = query.trim();
        // Remove starting greetings and politeness
        cleanedQuery = cleanedQuery.replace(
          /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|please|thank\s+you|thanks|could\s+you|can\s+you|would\s+you|search\s+for|search\s+the\s+web\s+for|find\s+out|look\s+up|google)\b/i,
          ''
        );
        cleanedQuery = cleanedQuery
          .replace(/[?.,!/]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const rawResults = await searchService.performWebSearch(cleanedQuery || query);
        if (rawResults && rawResults.length > 0) {
          const resultsStr = rawResults
            .map(
              (r, idx) =>
                `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet/Content:\n${r.snippet}`
            )
            .join('\n\n');
          webSearchContext = `\n\n=== ADDITIONAL WEB SEARCH RESULTS ===\n${resultsStr}\n\n`;
        }
      } catch (error: any) {
        logger.error('[localModels.service.ts] Backend web search failed:', error.message);
      }
    }

    // Fetch persistent memories
    let persistentMemoryContext = '';
    try {
      const { MemoryService } = await import('../nyx/memory.service.ts');
      persistentMemoryContext = MemoryService.getMemoriesString();
    } catch (error: any) {
      logger.error('[localModels.service.ts] Failed to load memory keeper context:', error.message);
    }

    let systemPrompt: string;
    let codebaseContext = '';
    let rulesContext = '';

    if (isGeneralChat) {
      if (clientSystemMessage?.content) {
        systemPrompt = clientSystemMessage.content;
        if (!systemPrompt.includes('Current Date:')) {
          systemPrompt = `Current Date: ${dateStr}\nCurrent Year: ${now.getFullYear()}\n\n${systemPrompt}`;
        }
        if (persistentMemoryContext) {
          systemPrompt = `${systemPrompt}\n\n${persistentMemoryContext}`;
        }
        if (webSearchContext) {
          systemPrompt = `${systemPrompt}\n\n${webSearchContext}`;
        }
      } else {
        systemPrompt = `You are NYX, a helpful assistant.\n${dateDirective}`;
        if (persistentMemoryContext) {
          systemPrompt = `${systemPrompt}\n\n${persistentMemoryContext}`;
        }
        if (webSearchContext) {
          systemPrompt = `${systemPrompt}\n\n${webSearchContext}`;
        }
      }
    } else {
      // 2. Perform local codebase RAG search
      const directoryStructure = CodebaseScanner.getDirectoryStructure();
      const rules = RulesDb.getRules();

      if (query) {
        const searchResults = await CodebaseScanner.search(query, 3);
        if (searchResults && searchResults.length > 0) {
          codebaseContext = '\n\n=== RELEVANT CODEBASE FILES ===\n';
          for (const file of searchResults) {
            codebaseContext += `\n--- File: ${file.path} ---\n${file.content}\n`;
          }
        }
      }

      if (rules && rules.length > 0) {
        rulesContext = '\n\n=== LEARNED CRITIC RULES ===\n';
        for (const r of rules) {
          rulesContext += `- For ${r.metric}: ${r.rule}\n`;
        }
      }

      // 3. Formulate the dynamic system prompt
      systemPrompt = `You are NYX, a professional and highly capable AI software engineering assistant.
Always identify yourself as NYX. Never claim to be any other entity.
Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language like "premium". Focus on providing highly structured, precise, clean, and complete code solutions.
 
Current Date: ${dateStr}
Current Year: ${now.getFullYear()}

Here is the current directory structure of the repository:
${directoryStructure}
${codebaseContext}
${rulesContext}
${persistentMemoryContext}
${webSearchContext}
 
Please analyze the context and provide highly optimized, syntax-correct solutions.`;
    }

    const totalCharacters =
      messages.reduce((sum, m) => sum + (m.content || '').length, 0) + systemPrompt.length;
    const estimatedPromptTokens = Math.ceil(totalCharacters / 3.8);

    if (estimatedPromptTokens > 32768 - 256) {
      throw new Error(
        `Input context is too large (${estimatedPromptTokens} estimated tokens). Please reduce the size of your prompt or active codebase files.`
      );
    }

    const neededContext = estimatedPromptTokens + (max_tokens ?? 4096);
    // Coarse context size targeting to minimize model restarts.
    // We use large 8192-token increments so that the model is restarted at most once or twice in a session.
    const autoContextSize = Math.max(
      16384,
      Math.min(32768, Math.ceil(neededContext / 8192) * 8192)
    );

    const activeModel = LocalModelRunner.getActiveModel();
    const activeContextSize = LocalModelRunner.getActiveContextSize();
    const activeTaskType = (LocalModelRunner as any).getActiveTaskType?.() || 'code';
    const requestedTaskType = isGeneralChat ? 'chat' : 'code';

    // Only restart the model if it's not loaded, or if the current loaded context is strictly smaller than what is needed for this query, or if the task type has switched.
    if (
      activeModel !== requestedModel ||
      activeContextSize < neededContext ||
      activeTaskType !== requestedTaskType
    ) {
      const targetCtxSize = Math.max(autoContextSize, neededContext);
      try {
        const list = LocalModelManager.listModels();
        const targetModel = list.find((m) => m.id === requestedModel);
        if (targetModel && targetModel.status === 'completed') {
          if (activeModel === requestedModel) {
            logger.info(
              `[Auto-Context] Restarting local model ${requestedModel} (task: ${activeTaskType} -> ${requestedTaskType}) to upscale context window from ${activeContextSize} to ${targetCtxSize} tokens...`
            );
          } else {
            logger.info(
              `[Auto-Runner] Auto-starting local model ${requestedModel} (task: ${requestedTaskType}) with ${targetCtxSize} context tokens...`
            );
          }
          // Race the model restart against a 90-second timeout to prevent blocking the HTTP connection.
          // If the model loads on GPU (Vulkan/CUDA), it typically finishes in <30s.
          // If it falls back to CPU-only (can take 5+ minutes), we skip the restart and proceed
          // with whatever model is currently loaded, avoiding a connection timeout / [PROTOCOL HALT].
          const restartTimeout = new Promise<void>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new Error('Model restart timed out after 90s — proceeding with current model')
                ),
              90000
            )
          );
          await Promise.race([
            ModelWarmCache.getInstance().keepWarm(requestedModel, {
              contextSize: targetCtxSize,
              taskType: requestedTaskType,
            }),
            restartTimeout,
          ]);
        }
      } catch (startErr: any) {
        logger.warn('[Auto-Runner] Model restart skipped or failed:', startErr.message);
      }
    } else {
      // Refresh sliding TTL on every query
      ModelWarmCache.getInstance()
        .keepWarm(requestedModel, {
          contextSize: activeContextSize,
          taskType: requestedTaskType,
        })
        .catch(() => {});
    }

    if (!LocalModelRunner.isRunning() || LocalModelRunner.getActiveModel() !== requestedModel) {
      throw new Error(
        `The local model '${requestedModel}' is not loaded in RAM. Please go to the Models tab to download it, or load it in RAM first.`
      );
    }

    const updatedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter((m) => m.role !== 'system'),
    ];

    const currentActiveModel = LocalModelRunner.getActiveModel() || requestedModel;
    const port = process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString();
    const targetUrl = `http://127.0.0.1:${port}/v1/chat/completions`;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: requestedModel,
        messages: updatedMessages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 4096,
        stream: true,
        agentMode,
        webSearch,
      }),
      signal,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama-server error: ${errorText}`);
    }

    return response;
  }

  // ==========================================
  // OLLAMA MANAGEMENT
  // ==========================================

  public async listOllamaModels(): Promise<any> {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/tags');
      if (!response.ok) throw new Error('Ollama not running or returned error');
      return await response.json();
    } catch (error: any) {
      throw new Error(`Failed to list Ollama models: ${error.message}`);
    }
  }

  public async pullOllamaModel(modelName: string): Promise<any> {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/pull', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName, stream: false }),
      });
      if (!response.ok) throw new Error(await response.text());
      return await response.json();
    } catch (error: any) {
      throw new Error(`Failed to pull Ollama model: ${error.message}`);
    }
  }

  public async deleteOllamaModel(modelName: string): Promise<any> {
    try {
      const response = await fetch('http://127.0.0.1:11434/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: modelName }),
      });
      if (!response.ok) throw new Error(await response.text());
      return { success: true };
    } catch (error: any) {
      throw new Error(`Failed to delete Ollama model: ${error.message}`);
    }
  }
}
