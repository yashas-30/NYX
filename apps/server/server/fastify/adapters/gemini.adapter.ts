import { ProviderAdapter, ChatRequest } from './base.adapter.js';

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
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      if (!res.ok) return [];
      const data = await res.json();
      return (data as any).models.map((m: any) => `gemini/${m.name.replace('models/', '')}`);
    } catch {
      return [];
    }
  }

  async getQuota(apiKey?: string): Promise<any> {
    return { status: 'ok', type: 'free_tier_or_pay_as_you_go' };
  }

  async *streamChat(request: ChatRequest, apiKey?: string): AsyncGenerator<string, void, unknown> {
    if (!apiKey) throw new Error('Gemini API Key required');
    const model = request.model.replace('gemini/', '');
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:streamGenerateContent?alt=sse&key=${apiKey}`;

    let contents = geminiContentBuilder(request.messages, request.images);

    // Extract system messages
    const systemMessages = contents.filter((c: any) => c.role === 'system');
    contents = contents.filter((c: any) => c.role !== 'system');

    let systemText = systemMessages.map((s: any) => s.parts[0].text).join('\n\n');

    if (model.toLowerCase().includes('gemma')) {
      const suppressReasoningInstruction = `You are a helpful AI assistant. Respond directly to the user. \nDo NOT show your internal reasoning, planning, or thought process. \nDo NOT include sections like "Intent:", "Identity:", "Drafting:", or "Refining:". \nJust give the final answer in a natural, conversational tone.`;
      
      systemText = systemText ? `${systemText}\n\n${suppressReasoningInstruction}` : suppressReasoningInstruction;
      
      if (contents.length > 0 && contents[0].role === 'user') {
        contents[0].parts.unshift({ text: `System Instruction:\n${systemText}\n\n` });
      } else {
        contents.unshift({ role: 'user', parts: [{ text: `System Instruction:\n${systemText}` }] });
        // To maintain alternating roles, insert a dummy model response if next is user
        if (contents.length > 1 && contents[1].role === 'user') {
            contents.splice(1, 0, { role: 'model', parts: [{ text: 'Acknowledged.' }] });
        }
      }
    }

    // fallow-ignore-next-line code-duplication
    const payload: any = {
      contents,
      generationConfig: {
        temperature: request.temperature ?? 0.7,
      },
    };

    if (systemText && !model.toLowerCase().includes('gemma')) {
      payload.systemInstruction = {
        parts: [{ text: systemText }]
      };
    }

    if (request.webSearch) {
      payload.tools = [
        {
          googleSearchRetrieval: {
            dynamicRetrievalConfig: {
              mode: 'MODE_DYNAMIC',
              dynamicThreshold: 0.7,
            },
          },
        },
      ];
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      throw new Error(`Gemini API Error ${res.status}: ${res.statusText}`);
    }

    const reader = res.body!.getReader();
    const decoder = new TextDecoder('utf-8');

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });

        const lines = chunk.split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const dataStr = line.replace('data: ', '').trim();
            if (!dataStr) continue;

            try {
              const data = JSON.parse(dataStr);
              if (data.candidates && data.candidates[0]?.content?.parts?.[0]?.text) {
                yield data.candidates[0].content.parts[0].text;
              }
            } catch (error: any) {
              // ignore parse errors for partial chunks
            }
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
}
