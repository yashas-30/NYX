import { Gateway } from '../../lib/gateway.ts';

export class OpenCodeService {
  private static SYSTEM_KEY = process.env.OPENROUTER_API_KEY || process.env.LLM_API_KEY || '';

  prepareRequest(params: {
    model: string;
    prompt: string;
    apiKey?: string;
    settings?: any;
    systemInstruction?: string;
    history?: any[];
    gatewayUrls?: Record<string, string>;
  }) {
    const { model, prompt, apiKey, settings, systemInstruction, history, gatewayUrls } = params;
    
    // Resolve active key
    const isUserKey = (apiKey && apiKey.trim() !== '' && apiKey !== 'null' && apiKey !== 'undefined');
    const activeKey = isUserKey ? apiKey!.trim() : OpenCodeService.SYSTEM_KEY;

    // Validation
    const authResult = Gateway.validateAuth('opencode', model, apiKey);
    if (!authResult.valid) {
      throw new Error(authResult.error || 'Authentication failed');
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

    // Build URL
    const { url } = Gateway.buildUrl('opencode', '/chat/completions', gatewayUrls);

    return {
      url,
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${activeKey}`,
        'HTTP-Referer': 'http://localhost:3000',
        'X-Title': 'LLM Reference - OpenCode Zen',
      },
      body: {
        model: mappedModel,
        messages,
        stream: true,
        temperature: settings?.temperature ?? 0.7,
        max_tokens: settings?.maxTokens ?? 4096,
        top_p: settings?.topP ?? 1.0,
      }
    };
  }
}
