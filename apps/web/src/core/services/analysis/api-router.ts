/**
 * @file services/analysis/api-router.ts
 * @description LLM routing with multi-provider support.
 */

import type { LLMRouter, ChatMessage } from './types';

export class APIRouter implements LLMRouter {
  private readonly apiKey?: string;
  private readonly ollamaEndpoint = 'http://localhost:11434';

  constructor(apiKey?: string) {
    this.apiKey = apiKey;
  }

  async route(prompt: string, history?: string[]): Promise<Partial<import('@src/types/agent').PromptAnalysis>> {
    const messages = this.buildMessages(prompt, history);

    try {
      return await this.callGemini(messages);
    } catch (e) {
      try {
        return await this.callGroq(messages);
      } catch (e) {
        return await this.callOllama(messages);
      }
    }
  }

  private async callGemini(messages: ChatMessage[]): Promise<Partial<import('@src/types/agent').PromptAnalysis>> {
    if (!this.apiKey) throw new Error('No API key');
    const response = await fetch(
      'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + this.apiKey,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: messages.map(m => ({
            role: m.role === 'user' ? 'user' : 'model',
            parts: [{ text: m.content }]
          }))
        })
      }
    );
    if (!response.ok) throw new Error('Gemini failed');
    const data = await response.json();
    return this.parseLLMResponse(data.candidates?.[0]?.content?.parts?.[0]?.text);
  }

  private async callGroq(messages: ChatMessage[]): Promise<Partial<import('@src/types/agent').PromptAnalysis>> {
    if (!this.apiKey) throw new Error('No API key');
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.apiKey}`
      },
      body: JSON.stringify({
        model: 'llama-3.3-70b-versatile',
        messages,
        max_tokens: 200,
        temperature: 0.1
      })
    });
    if (!response.ok) throw new Error('Groq failed');
    const data = await response.json();
    return this.parseLLMResponse(data.choices?.[0]?.message?.content);
  }

  private async callOllama(messages: { role: string; content: string }[]): Promise<Partial<import('@src/types/agent').PromptAnalysis>> {
    const response = await fetch(`${this.ollamaEndpoint}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'llama3.2',
        messages,
        stream: false,
        options: { temperature: 0.1, num_predict: 200 }
      })
    });
    if (!response.ok) throw new Error('Ollama failed');
    const data = await response.json();
    return this.parseLLMResponse(data.message?.content);
  }

  private buildMessages(prompt: string, history?: string[]): ChatMessage[] {
    const analysisPrompt = `Analyze this user prompt and return JSON with: intent (question/code/search/command/conversation), domain, tone (casual/professional/technical), requiresWebSearch (bool), requiresReasoning (bool), complexity (1/2/3). Prompt: "${prompt}"`;
    const messages: ChatMessage[] = [{ role: 'system', content: 'You are a prompt analysis assistant. Return only JSON.' }];
    if (history) messages.push(...history.slice(-4).map(h => ({ role: 'user', content: h })));
    messages.push({ role: 'user', content: analysisPrompt });
    return messages;
  }

  private parseLLMResponse(response?: string): Partial<import('@src/types/agent').PromptAnalysis> {
    if (!response) return {};
    try {
      const match = response.match(/\{[\s\S]*\}/);
      if (!match) return {};
      const parsed = JSON.parse(match[0]);
      return {
        intent: parsed.intent,
        tone: parsed.tone,
        domain: parsed.domain,
        requiresWebSearch: parsed.requiresWebSearch,
        requiresReasoning: parsed.requiresReasoning,
        estimatedComplexity: parsed.complexity,
        confidence: 0.9,
      };
    } catch {
      return {};
    }
  }
}
