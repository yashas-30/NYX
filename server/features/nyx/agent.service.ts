import { RulesDb } from '../admin/admin.service.ts';
import { loadKeys } from '../vault/vault.service.ts';

interface SubagentStatusEntry {
  tasks: unknown[];
  updatedAt: number;
}

export class AgentService {
  private subagentStatusStore = new Map<string, SubagentStatusEntry>();

  constructor() {
    setInterval(() => {
      const now = Date.now();
      for (const [token, data] of this.subagentStatusStore.entries()) {
        if (now - data.updatedAt > 30 * 60 * 1000) {
          this.subagentStatusStore.delete(token);
        }
      }
    }, 60_000).unref();
  }

  setSubagentStatus(token: string, tasks: unknown[]): void {
    this.subagentStatusStore.set(token, { tasks, updatedAt: Date.now() });
  }

  getSubagentStatus(token: string): unknown[] {
    const data = this.subagentStatusStore.get(token);
    return data?.tasks ?? [];
  }

  getRules() {
    return RulesDb.getRules();
  }

  resetRules() {
    RulesDb.resetRules();
  }

  async runBackgroundCritic(
    userPrompt: string,
    nyxResponse: string,
    modelId?: string,
    provider?: string
  ): Promise<void> {
    console.log('[Background Critic] Starting meta-cognitive analysis...');
    const keys = loadKeys();
    const activeKey = keys[provider || ''] || '';

    const criticSystemPrompt = `
You are the Core Meta-Cognitive Optimizer for an AI coding agent named Nyx. Your task is to analyze the provided chat interaction between a user and Nyx, identify structural or conceptual gaps, and generate a micro-instruction to improve Nyx's next output.

Analyze the interaction based on these criteria:
1. Did Nyx misunderstand the architecture, framework, or logic requested?
2. Did Nyx introduce bugs, missing imports, or incomplete boilerplate code?
3. What unstated assumptions did the user have to correct?

If Nyx's response has bugs, missing imports, bad practices, or lacks critical files, formulate a rule to prevent this.
If the response is correct, clear, and perfectly fulfills the prompt, you MUST set the "rule" field to "No improvement needed" or "None".

Output your response strictly as a single, compact JSON object matching the requested schema:
{
  "metric": "Specific language/framework or pattern",
  "critique": "A brief, 1-sentence explanation of what Nyx missed or did poorly.",
  "rule": "A highly precise, imperative instruction telling Nyx exactly how to handle this scenario next time."
}
    `.trim();

    const conversationPayload = `
[USER PROMPT]:
${userPrompt}

[NYX RESPONSE]:
${nyxResponse}
    `.trim();

    if (modelId && provider) {
      try {
        let responseText = '';
        const keys = loadKeys();
        const activeKey = keys[provider] || '';
        
        console.log(`[Background Critic] Executing meta-critic using selected model ${modelId} (${provider})`);

        if (provider === 'gemini') {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${activeKey}`;
          const contents = [
            { role: 'user', parts: [{ text: conversationPayload }] }
          ];
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: criticSystemPrompt }] },
              generationConfig: { temperature: 0.3, maxOutputTokens: 512 }
            })
          });
          if (!res.ok) throw new Error(`Gemini Critic API error: ${res.statusText}`);
          const data: any = await res.json();
          responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (provider === 'pollinations') {
          const realModel = modelId.replace('pollinations/', '');
          const res = await fetch('https://text.pollinations.ai/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: realModel,
              messages: [
                { role: 'system', content: criticSystemPrompt },
                { role: 'user', content: conversationPayload }
              ],
              stream: false,
              temperature: 0.3
            })
          });
          if (!res.ok) throw new Error(`Pollinations Critic error: ${res.statusText}`);
          responseText = await res.text();
        } else if (provider === 'nyx-native') {
          const res = await fetch('http://127.0.0.1:12345/v1/chat/completions', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelId,
              messages: [
                { role: 'system', content: criticSystemPrompt },
                { role: 'user', content: conversationPayload }
              ],
              stream: false,
              temperature: 0.3,
              max_tokens: 512
            })
          });
          if (!res.ok) throw new Error(`Local GGUF Critic error: ${res.statusText}`);
          const data: any = await res.json();
          responseText = data.choices?.[0]?.message?.content || '';
        } else {
          // OpenAI compatible (openrouter, nvidia, opencode)
          const baseUrl = provider === 'nvidia' 
            ? 'https://integrate.api.nvidia.com/v1' 
            : provider === 'opencode'
              ? 'https://opencode.ai/zen/v1'
              : 'https://openrouter.ai/api/v1';

          const res = await fetch(`${baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${activeKey}`,
              'HTTP-Referer': 'http://localhost:3000',
              'X-Title': 'NYX Critic Layer'
            },
            body: JSON.stringify({
              model: provider === 'opencode' ? modelId.replace('opencode/', '') : modelId,
              messages: [
                { role: 'system', content: criticSystemPrompt },
                { role: 'user', content: conversationPayload }
              ],
              stream: false,
              temperature: 0.3,
              max_tokens: 512
            })
          });
          if (!res.ok) throw new Error(`${provider} Critic API error: ${res.statusText}`);
          const data: any = await res.json();
          responseText = data.choices?.[0]?.message?.content || '';
        }

        if (responseText) {
          const jsonMatch = responseText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const analysis = JSON.parse(jsonMatch[0]);
            const hasImprovement = analysis.rule && 
              !analysis.rule.toLowerCase().includes('no improvement needed') && 
              !analysis.rule.toLowerCase().includes('none');
            if (hasImprovement) {
              RulesDb.addRule(analysis.metric, analysis.critique, analysis.rule);
              console.log(`[Background Critic] Evolution successful! Learned new rule for ${analysis.metric}.`);
            } else {
              console.log('[Background Critic] Interaction evaluated as fully correct. No new adjustments necessary.');
            }
            return;
          }
        }
      } catch (err: any) {
        console.warn('[Background Critic] Selected model run failed, falling back to local Python server:', err.message);
      }
    }

    // Fallback to local Python HF service
    try {
      const hfRes = await fetch('http://127.0.0.1:3002/api/gemini/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: conversationPayload,
          systemInstruction: criticSystemPrompt,
          settings: {
            maxTokens: 512,
            temperature: 0.3
          }
        })
      });

      if (!hfRes.ok) {
        throw new Error(`Failed to call local HF service: ${hfRes.statusText}`);
      }

      const data: any = await hfRes.json();
      const outputText = data.text;
      if (!outputText) {
        console.log('[Background Critic] Empty response received.');
        return;
      }

      const jsonMatch = outputText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.log('[Background Critic] Could not parse JSON block from output:', outputText);
        return;
      }

      const analysis = JSON.parse(jsonMatch[0]);
      const hasImprovement = analysis.rule && 
        !analysis.rule.toLowerCase().includes('no improvement needed') && 
        !analysis.rule.toLowerCase().includes('none');
      if (hasImprovement) {
        RulesDb.addRule(analysis.metric, analysis.critique, analysis.rule);
        console.log(`[Background Critic] Evolution successful! Learned new rule for ${analysis.metric}.`);
      } else {
        console.log('[Background Critic] Interaction evaluated as fully correct. No new adjustments necessary.');
      }
    } catch (error) {
      console.error('[Background Critic] Error during evaluation or parsing:', error);
    }
  }
}
