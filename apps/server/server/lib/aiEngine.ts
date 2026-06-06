/**
 * @file server/lib/unifiedEngine.ts
 * @description Unified streaming execution engine using the Gateway service.
 */

import { Gateway, Provider, ChatMessage, AISettings } from './gateway.js';
import { env } from '../config/env.js';
import { SmartRouter } from './router.js';
import { loadKeys } from '../features/vault/vault.service.js';
import { compressPrompt } from '../features/prompts/compression.js';

export type { Provider, ChatMessage, AISettings } from './gateway.js';

// ── Layer 7: Abstention Training ──────────────────────────────────────────────
// Injected into all system prompts to reduce hallucinations by encouraging
// the model to say "I don't know" rather than guess wrong answers.
const ABSTENTION_INSTRUCTION = `
IMPORTANT: If you are unsure about an API, function, library, or implementation detail, or if the context does not contain sufficient information to answer accurately, explicitly state "I don't have enough context to answer this reliably" rather than guessing. Accuracy over completeness. Never hallucinate imports, library names, or function signatures.`.trim();

/**
 * Injects abstention instruction into the last system message, or prepends a new one.
 */
function injectAbstentionInstruction(messages: ChatMessage[]): ChatMessage[] {
  const systemIdx = messages.findIndex((m) => m.role === 'system');
  if (systemIdx >= 0) {
    const updated = [...messages];
    updated[systemIdx] = {
      ...updated[systemIdx],
      content: `${updated[systemIdx].content}\n\n${ABSTENTION_INSTRUCTION}`,
    };
    return updated;
  }
  return [{ role: 'system', content: ABSTENTION_INSTRUCTION }, ...messages];
}

export interface UnifiedRequest {
  provider: Provider;
  model: string;
  messages: ChatMessage[];
  settings?: AISettings;
  apiKey?: string;
  baseUrl?: string;
  signal?: AbortSignal;
  customGatewayUrls?: Record<string, string>;
  tools?: any[];
}

export class UnifiedEngine {
  /**
   * Main entry point for streaming AI requests.
   * Validates auth, routes to appropriate provider handler.
   */
  static async executeStream(
    req: UnifiedRequest,
    writeChunk: (chunk: any) => void,
    onDone: () => void
  ): Promise<void> {
    let { provider, model, messages, settings, apiKey, customGatewayUrls, tools } = req;

    const router = new SmartRouter();
    const apiKeys = await loadKeys();

    if (apiKey) {
      apiKeys[provider] = apiKey;
    }

    if (provider !== 'nyx-native' && provider !== 'antigravity-sdk') {
      try {
        const prompt = messages[messages.length - 1]?.content || '';
        const decision = await router.route(prompt, {
          primary: { provider: provider as any, id: model, name: model, description: '' },
          fallbacks: [
            { provider: 'openrouter' as any, id: 'anthropic/claude-3.5-sonnet', name: 'Claude 3.5 Sonnet', description: '' },
            { provider: 'gemini', id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash', description: '' }
          ]
        }, apiKeys);

        provider = decision.provider;
        model = decision.modelId;
        apiKey = decision.apiKey;
      } catch (err: any) {
        console.warn('[SmartRouter] Routing failed, falling back to original request:', err.message);
      }
    }

    // 1. Auth validation
    const authResult = Gateway.validateAuth(provider, model, apiKey);
    if (!authResult.valid) {
      throw new Error(authResult.error);
    }

    const activeKey = apiKey || Gateway.getActiveKey(provider, apiKey);

    // Prompt pre-processing middleware using Antigravity service
    let processedMessages = messages;
    if (settings?.antigravity) {
      const userMessages = messages.filter((m) => m.role === 'user');
      if (userMessages.length > 0) {
        const lastUserMessage = userMessages[userMessages.length - 1];
        const originalPrompt = lastUserMessage.content;

        try {
          const port = env.ANTIGRAVITY_PORT || 3003;
          const activeGeminiKey = Gateway.getActiveKey(
            'gemini',
            provider === 'gemini' ? apiKey : undefined
          );

          let domain = 'general';
          if (
            originalPrompt.includes('```') ||
            originalPrompt.includes('function') ||
            originalPrompt.includes('class')
          ) {
            domain = 'coding';
          } else if (
            originalPrompt.toLowerCase().includes('story') ||
            originalPrompt.toLowerCase().includes('creative')
          ) {
            domain = 'creative';
          }

          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), 10000); // 10s timeout

          const preprocessRes = await fetch(`http://127.0.0.1:${port}/preprocess`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              prompt: originalPrompt,
              apiKey: activeGeminiKey,
              domain,
            }),
            signal: controller.signal,
          });
          clearTimeout(timeoutId);

