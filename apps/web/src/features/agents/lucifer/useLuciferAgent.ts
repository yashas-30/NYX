import { useCallback } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Channel } from '@tauri-apps/api/core';
import { useLuciferStore } from './useLuciferStore';
import { luciferAgentService } from './luciferAgent.service';

export interface LuciferRequest {
  provider: string;
  model_id: string;
  messages: Array<{ role: string; content: any }>;
  system_instruction?: string;
  api_key: string;
  event_name?: string;
}

export interface StreamPayload {
  type: string;
  content?: string;
  done?: boolean;
  error?: string;
  /** Structured tool call — preferred over magic-string scanning */
  tool_call?: {
    name: string;
    args?: Record<string, any>;
  };
  /** Tool name shorthand for backward-compat with Rust events */
  name?: string;
  tool_name?: string;
  tool_args?: Record<string, any>;
  result?: any;
}

export function useLuciferAgent() {
  const { setAnalysis, setActiveTool, addLog, setImagePrompt, setVoiceText } = useLuciferStore();

  const runTurn = useCallback(
    async (
      request: LuciferRequest,
      onProgress: (chunk: string, fullText: string) => void,
      onError: (err: string) => void
    ) => {
      let accumulatedText = '';

      // FIX: Pass the FULL messages array (not just last message text) so the
      // ConversationContextAnalyzer has complete history for decontextualization,
      // topic threading, entity resolution, and previous-response detection.
      const analysis = await luciferAgentService.analyzeTurn(
        request.messages,
        request.provider,
        request.api_key // used for OpenRouter capability fetching
      );

      setAnalysis(analysis);
      addLog({
        type: 'info',
        title: `Lucifer Turn Initialized (${analysis.intent})`,
        details: `Model: ${request.model_id} | Provider: ${request.provider} | Tools: [${analysis.requires_tools.join(', ') || 'none'}] | Confidence: ${(analysis.confidence * 100).toFixed(0)}%`,
      });

      // If this is a capability query, fetch and inject the capability card
      // into the store before enriching the system prompt.
      if (analysis.intent === 'model_capabilities') {
        try {
          await luciferAgentService.getModelCapabilityCard(
            request.model_id,
            request.provider,
            request.api_key
          );
        } catch (err) {
          console.warn('[useLuciferAgent] Capability card fetch failed:', err);
        }
      }

      // BUG FIX: Pass model_id and provider so persona reflects the live model selection.
      // Also passes capability card (from store) and previous response snippet when available.
      const enrichedRequest = {
        ...request,
        system_instruction: luciferAgentService.enrichSystemPrompt(
          request.system_instruction,
          analysis,
          request.model_id,
          request.provider
        ),
      };

      try {
        const onEvent = new Channel<StreamPayload>();
        onEvent.onmessage = (payload) => {
          // ── Error handling ────────────────────────────────────────────────
          if (payload.type === 'error' || payload.error) {
            const err = payload.error || 'Lucifer turn error';
            addLog({ type: 'error', title: 'Execution Error', details: err });
            onError(err);
            return;
          }

          // ── Text streaming ────────────────────────────────────────────────
          if (payload.content && (payload.type === 'text' || payload.type === 'content')) {
            accumulatedText += payload.content;
            onProgress(payload.content, accumulatedText);
          }

          // ── Structured tool_call events (2026 standard) ───────────────────
          if (payload.type === 'tool_start' || payload.type === 'tool_call') {
            const toolName =
              payload.tool_call?.name ||
              payload.name ||
              payload.tool_name ||
              'native_tool';

            const toolArgs = payload.tool_call?.args || payload.tool_args || {};

            setActiveTool(toolName);
            addLog({ type: 'tool_call', title: `Executing Tool: ${toolName}` });

            if (toolName === 'generate_image' && toolArgs.prompt) {
              setImagePrompt(toolArgs.prompt);
              addLog({ type: 'image_req', title: 'Image Generation Dispatched', details: toolArgs.prompt });
            }

            if (toolName === 'synthesize_voice' && toolArgs.text) {
              setVoiceText(toolArgs.text);
              addLog({ type: 'voice_req', title: 'Voice Synthesis Dispatched', details: toolArgs.text });
            }
          }

          // ── Tool result ───────────────────────────────────────────────────
          if (payload.type === 'tool_result') {
            const toolName = payload.tool_name || payload.name || 'native_tool';
            addLog({ type: 'tool_result', title: `Tool Result: ${toolName}` });
          }

          // ── Turn completion ───────────────────────────────────────────────
          if (payload.done || payload.type === 'done') {
            setActiveTool(null);
            addLog({ type: 'info', title: 'Lucifer Turn Completed' });
          }
        };

        await invoke('run_lucifer_turn', { request: enrichedRequest, onEvent });
      } catch (err: any) {
        const errStr = String(err);
        addLog({ type: 'error', title: 'Lucifer Invocation Error', details: errStr });
        onError(errStr);
      }
    },
    [setAnalysis, setActiveTool, addLog, setImagePrompt, setVoiceText]
  );

  return { runTurn };
}
