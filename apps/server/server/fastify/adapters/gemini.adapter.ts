import { ProviderAdapter, ChatRequest } from './base.adapter.js';
import { GoogleGenAI } from '@google/genai';
import { resolveRealGeminiModel } from '../../lib/modelUtils.js';

export function geminiContentBuilder(messages: any[], images?: any[]) {
  const contents = messages.map((m) => ({
    role: m.role === 'assistant' ? 'model' : m.role,
    parts: [{ text: m.content }] as any[],
  }));

  if (images && images.length > 0) {
    const lastUserContent = contents.slice().reverse().find((c) => c.role === 'user');
    if (lastUserContent) {
      for (const img of images) {
        lastUserContent.parts.push({
          inlineData: {
            mimeType: img.mimeType || 'image/png',
            data: img.data || img.base64 || img.dataUrl?.split(',')[1] || '',
          },
        });
      }
    }
  }
  return contents;
}

export class GeminiAdapter implements ProviderAdapter {
  providerName = 'gemini';

  async listModels(apiKey?: string): Promise<string[]> {
    if (!apiKey) return [];
    try {
      const ai = new GoogleGenAI({ apiKey });
      const models: string[] = [];
      const response = await ai.models.list();
      for await (const m of response) {
        if (m.name) {
          models.push(`gemini/${m.name.replace('models/', '')}`);
        }
      }
      return models;
    } catch (err) {
      console.error('[GeminiAdapter] listModels error:', err);
      return [];
    }
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'free_tier_or_pay_as_you_go' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    if (!apiKey) throw new Error('Gemini API Key required');
    const ai = new GoogleGenAI({ apiKey });
    const rawModel = request.model.replace('gemini/', '');
    const model = resolveRealGeminiModel(rawModel);

    let contents = geminiContentBuilder(request.messages, request.images);

    // Extract system messages
    const systemMessages = contents.filter((c: any) => c.role === 'system');
    contents = contents.filter((c: any) => c.role !== 'system');

    let systemText = systemMessages.map((s: any) => s.parts[0].text).join('\n\n');

    if (model.toLowerCase().includes('gemma')) {
      const suppressReasoningInstruction = `You are a helpful AI assistant. Respond directly to the user. \nDo NOT show your internal reasoning, planning, or thought process. \nDo NOT include sections like "Intent:", "Identity:", "Drafting:", or "Refining:". \nJust give the final answer in a natural, conversational tone.`;
      
      systemText = systemText ? `${systemText}\n\n${suppressReasoningInstruction}` : suppressReasoningInstruction;
      
      if (contents.length > 0 && contents[0].role === 'user') {
        if (contents[0].parts && contents[0].parts.length > 0 && contents[0].parts[0].text) {
            contents[0].parts[0].text = `System Instruction:\n${systemText}\n\n${contents[0].parts[0].text}`;
        } else {
            contents[0].parts.unshift({ text: `System Instruction:\n${systemText}\n\n` });
        }
      } else {
        contents.unshift({ role: 'user', parts: [{ text: `System Instruction:\n${systemText}` }] });
        // To maintain alternating roles, insert a dummy model response if next is user
        if (contents.length > 1 && contents[1].role === 'user') {
            contents.splice(1, 0, { role: 'model', parts: [{ text: 'Acknowledged.' }] });
        }
      }
    }

    const isGemma = model.toLowerCase().includes('gemma');

    const config: any = {
      temperature: request.temperature ?? 0.7,
      // Gemma models have no artificial output cap — let the API use the model's native maximum.
      // Other Gemini models default to 8192 if not specified by the request.
      maxOutputTokens: isGemma ? undefined : (request.max_tokens ?? 8192),
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_NONE" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_NONE" }
      ]
    };

    if (systemText && !isGemma) {
      config.systemInstruction = systemText;
    }

    if (request.cachedContentName) {
      config.cachedContent = request.cachedContentName;
    }

    if (request.webSearch) {
      config.tools = [
        {
          googleSearch: {}
        }
      ];
    }

    const responseStream = await ai.models.generateContentStream({
        model: model,
        contents: contents,
        config: config
    });

    let yieldedText = false;
    let finishReason: string | undefined = '';
    const rawChunks: any[] = [];

    for await (const chunk of responseStream) {
        rawChunks.push(chunk);
        
        let chunkText: string | undefined = '';
        try { chunkText = chunk.text; } catch (e) {}

        if (chunkText) {
            yieldedText = true;
            yield chunkText;
        }
        if (chunk.candidates && chunk.candidates[0]?.finishReason) {
            finishReason = chunk.candidates[0].finishReason;
        }
    }

    if (!yieldedText) {
        let blockReason = '';
        if (rawChunks[0]?.promptFeedback?.blockReason) {
            blockReason = `Prompt blocked: ${rawChunks[0].promptFeedback.blockReason}`;
        }
        if (finishReason) {
            throw new Error(`Gemini API returned no text. Finish reason: ${finishReason}. Chunks: ${JSON.stringify(rawChunks)}`);
        } else {
            throw new Error(`Gemini API returned no response text. ${blockReason} Chunks: ${JSON.stringify(rawChunks)}`);
        }
    }
  }
}
