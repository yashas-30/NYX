import { LocalModelManager } from './localModelManager.ts';
import { LocalModelRunner } from './localModelRunner.ts';
import { ModelWarmCache } from './warmCache.ts';
import { CodebaseScanner } from '../workspace/codebaseScanner.ts';
import { RulesDb } from '../admin/admin.service.ts';

export class LocalModelsService {
  listModels() {
    const list = LocalModelManager.listModels();
    const activeModelId = LocalModelRunner.getActiveModel();
    const runnerStatus = LocalModelRunner.getStartStatus();
    return {
      models: list,
      activeModelId,
      runnerStatus
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
      specs: compatibility.specs
    };
  }

  async downloadAllCompatible() {
    const compatibility = await LocalModelManager.getDeviceCompatibility();
    const allCompatibleModelIds = compatibility.allCompatibleModelIds;
    const results: Record<string, any> = {};
    for (const modelId of allCompatibleModelIds) {
      try {
        results[modelId] = LocalModelManager.startDownload(modelId);
      } catch (err: any) {
        results[modelId] = { error: err.message };
      }
    }
    return {
      status: 'downloading_all',
      message: `Triggered download for all ${allCompatibleModelIds.length} compatible models.`,
      compatibleModelIds: allCompatibleModelIds,
      results
    };
  }

  startDownload(modelId: string) {
    return LocalModelManager.startDownload(modelId);
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
      ModelWarmCache.getInstance().stop().catch(() => {});
    }
    return LocalModelManager.deleteModel(modelId);
  }

  getStartStatus() {
    return LocalModelRunner.getStartStatus();
  }

  async chat(params: {
    model?: string;
    messages: any[];
    temperature?: number;
    max_tokens?: number;
    agentMode?: 'chat' | 'coder';
  }, signal?: AbortSignal): Promise<Response> {
    const requestedModel = params.model || 'nyx-gemma-4-e2b-it';
    const { messages, temperature, max_tokens, agentMode } = params;

    // 1. Gather the latest user prompt
    const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
    const query = lastUserMessage ? lastUserMessage.content : '';

    // Check if we have a client-defined system prompt and if it is conversational (general chat)
    const clientSystemMessage = messages.find(m => m.role === 'system');
    const isGeneralChat = agentMode === 'chat' || (agentMode === undefined && clientSystemMessage && 
      (clientSystemMessage.content.toLowerCase().includes('assistant') && 
       !clientSystemMessage.content.toLowerCase().includes('software engineering') &&
       !clientSystemMessage.content.toLowerCase().includes('expert software engineering')));

    console.log(`[localModels.service.ts] General chat check:`, {
      isGeneralChat,
      agentMode,
      hasSystemMessage: !!clientSystemMessage,
      systemMessageLength: clientSystemMessage?.content.length,
      first100Chars: clientSystemMessage?.content.substring(0, 100)
    });

    const now = new Date();
    const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const dateDirective = `Current Date: ${dateStr}\nCurrent Year: ${now.getFullYear()}\n`;

    let systemPrompt = '';
    let directoryStructure = '';
    let codebaseContext = '';
    let rulesContext = '';

    if (isGeneralChat) {
      if (clientSystemMessage?.content) {
        systemPrompt = clientSystemMessage.content;
        if (!systemPrompt.includes('Current Date:')) {
          systemPrompt = `Current Date: ${dateStr}\nCurrent Year: ${now.getFullYear()}\n\n${systemPrompt}`;
        }
      } else {
        systemPrompt = `You are NYX, a helpful assistant.\n${dateDirective}`;
      }
    } else {
      // 2. Perform local codebase RAG search
      directoryStructure = CodebaseScanner.getDirectoryStructure();
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
Always identify yourself as NYX. Never claim to be OpenAI, ChatGPT, Anthropic, or any other entity.
Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language like "premium". Focus on providing highly structured, precise, clean, and complete code solutions.
 
Current Date: ${dateStr}
Current Year: ${now.getFullYear()}

Here is the current directory structure of the repository:
${directoryStructure}
${codebaseContext}
${rulesContext}
 
Please analyze the context and provide highly optimized, syntax-correct solutions.`;
    }

    const totalCharacters = messages.reduce((sum, m) => sum + (m.content || '').length, 0) + systemPrompt.length;
    const estimatedPromptTokens = Math.ceil(totalCharacters / 3.8);

    if (estimatedPromptTokens > 32768 - 256) {
      throw new Error(`Input context is too large (${estimatedPromptTokens} estimated tokens). Please reduce the size of your prompt or active codebase files.`);
    }

    const neededContext = estimatedPromptTokens + (max_tokens ?? 4096);
    const autoContextSize = Math.max(2048, Math.min(32768, Math.ceil(neededContext / 512) * 512));

    const activeModel = LocalModelRunner.getActiveModel();
    const activeContextSize = LocalModelRunner.getActiveContextSize();

    if (activeModel !== requestedModel || activeContextSize < autoContextSize) {
      try {
        const list = LocalModelManager.listModels();
        const targetModel = list.find(m => m.id === requestedModel);
        if (targetModel && targetModel.status === 'completed') {
          if (activeModel === requestedModel) {
            console.log(`[Auto-Context] Restarting local model ${requestedModel} to upscale context window from ${activeContextSize} to ${autoContextSize} tokens...`);
          } else {
            console.log(`[Auto-Runner] Auto-starting local model ${requestedModel} with ${autoContextSize} context tokens...`);
          }
          await ModelWarmCache.getInstance().keepWarm(requestedModel, { contextSize: autoContextSize });
        }
      } catch (startErr: any) {
        console.error('[Auto-Runner] Failed to start model with dynamic context:', startErr.message);
      }
    } else {
      // Refresh sliding TTL on every query
      ModelWarmCache.getInstance().keepWarm(requestedModel, { contextSize: activeContextSize }).catch(() => {});
    }

    if (!LocalModelRunner.isRunning() || LocalModelRunner.getActiveModel() !== requestedModel) {
      throw new Error(`The local model '${requestedModel}' is not loaded in RAM. Please go to the Models tab to download it, or load it in RAM first.`);
    }

    const updatedMessages = [
      { role: 'system', content: systemPrompt },
      ...messages.filter(m => m.role !== 'system')
    ];

    const currentActiveModel = LocalModelRunner.getActiveModel() || requestedModel;
    const port = currentActiveModel.startsWith('airllm-') ? 12346 : 12345;
    const targetUrl = `http://127.0.0.1:${port}/v1/chat/completions`;
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: requestedModel,
        messages: updatedMessages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 4096,
        stream: true
      }),
      signal
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`llama-server error: ${errorText}`);
    }

    return response;
  }
}
