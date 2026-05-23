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
  const { modelId } = req.body;
  if (!modelId) {
    return res.status(400).json({ error: 'Missing modelId in request body.' });
  }

  try {
    // Start runner asynchronously or wait for it
    await LocalModelRunner.start(modelId);
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
  
  // If the requested model is not currently running, attempt to auto-start it if it is fully downloaded
  if (LocalModelRunner.getActiveModel() !== requestedModel) {
    try {
      const list = LocalModelManager.listModels();
      const targetModel = list.find(m => m.id === requestedModel);
      if (targetModel && targetModel.status === 'completed') {
        console.log(`[Auto-Runner] Model ${requestedModel} is downloaded but not loaded. Auto-starting in RAM...`);
        await LocalModelRunner.start(requestedModel);
      }
    } catch (startErr: any) {
      console.error('[Auto-Runner] Failed to auto-start model:', startErr.message);
    }
  }

  if (!LocalModelRunner.isRunning() || LocalModelRunner.getActiveModel() !== requestedModel) {
    return res.status(400).json({ 
      error: `The local model '${requestedModel}' is not loaded in RAM. Please go to the Models tab to download it, or load it in RAM first.`
    });
  }

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
  const systemPrompt = `You are Nyx, an intelligent AI coding assistant representing the NYX development workspace.
You are running locally on Google's state-of-the-art Gemma 4 E2B (2.3B Edge) model.
You have native, deep, real-time access to the user's workspace, file structure, and code languages.

Here is the current directory structure of the repository:
${directoryStructure}
${codebaseContext}
${rulesContext}

Please analyze the codebase context above and provide highly optimized, syntax-correct, and complete solutions. Write clean code and explain your implementation briefly. Make full use of your understanding of all languages present in the project.`;

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

        // Also parse and accumulate text for the cloud refinement pass
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          
          let dataStr = trimmed;
          if (trimmed.startsWith('data: ')) {
            dataStr = trimmed.slice(6).trim();
          }

          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) {
              localDraftResponse += content;
            }
          } catch {}
        }
      }
    }

    // Stage 2: Dual-Stage Orchestration Refinement via Cloud Models
    const keys = loadKeys();
    const geminiKey = keys.gemini;
    const openrouterKey = keys.openrouter;

    if (localDraftResponse && (geminiKey || openrouterKey)) {
      // Stream Orchestrator status header to user
      const refinementHeader = `\n\n---\n\n*✨ [NYX Orchestrator] Enhancing response with high-performance model selector...*\n\n`;
      res.write(`data: ${JSON.stringify({ chunk: refinementHeader })}\n\n`);

      const refinementPrompt = `You are the Core Refinement Critic for the NYX development workspace.
A user asked the following question:
"${query}"

Our local GGUF agent (Gemma 4 E2B) drafted the following response:
---
${localDraftResponse}
---

Here is the codebase context and repository files matching the query:
${directoryStructure}
${codebaseContext}
${rulesContext}

Please refine, optimize, and polish the local model's drafted response into a final production-grade response. 
Analyze if the drafted response has any bugs, missing imports, or incorrect assumptions relative to the codebase.
If the draft is already excellent and correct, present it with minor enhancements. If there are any bugs, correct them.
Output the finalized, polished response with outstanding formatting, clean syntax highlighting, and concise explanations.`;

      if (geminiKey) {
        const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${geminiKey}`;
        try {
          const geminiRes = await fetch(geminiUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: refinementPrompt }] }],
              generationConfig: { temperature: 0.2, maxOutputTokens: 4096 }
            })
          });

          if (geminiRes.ok && geminiRes.body) {
            const reader = geminiRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                
                try {
                  const jsonStr = trimmed.slice(5).trim();
                  const parsed = JSON.parse(jsonStr);
                  const chunkText = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                  if (chunkText) {
                    res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
                  }
                } catch {}
              }
            }
          }
        } catch (e: any) {
          console.error('[Orchestration] Gemini refinement failed:', e.message);
        }
      } else if (openrouterKey) {
        const openrouterUrl = 'https://openrouter.ai/api/v1/chat/completions';
        try {
          const orRes = await fetch(openrouterUrl, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${openrouterKey}`,
              'HTTP-Referer': 'http://localhost:3000',
              'X-Title': 'NYX Orchestrator'
            },
            body: JSON.stringify({
              model: 'google/gemma-4-31b-it:free',
              messages: [{ role: 'user', content: refinementPrompt }],
              stream: true
            })
          });

          if (orRes.ok && orRes.body) {
            const reader = orRes.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              buffer += decoder.decode(value, { stream: true });
              const lines = buffer.split('\n');
              buffer = lines.pop() || '';

              for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed || !trimmed.startsWith('data: ')) continue;
                
                try {
                  const jsonStr = trimmed.slice(5).trim();
                  if (jsonStr === '[DONE]') continue;
                  const parsed = JSON.parse(jsonStr);
                  const chunkText = parsed.choices?.[0]?.delta?.content;
                  if (chunkText) {
                    res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
                  }
                } catch {}
              }
            }
          }
        } catch (e: any) {
          console.error('[Orchestration] OpenRouter refinement failed:', e.message);
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (e: any) {
    console.error('[Local runner proxy error]:', e.message);
    res.status(500).json({ error: `Connection to local model runner failed: ${e.message}` });
  }
});
