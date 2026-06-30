const fs = require('fs');
let code = fs.readFileSync('e:/NYX/server/lib/unifiedEngine.ts', 'utf8');

const regex = /private static async streamLocal\([\s\S]*?private static formatPrompt\(/;

const replacement = `private static async checkOllama(model: string): Promise<boolean> {
    try {
      const res = await fetch('http://127.0.0.1:11434/api/tags', { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        const data = await res.json();
        return data.models?.some((m: any) => m.name === model || m.name.includes(model));
      }
    } catch {}
    return false;
  }

  private static async checkLMStudio(model: string): Promise<boolean> {
    try {
      const res = await fetch('http://127.0.0.1:1234/v1/models', { signal: AbortSignal.timeout(500) });
      if (res.ok) {
        const data = await res.json();
        return data.data?.some((m: any) => m.id === model || m.id.includes(model));
      }
    } catch {}
    return false;
  }

  private static async streamLocal(
    model: string,
    messages: any[],
    settings: any,
    onChunk: (chunk: StreamChunk) => void,
    onComplete: () => void
  ) {
    // 1. Check Ollama
    if (await this.checkOllama(model)) {
      const response = await fetch('http://127.0.0.1:11434/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          options: {
            temperature: settings?.temperature ?? 0.7,
            num_predict: settings?.maxTokens ?? 4096,
            top_p: settings?.topP ?? 1.0,
          },
          stream: true,
        }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (!line.trim()) continue;
          try {
            const data = JSON.parse(line);
            if (data.message?.content) onChunk({ chunk: data.message.content });
          } catch {}
        }
      }
      onComplete();
      return;
    }

    // 2. Check LM Studio
    if (await this.checkLMStudio(model)) {
      const response = await fetch('http://127.0.0.1:1234/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature: settings?.temperature ?? 0.7,
          max_tokens: settings?.maxTokens ?? 4096,
          top_p: settings?.topP ?? 1.0,
          stream: true,
        }),
      });
      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');
      const decoder = new TextDecoder();
      let buffer = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\\n');
        buffer = lines.pop() || '';
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') continue;
            try {
              const data = JSON.parse(jsonStr);
              const content = data.choices?.[0]?.delta?.content;
              if (content) onChunk({ chunk: content });
            } catch {}
          }
        }
      }
      onComplete();
      return;
    }

    // 3. Fallback to our own llama-server
    let LLAMA_PORT = process.env.LLAMA_PORT || LOCAL_MODEL_PORT;
    try {
       const runner = require('../../server/features/local-models/localModelRunner.ts');
       if (runner && runner.getLlamaPort) {
         LLAMA_PORT = runner.getLlamaPort();
       }
    } catch (e) {}

    const response = await fetch(\`http://127.0.0.1:\${LLAMA_PORT}/completion\`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: this.formatPrompt(messages),
        temperature: settings?.temperature ?? 0.7,
        n_predict: settings?.maxTokens ?? 4096,
        stream: true,
      }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error('No response body');
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\\n');
      buffer = lines.pop() || '';
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) onChunk({ chunk: data.content });
          } catch (e) {}
        }
      }
    }
    onComplete();
  }

  private static formatPrompt(`;

code = code.replace(regex, replacement);
fs.writeFileSync('e:/NYX/server/lib/unifiedEngine.ts', code);
console.log('StreamLocal replaced');