          if (preprocessRes.ok) {
            const data: any = await preprocessRes.json();
            if (data && typeof data.prompt === 'string') {
              const lastUserIdx = messages.lastIndexOf(lastUserMessage);
              if (lastUserIdx >= 0) {
                processedMessages = [...messages];
                processedMessages[lastUserIdx] = {
                  ...processedMessages[lastUserIdx],
                  content: data.prompt,
                };

                try {
                  const { db } = await import('../db/client.js');
                  const { promptOptimizations } = await import('../db/schema.js');
                  const { randomUUID } = await import('crypto');

                  const optimizationId = randomUUID();
                  await db.insert(promptOptimizations).values({
                    id: optimizationId,
                    originalPrompt,
                    optimizedPrompt: data.prompt,
                    domain: data.domain || domain,
                    version: data.version || 'unknown',
                    timestamp: Date.now(),
                  });

                  console.log(
                    `[Antigravity Middleware] Optimized prompt successfully (ID: ${optimizationId}).`
                  );
                  writeChunk({ chunk: `\n\n<!-- ANTIGRAVITY_META:${optimizationId} -->\n\n` });
                } catch (dbErr) {
                  console.error('[Antigravity Middleware] Failed to log optimization:', dbErr);
                }
              }
            }
          }
        } catch (err: any) {
          console.warn(
            '[Antigravity Middleware] Prompt preprocessing failed (non-fatal):',
            err.message
          );
        }
      }
    }

    // Apply Abstention Training
    processedMessages = injectAbstentionInstruction(processedMessages);

    // Apply Prompt Compression
    // Set maxTokens to a safe limit, e.g., 64,000 tokens
    const MAX_TOKENS = 64000;
    processedMessages = processedMessages.map(m => {
      if (m.role === 'user') {
        return {
          ...m,
          content: compressPrompt(m.content, MAX_TOKENS)
        };
      }
      return m;
    });

    // 2. Route to provider-specific handler
    switch (provider) {
      case 'gemini':
        return this.streamGemini(
          model,
          processedMessages,
          activeKey,
          settings,
          customGatewayUrls,
          tools,
          writeChunk,
          onDone
        );

      case 'nyx-native':
        return this.streamNyxNative(model, processedMessages, settings, writeChunk, onDone);

      case 'antigravity-sdk':
        return this.streamAntigravitySdk(model, processedMessages, activeKey, writeChunk, onDone);

      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }
  }

  // ─── Provider-specific streamers ───────────────────────────────────────────

  private static resolveRealGeminiModel(model: string): string {
    const modelMap: Record<string, string> = {
      'gemma-4-31b-it': 'gemma-4-31b-it',
      'gemma-4-27b-it': 'gemma-4-26b-a4b-it',
      'gemini-3.5-flash': 'gemini-3.5-flash',
      'gemini-3-flash': 'gemini-3-flash-preview',
      'gemini-3.1-pro': 'gemini-3.1-pro-preview',
      'gemini-2.5-flash': 'gemini-2.5-flash',
    };
    return modelMap[model] || model;
  }

  /**
   * Streams responses from Gemini using Google's generative language API.
   * Supports system instructions and Gemini-specific generation config.
   * @param model - Gemini model identifier (e.g., 'gemini-2.5-flash')
   * @param messages - Array of chat messages
   * @param apiKey - Gemini API key
   * @param settings - Optional generation settings
   * @param write - Callback for writing chunks to response
   * @param done - Callback when stream completes
   */
  private static async streamGemini(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    settings: AISettings | undefined,
    customGatewayUrls: Record<string, string> | undefined,
    tools: any[] | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const realModel = this.resolveRealGeminiModel(model);
    const { url } = Gateway.buildUrl(
      'gemini',
      `/models/${realModel}:streamGenerateContent?alt=sse&key=${apiKey}`,
      customGatewayUrls
    );
    const { contents, systemInstruction } = Gateway.formatMessages(messages, 'gemini');

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // fallow-ignore-next-line code-duplication
      body: JSON.stringify({
        contents,
        systemInstruction: systemInstruction
          ? { parts: [{ text: systemInstruction + '\n\n' + ABSTENTION_INSTRUCTION }] }
          : { parts: [{ text: ABSTENTION_INSTRUCTION }] },
        generationConfig: {
          temperature: settings?.temperature ?? 0.1, // Near-greedy for code accuracy
          maxOutputTokens: settings?.maxTokens,
          topP: settings?.topP ?? 0.9,
          topK: settings?.topK ?? 20,
        },
        tools: tools,
      }),
    });

    if (!response.ok) throw new Error(`Gemini API Error: ${response.status}`);

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => {
        throw new Error(err);
      },
    });
  }

  /**
   * Streams responses from the Python Antigravity SDK service.
   */
  private static async streamAntigravitySdk(
    model: string,
    messages: ChatMessage[],
    apiKey: string,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const port = env.ANTIGRAVITY_PORT || 3003;
    const lastUserMessage = messages.filter((m) => m.role === 'user').pop();
    const prompt = lastUserMessage ? lastUserMessage.content : '';

    const response = await fetch(`http://127.0.0.1:${port}/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // fallow-ignore-next-line code-duplication
      body: JSON.stringify({ prompt, model, apiKey }),
    });

    if (!response.ok) throw new Error(`Antigravity SDK Error: ${response.status}`);

    await Gateway.processSSEStream(response, {
      onChunk: (text) => write({ chunk: text }),
      onDone: done,
      onError: (err) => {
        throw new Error(err);
      },
    });
  }

  /**
   * Streams responses from local GGUF model executed via NYX's native runner.
   * Connects directly to localhost:12345.
   * Layer 4 — Chain-of-Verification (CoVe): After streaming the main response,
   * a non-streaming verifier pass checks for hallucinated APIs, broken syntax,
   * and invalid imports. Research shows CoVe improves F1 scores by 23%.
   */
  private static async streamNyxNative(
    model: string,
    messages: ChatMessage[],
    settings: AISettings | undefined,
    write: (chunk: any) => void,
    done: () => void
  ): Promise<void> {
    const url = 'http://127.0.0.1:12345/v1/chat/completions';
    const augmentedMessages = injectAbstentionInstruction(
      messages.map((m) => ({ role: m.role, content: m.content }))
    );

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: augmentedMessages,
        stream: true,
        temperature: settings?.temperature ?? 0.1, // Layer 1: Near-greedy, reduces hallucinations
        max_tokens: settings?.maxTokens ?? 4096,
        top_p: settings?.topP ?? 0.9, // Nucleus sampling
        top_k: settings?.topK ?? 20, // Top-K filter
        min_p: (settings as any)?.minP ?? 0.05, // Layer 1: MinP prevents wildly improbable tokens
      }),
    });

    if (!response.ok) {
      throw new Error(
        `Native GGUF Runner Error: ${response.status}. Make sure the model is loaded in RAM.`
      );
    }

    // Collect the full draft response while streaming it to the client
    let fullDraftResponse = '';
    await Gateway.processSSEStream(response, {
      onChunk: (text) => {
        fullDraftResponse += text;
        write({ chunk: text });
      },
      onDone: () => {}, // We call done() after CoVe below
      onError: (err) => {
        throw new Error(err);
      },
    });

    // ── Layer 4: Chain-of-Verification (CoVe) ────────────────────────────────
    // Only run verification if the response contains code blocks (most likely a code task).
    // This avoids latency overhead on pure chat responses.
    const hasCode =
      fullDraftResponse.includes('```') ||
      fullDraftResponse.includes('function ') ||
      fullDraftResponse.includes('class ');

    if (hasCode && fullDraftResponse.length > 50) {
      try {
        const verifierPrompt = `You are a strict code verifier. Review the following AI-generated response for factual correctness:\n1. All APIs, functions, and methods used actually exist in the specified language/framework\n2. Syntax is valid for the target language\n3. No hallucinated imports, packages, or dependencies\n4. Logic is sound and won't cause obvious runtime errors\n\nIf everything is correct, respond with exactly: VERIFIED\nIf issues are found, list them concisely (max 3 bullets).\n\n--- CODE TO VERIFY ---\n${fullDraftResponse.slice(0, 3000)}`;

        const verifyResponse = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model,
            messages: [{ role: 'user', content: verifierPrompt }],
            stream: false,
            temperature: 0.0, // Fully deterministic for verification
            max_tokens: 256,
          }),
        });

        if (verifyResponse.ok) {
          const verifyData = await verifyResponse.json() as any;
          const verifyResult: string = verifyData?.choices?.[0]?.message?.content || '';
          if (verifyResult && !verifyResult.startsWith('VERIFIED')) {
            // Emit verification issues as a special chunk so the frontend can display them
            write({ chunk: `\n\n---\n**⚠ NYX Code Verifier:**\n${verifyResult}` });
            console.log('[CoVe] Verification found issues:', verifyResult.slice(0, 200));
          } else {
            console.log('[CoVe] Response verified: PASSED');
          }
        }
      } catch (verifyErr: any) {
        // CoVe failure is non-fatal — the original response was already streamed
        console.warn('[CoVe] Verification step failed (non-fatal):', verifyErr.message);
      }
    }
    done();
  }
}
