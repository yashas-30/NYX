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
  tool_call?: any;
  name?: string;
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
      const promptText = request.messages[request.messages.length - 1]?.content || '';
      const analysis = await luciferAgentService.analyzeTurn(
        typeof promptText === 'string' ? promptText : JSON.stringify(promptText),
        request.provider
      );

      setAnalysis(analysis);
      addLog({
        type: 'info',
        title: `Lucifer Turn Initialized (${analysis.intent})`,
        details: `Model: ${request.model_id} | Provider: ${request.provider}`,
      });

      const enrichedRequest = {
        ...request,
        system_instruction: luciferAgentService.enrichSystemPrompt(request.system_instruction, analysis),
      };

      try {
        const onEvent = new Channel<StreamPayload>();
        onEvent.onmessage = (payload) => {
          if (payload.type === 'error' || payload.error) {
            const err = payload.error || 'Lucifer turn error';
            addLog({ type: 'error', title: 'Execution Error', details: err });
            onError(err);
            return;
          }

          if (payload.content) {
            accumulatedText += payload.content;
            onProgress(payload.content, accumulatedText);

            // Detect image or voice triggers in response stream
            if (payload.content.includes('pending_synthesis') || accumulatedText.includes('generate_image')) {
              try {
                const match = accumulatedText.match(/"prompt":\s*"([^"]+)"/);
                if (match?.[1]) {
                  setImagePrompt(match[1]);
                  addLog({ type: 'image_req', title: 'Image Generation Dispatched', details: match[1] });
                }
              } catch {}
            }

            if (payload.content.includes('pending_audio') || accumulatedText.includes('synthesize_voice')) {
              try {
                const match = accumulatedText.match(/"text":\s*"([^"]+)"/);
                if (match?.[1]) {
                  setVoiceText(match[1]);
                  addLog({ type: 'voice_req', title: 'Voice Synthesis Dispatched', details: match[1] });
                }
              } catch {}
            }
          }

          if (payload.type === 'tool_start' || payload.type === 'tool_call') {
            const toolName = payload.name || 'native_tool';
            setActiveTool(toolName);
            addLog({ type: 'tool_call', title: `Executing Tool: ${toolName}` });
          }

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
