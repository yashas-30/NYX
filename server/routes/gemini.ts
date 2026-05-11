// ─── server/routes/gemini.ts ──────────────────────────────────────────────────
// Gemini (Google Generative AI) streaming proxy.
// To change Gemini config (model params, system instructions): edit only this file.

import { Router } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

export const geminiRouter = Router();

// Cache instances to reuse connection pools internally
const clientCache = new Map<string, GoogleGenerativeAI>();

geminiRouter.post('/stream', async (req, res) => {
  const { model, prompt, apiKey, settings, systemInstruction, history } = req.body;
  if (!model || !apiKey) {
    return res.status(400).json({ error: 'Required fields missing' });
  }

  try {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    
    // 🚀 Preamble to pokes the buffer
    res.write(`: ${' '.repeat(2048)}\n\n`);

    // Clear cache for this key to ensure fresh authentication
    clientCache.delete(apiKey);
    const genAI = new GoogleGenerativeAI(apiKey);
    clientCache.set(apiKey, genAI);
    
    const genModel = genAI.getGenerativeModel({
      model: model,
      systemInstruction: systemInstruction || undefined,
    });

    // Convert history to Gemini format if provided
    let contents = [];
    if (history && Array.isArray(history)) {
      contents = history.map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }]
      }));
    }
    
    // Add current prompt if provided (otherwise we assume it's already in history)
    if (prompt) {
      contents.push({ role: 'user', parts: [{ text: prompt }] });
    }

    const result = await genModel.generateContentStream({
      contents,
      generationConfig: {
        temperature: settings?.temperature,
        topP: settings?.topP,
        topK: settings?.topK,
        maxOutputTokens: settings?.maxTokens,
      },
    });

    for await (const chunk of result.stream) {
      const text = chunk.text();
      if (text) res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
    }
    res.end();
  } catch (e: any) {
    console.error('[Gemini Error]:', e.message);
    let msg = e.message;
    
    if (msg.includes('404')) msg = `Model "${model}" not found or not available. Try a different model.`;
    if (msg.includes('403')) msg = 'Permission denied. Check your API key has the required permissions.';
    if (msg.includes('401') || msg.includes('invalid')) msg = 'Invalid API key. Please check your Gemini API key in Settings.';
    if (msg.includes('quota') || msg.includes('limit')) msg = 'API quota exceeded. Check your Google Cloud quota.';
    if (msg.includes('ENOTFOUND') || msg.includes('network')) msg = 'Network error. Check your internet connection.';
    
    res.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
    res.end();
  }
});
