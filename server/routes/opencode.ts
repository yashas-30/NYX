/**
 * @file server/routes/opencode.ts
 * @description OpenCode free models direct REST proxy.
 */

import { Router } from 'express';
import { Gateway } from '../lib/gateway.js';
import { sendSseTokenRotate } from '../lib/sseHelpers.ts';

export const opencodeRouter = Router();

const SYSTEM_KEY = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || '';

opencodeRouter.post('/stream', async (req, res) => {
  const controller = new AbortController();
  res.on('close', () => {
    controller.abort();
  });

  try {
    const { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = req.body;
    
    if (!model || !prompt) {
      return res.status(400).json({ error: 'Model and prompt are required' });
    }

    // Resolve active key
    const isUserKey = (apiKey && apiKey.trim() !== '' && apiKey !== 'null' && apiKey !== 'undefined');
    const activeKey = isUserKey ? apiKey.trim() : SYSTEM_KEY;

    // Validation
    const authResult = Gateway.validateAuth('opencode', model, apiKey);
    if (!authResult.valid) {
      return res.status(401).json({ error: authResult.error });
    }

    // Map model ID
    const mappedModel = Gateway.mapOpenCodeModel(model);

    // Build messages
    const messages: any[] = [];
    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }
    if (history && Array.isArray(history)) {
      messages.push(...history.map((m: any) => ({ role: m.role, content: m.content })));
    }
    messages.push({ role: 'user', content: prompt });

    // Build URL with gateway support (custom user gateway takes priority)
    const { url } = Gateway.buildUrl('opencode', '/chat/completions', gatewayUrls);

    // Set event-stream headers
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders();
    sendSseTokenRotate(res);

    // Make request to OpenCode Zen API
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'LLM Reference - OpenCode Zen',
      },
      body: JSON.stringify({
        model: mappedModel,
        messages,
        stream: true,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 4096,
        top_p: settings?.topP ?? 1.0,
      }),
      signal: controller.signal,
    });

    if (!response.ok || !response.body) {
      const errorText = await response.text();
      let errorMessage = `OpenRouter Error ${response.status}`;
      try {
        const errorJson = JSON.parse(errorText);
        errorMessage = errorJson.error?.message || errorMessage;
      } catch {
        errorMessage = errorText || errorMessage;
      }
      res.write(`data: ${JSON.stringify({ error: errorMessage })}\n\n`);
      res.end();
      return;
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buf += decoder.decode(value, { stream: true });
      const lines = buf.split('\n');
      buf = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('data: ')) {
          const dataStr = trimmed.slice(6).trim();
          if (dataStr === '[DONE]') {
            res.write('data: [DONE]\n\n');
            res.end();
            return;
          }
          try {
            const parsed = JSON.parse(dataStr);
            const chunk = parsed.choices?.[0]?.delta?.content ?? '';
            if (chunk) {
              res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
            }
          } catch (e) {
            // ignore JSON errors
          }
        }
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();
  } catch (error: any) {
    console.error('[OpenCode Error]:', error);
    if (error.name === 'AbortError') {
      res.end();
      return;
    }
    res.write(`data: ${JSON.stringify({ error: error.message })}\n\n`);
    res.end();
  }
});