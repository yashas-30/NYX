import express from 'express';
import { LocalModelManager } from '../lib/localModelManager.ts';
import { LocalModelRunner } from '../lib/localModelRunner.ts';
import { CodebaseScanner } from '../lib/codebaseScanner.ts';
import { RulesDb } from '../lib/rulesDb.ts';
import { loadKeys } from '../lib/keyVault.ts';

export const localModelsRouter = express.Router();

// List presets and their installation status
localModelsRouter.get('/', (_req, res) => {
  try {
    const list = LocalModelManager.listModels();
    const activeModelId = LocalModelRunner.getActiveModel();
    const runnerStatus = LocalModelRunner.getStartStatus();

    res.json({
      models: list,
      activeModelId,
      runnerStatus
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Start GGUF model download
localModelsRouter.post('/download', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }

  try {
    const result = LocalModelManager.startDownload(modelId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Poll download progress
localModelsRouter.get('/download-progress', (req, res) => {
  const { modelId } = req.query;
  if (!modelId || typeof modelId !== 'string') {
    return res.status(400).json({ error: 'Missing or invalid modelId query parameter.' });
  }

  try {
    const progress = LocalModelManager.getProgress(modelId);
    res.json(progress);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Run a model natively via llama-server
localModelsRouter.post('/run', async (req, res) => {
  const { modelId, settings } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }

  try {
    // Start runner asynchronously or wait for it
    await LocalModelRunner.start(modelId, settings);
    res.json({ status: 'running', modelId });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Stop the native runner and evict model from memory
localModelsRouter.post('/stop', async (_req, res) => {
  try {
    await LocalModelRunner.stop();
    res.json({ status: 'stopped' });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Delete a downloaded GGUF model from disk
localModelsRouter.delete('/delete', (req, res) => {
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }

  try {
    // Stop the runner first if this is the active model
    const activeModel = LocalModelRunner.getActiveModel();
    if (activeModel === modelId) {
      LocalModelRunner.stop().catch(() => {});
    }

    const result = LocalModelManager.deleteModel(modelId);
    res.json(result);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Get current runner startup status
localModelsRouter.get('/status', (_req, res) => {
  try {
    const status = LocalModelRunner.getStartStatus();
    res.json(status);
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

// Proxy streaming chat completion to port 12345
localModelsRouter.post('/chat', async (req, res) => {
  const requestedModel = req.body.model || 'nyx-gemma-4-e2b-it';
  const { messages, temperature, max_tokens } = req.body;
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'Invalid or missing messages in request body.' });
  }

  // 1. Gather the latest user prompt
  const lastUserMessage = [...messages].reverse().find(m => m.role === 'user');
  const query = lastUserMessage ? lastUserMessage.content : '';

  // 2. Perform local codebase RAG search
  const directoryStructure = CodebaseScanner.getDirectoryStructure();
  const rules = RulesDb.getRules();
  
  let codebaseContext = '';
  if (query) {
    const searchResults = CodebaseScanner.search(query, 3);
    if (searchResults && searchResults.length > 0) {
      codebaseContext = '\n\n=== RELEVANT CODEBASE FILES ===\n';
      for (const file of searchResults) {
        codebaseContext += `\n--- File: ${file.path} ---\n${file.content}\n`;
      }
    }
  }
  
  let rulesContext = '';
  if (rules && rules.length > 0) {
    rulesContext = '\n\n=== LEARNED CRITIC RULES ===\n';
    for (const r of rules) {
      rulesContext += `- For ${r.metric}: ${r.rule}\n`;
    }
  }

  // 3. Formulate the dynamic system prompt integrating codebase knowledge
  const systemPrompt = `You are NYX, a professional and highly capable AI software engineering assistant.
Always identify yourself as NYX. Never claim to be OpenAI, ChatGPT, Anthropic, or any other entity.
Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language like "premium". Focus on providing highly structured, precise, clean, and complete code solutions.

Here is the current directory structure of the repository:
${directoryStructure}
${codebaseContext}
${rulesContext}

Please analyze the context and provide highly optimized, syntax-correct solutions.`;

  // Estimate total tokens required for this request (system prompt + message history + completion)
  const totalCharacters = messages.reduce((sum, m) => sum + (m.content || '').length, 0) + systemPrompt.length;
  const estimatedPromptTokens = Math.ceil(totalCharacters / 3.8);
  const neededContext = estimatedPromptTokens + (max_tokens ?? 2048);
  // Round up to nearest 512, clamp between 2048 and 32768
  const autoContextSize = Math.max(2048, Math.min(32768, Math.ceil(neededContext / 512) * 512));

  const activeModel = LocalModelRunner.getActiveModel();
  const activeContextSize = LocalModelRunner.getActiveContextSize();

  // If the requested model is not currently running, OR the running model has a context window smaller than required:
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
        
        await LocalModelRunner.start(requestedModel, { contextSize: autoContextSize });
      }
    } catch (startErr: any) {
      console.error('[Auto-Runner] Failed to start model with dynamic context:', startErr.message);
    }
  }

  if (!LocalModelRunner.isRunning() || LocalModelRunner.getActiveModel() !== requestedModel) {
    return res.status(400).json({ 
      error: `The local model '${requestedModel}' is not loaded in RAM. Please go to the Models tab to download it, or load it in RAM first.`
    });
  }

  // Prepend the codebase context as the system instruction
  const updatedMessages = [
    { role: 'system', content: systemPrompt },
    ...messages.filter(m => m.role !== 'system')
  ];

  const targetUrl = 'http://127.0.0.1:12345/v1/chat/completions';
  
  try {
    // Stage 1: Local GGUF Model Generation
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: req.body.model,
        messages: updatedMessages,
        temperature: temperature ?? 0.7,
        max_tokens: max_tokens ?? 2048,
        stream: true
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      return res.status(response.status).json({ error: `llama-server error: ${errorText}` });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let localDraftResponse = '';

    if (response.body) {
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // Forward the raw GGUF token chunk immediately to the client
        res.write(value);
      }

    }

    res.end();
  } catch (e: any) {
    console.error('[Local runner proxy error]:', e.message);
    res.status(500).json({ error: `Connection to local model runner failed: ${e.message}` });
  }
});
