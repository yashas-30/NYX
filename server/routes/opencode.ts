// ─── server/routes/opencode.ts ──────────────────────────────────────────────────
// Specialized proxy for OpenCode free models. 
// Routes virtual IDs to OpenRouter free-tier endpoints without requiring a client-side key.

import { Router } from 'express';

export const opencodeRouter = Router();

// Fallback to environment key if available, otherwise uses OpenRouter's free-tier if allowed.
const SYSTEM_KEY = process.env.OPENROUTER_API_KEY || '';

opencodeRouter.post('/stream', async (req, res) => {
    const { model, prompt, apiKey, settings, systemInstruction, history } = req.body;
    
    // Use provided key (from settings) or fallback to system key
    const activeKey = apiKey || SYSTEM_KEY || '';
    
    if (!model || !prompt) {
      return res.status(400).json({ error: 'Required fields missing' });
    }

    // ── Mapping Virtual IDs to Real OpenRouter IDs ───────────────────────────
    let realModel = model.replace('opencode/', '');
    
    const modelMap: Record<string, string> = {
      'elephant-free': 'poolside/laguna-m.1:free',
      'laguna-m.1-free': 'poolside/laguna-m.1:free',
      'ring-2.6-1t-free': 'inclusionai/ring-2.6-1t:free',
      'gemma-3-4b-free': 'google/gemma-3-4b-it:free',
      'uncensored-free': 'nousresearch/hermes-3-llama-3.1-405b:free',
      'minimax-m2.5-free': 'minimax/minimax-01:free',
      'free-models-router': 'openrouter/auto',
      'gemma-3n-2b-free': 'google/gemma-2-9b-it:free',
      'gemma-3-12b-free': 'google/gemma-3-12b-it:free',
      'gemma-3n-4b-free': 'google/gemma-3-4b-it:free',
      'gemma-3-27b-free': 'google/gemma-3-27b-it:free',
      'gemma-4-31b-free': 'meta-llama/llama-3.3-70b-instruct:free',
      'glm-4.5-air-free': 'z-ai/glm-4.5-air:free',
      'gpt-oss-20b-free': 'meta-llama/llama-3.1-8b-instruct:free',
      'minimax-m2.5-free-or': 'minimax/minimax-01:free',
      'gpt-oss-120b-free': 'meta-llama/llama-3.1-405b-instruct:free',
      'nemotron-3-super-free': 'nvidia/nemotron-3-super-120b-a12b:free',
      'gemma-4-26b-a4b-free': 'google/gemma-2-27b-it:free',
      'nemotron-3-nano-omni-free': 'nvidia/nemotron-3-nano-30b-a3b:free',
      'lfm-2.5-1.2b-thinking-free': 'liquid/lfm-40b:free',
      'llama-3.2-3b-instruct-free': 'meta-llama/llama-3.2-3b-instruct:free',
      'llama-3.3-70b-instruct-free': 'meta-llama/llama-3.3-70b-instruct:free',
      'hermes-3-405b-instruct-free': 'nousresearch/hermes-3-llama-3.1-405b:free',
      'gemini-3-flash-preview-free': 'google/gemini-2.0-flash-exp:free',
    };

    if (modelMap[realModel]) {
      realModel = modelMap[realModel];
    }

    try {
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache');
      res.flushHeaders();
      
      // Bypass proxy buffering
      res.write(`: ${' '.repeat(2048)}\n\n`);

      const messages = [];
      if (systemInstruction) {
        messages.push({ role: 'system', content: systemInstruction });
      }
      if (history && Array.isArray(history)) {
        messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
      }
      messages.push({ role: 'user', content: prompt });

      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${activeKey}`,
          'HTTP-Referer': 'http://localhost:3000',
          'X-Title': 'LLMLAB OpenCode',
        },
        body: JSON.stringify({
          model: realModel,
          messages,
          stream: true,
          ...settings,
        }),
      });

      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `Proxy connection failed: ${r.status}`);
      }

      const reader = r.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') { res.end(); return; }
          try {
            const parsed = JSON.parse(raw);
            const content = parsed.choices?.[0]?.delta?.content;
            if (content) res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
          } catch { }
        }
      }
      res.end();
    } catch (e: any) {
      res.write(`data: ${JSON.stringify({ error: e.message })}\n\n`);
      res.end();
    }
});
