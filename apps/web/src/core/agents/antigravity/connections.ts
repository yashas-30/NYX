/**
 * @file src/core/agents/antigravity/connections.ts
 * @description Layer 3 Adapter: Multi-provider transport and backend abstraction.
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import { TOOL_REGISTRY } from '@src/infrastructure/services/toolSystem';
import { LocalAgentConfig, McpStdioServer } from './types';
import { useAppStore } from '@src/stores/useAppStore';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { getEffectiveApiKey } from '@src/infrastructure/utils/provider';

export interface StreamCallbacks {
  onToken?: (token: string) => void;
  onThought?: (thought: string) => void;
  onToolCall?: (call: { id: string; name: string; args: any }) => void;
  onError?: (err: string) => void;
  onFinish?: () => void;
}

export interface Connection {
  send(messages: any[], callbacks: StreamCallbacks): Promise<void>;
  close(): Promise<void>;
}

export interface ConnectionStrategy {
  createConnection(config?: LocalAgentConfig): Promise<Connection>;
}

export function resolveActiveModelAndProvider(config?: LocalAgentConfig): {
  model: string;
  provider: string;
} {
  const storeApp = useAppStore.getState();
  const storeNyx = useNyxStore.getState();

  const appSelectedModelId =
    typeof storeApp.selectedModel === 'string'
      ? (storeApp.selectedModel as unknown as string)
      : storeApp.selectedModel?.id;

  const appSelectedProvider =
    typeof storeApp.selectedModel === 'object' ? storeApp.selectedModel?.provider : undefined;

  const model = config?.model || storeNyx.currentModel?.id || appSelectedModelId || '';

  const provider =
    config?.provider ||
    storeNyx.currentModel?.provider ||
    appSelectedProvider ||
    (model.includes('/') ? model.split('/')[0] : 'gemini');

  return { model, provider };
}

export class LocalConnection implements Connection {
  constructor(private config?: LocalAgentConfig) {}

  public async send(messages: any[], callbacks: StreamCallbacks): Promise<void> {
    const storeApp = useAppStore.getState();
    const storeNyx = useNyxStore.getState();

    const { model, provider } = resolveActiveModelAndProvider(this.config);

    const mergedKeys = { ...(storeApp.apiKeys || {}), ...(storeNyx.apiKeys || {}) };
    const apiKey =
      this.config?.api_key ||
      getEffectiveApiKey(provider, mergedKeys) ||
      (mergedKeys as Record<string, string>)[provider] ||
      '';

    const onProgress = new Channel<any>();
    onProgress.onmessage = (msg: any) => {
      if (!msg) return;

      const evType = msg.type || msg.event_type || msg.event;
      if (evType === 'thinking' || evType === 'reasoning_delta' || evType === 'thinking_delta') {
        const delta = msg.content || msg.data?.delta || msg.data?.text || '';
        if (delta && callbacks.onThought) callbacks.onThought(delta);
      } else if (evType === 'text' || evType === 'text_delta' || evType === 'delta') {
        const delta = msg.content || msg.data?.delta || msg.data?.text || '';
        if (delta && callbacks.onToken) callbacks.onToken(delta);
      } else if (msg.event === 'tool_call' || msg.event === 'tool_calls') {
        const calls = Array.isArray(msg.data) ? msg.data : [msg.data];
        for (const call of calls) {
          if (call && call.name && callbacks.onToolCall) {
            callbacks.onToolCall({
              id: call.id || `call_${Date.now()}_${call.name}`,
              name: call.name,
              args:
                typeof call.arguments === 'string'
                  ? JSON.parse(call.arguments)
                  : call.arguments || {},
            });
          }
        }
      } else if (msg.event === 'error') {
        if (callbacks.onError) callbacks.onError(msg.data?.message || 'Stream error');
      } else if (msg.event === 'done' || msg.event === 'finish') {
        if (callbacks.onFinish) callbacks.onFinish();
      }
    };

    const sharedReq: any = {
      provider,
      model_id: model,
      api_key: apiKey,
      messages,
      temperature: this.config?.temperature ?? 0.7,
      top_p: 0.95,
      system_instruction: this.config?.system_instructions || undefined,
      event_name: `antigravity_stream_${Date.now()}`,
      max_tokens: 4096,
      reasoning_enabled: true,
      tools: TOOL_REGISTRY,
      web_search_enabled: true,
    };

    if (provider === 'nyx-native') {
      await invoke('llm_local_stream_request', {
        req: sharedReq,
        onEvent: onProgress,
      });
    } else {
      await invoke('llm_stream_request', {
        req: sharedReq,
        onEvent: onProgress,
      });
    }
  }

  public async close(): Promise<void> {}
}

export class PythonSdkConnection implements Connection {
  constructor(private config?: LocalAgentConfig) {}

  public async send(messages: any[], callbacks: StreamCallbacks): Promise<void> {
    const storeApp = useAppStore.getState();
    const storeNyx = useNyxStore.getState();

    const { model, provider } = resolveActiveModelAndProvider(this.config);

    const mergedKeys = { ...(storeApp.apiKeys || {}), ...(storeNyx.apiKeys || {}) };
    const apiKey =
      this.config?.api_key ||
      getEffectiveApiKey(provider, mergedKeys) ||
      (mergedKeys as Record<string, string>)[provider] ||
      '';

    let prompt = '';
    const lastMsg = messages[messages.length - 1];
    if (typeof lastMsg?.content === 'string') {
      prompt = lastMsg.content;
    } else if (Array.isArray(lastMsg?.content)) {
      prompt = lastMsg.content.map((p: any) => p.text || '').join('\n');
    }

    const onProgress = new Channel<any>();
    onProgress.onmessage = (msg: any) => {
      if (!msg) return;
      if (msg.event === 'token' && callbacks.onToken) {
        callbacks.onToken(msg.data);
      } else if (msg.event === 'thought' && callbacks.onThought) {
        callbacks.onThought(msg.data);
      } else if (msg.event === 'tool_call' && callbacks.onToolCall) {
        callbacks.onToolCall(msg.data);
      } else if (msg.event === 'error' && callbacks.onError) {
        callbacks.onError(msg.data);
      } else if (msg.event === 'done' && callbacks.onFinish) {
        callbacks.onFinish();
      }
    };

    try {
      await invoke('run_antigravity_python_agent', {
        req: {
          provider,
          model,
          api_key: apiKey,
          prompt,
          system_instructions: this.config?.system_instructions || undefined,
          capabilities: this.config?.capabilities || undefined,
        },
        onEvent: onProgress,
      });
    } catch (err: any) {
      console.warn(
        '[PythonSdkConnection] Python bridge error, falling back to LocalConnection:',
        err
      );
      const fallback = new LocalConnection(this.config);
      await fallback.send(messages, callbacks);
    }
  }

  public async close(): Promise<void> {}
}

export class PythonSdkConnectionStrategy implements ConnectionStrategy {
  constructor(private config?: LocalAgentConfig) {}

  public async createConnection(config?: LocalAgentConfig): Promise<Connection> {
    return new PythonSdkConnection(config || this.config);
  }
}

export class LocalConnectionStrategy implements ConnectionStrategy {
  constructor(private config?: LocalAgentConfig) {}

  public async createConnection(config?: LocalAgentConfig): Promise<Connection> {
    return new LocalConnection(config || this.config);
  }
}

export class McpConnectionStrategy implements ConnectionStrategy {
  constructor(private mcpServers: McpStdioServer[] = []) {}

  public async createConnection(config?: LocalAgentConfig): Promise<Connection> {
    return new LocalConnection(config);
  }
}
