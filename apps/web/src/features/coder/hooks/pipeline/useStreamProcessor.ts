import { useCallback } from 'react';
import { ChatMessage } from '@src/infrastructure/types';

interface StreamProcessorProps {
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  handleFileWrite: (filePath: string, content: any) => Promise<void>;
  processChunkMetrics: (meta: any) => void;
}

export const useStreamProcessor = ({
  updateHistory,
  handleFileWrite,
  processChunkMetrics,
}: StreamProcessorProps) => {
  const processStream = useCallback(
    async (agentStream: AsyncGenerator<any, void, unknown>): Promise<string> => {
      let lastStreamText = '';

      for await (const chunk of agentStream) {
        switch (chunk.type) {
          case 'thinking':
            updateHistory((prev) => {
              const h = [...prev];
              const last = h[h.length - 1];
              if (last?.role === 'assistant') {
                last.content = `_${chunk.content}_`;
              }
              return h;
            });
            break;

          case 'file_write':
            if (
              chunk.content &&
              chunk.metadata &&
              typeof chunk.metadata === 'object' &&
              'content' in chunk.metadata
            ) {
              const fileContent = (chunk.metadata as Record<string, any>).content;
              await handleFileWrite(chunk.content, fileContent);
            }
            break;

          case 'text':
            lastStreamText = chunk.content || '';
            if (chunk.metadata) {
              processChunkMetrics(chunk.metadata);
            }
            updateHistory((prev) => {
              const h = [...prev];
              const last = h[h.length - 1];
              if (last?.role === 'assistant') {
                last.content = chunk.content || '';
              }
              return h;
            });
            break;

          case 'tool_call':
            updateHistory((prev) => {
              const h = [...prev];
              const last = h[h.length - 1];
              if (last?.role === 'assistant') {
                const currentToolCalls = last.toolCalls || [];
                last.toolCalls = [
                  ...currentToolCalls,
                  {
                    id: chunk.metadata.id,
                    name: chunk.metadata.function.name,
                    arguments: chunk.metadata.function.arguments,
                  } as any,
                ];
              }
              return h;
            });
            break;

          case 'tool_result':
            updateHistory((prev) => {
              const h = [...prev];
              const last = h[h.length - 1];
              if (last?.role === 'assistant' && last.toolCalls) {
                const callIndex = last.toolCalls.findIndex((tc) => tc.id === chunk.metadata.id);
                if (callIndex !== -1) {
                  last.toolCalls[callIndex] = {
                    ...last.toolCalls[callIndex],
                    status: chunk.metadata.status || 'success',
                    result: chunk.metadata.result || '',
                  };
                }
              }
              return h;
            });
            break;
        }
      }

      return lastStreamText;
    },
    [updateHistory, handleFileWrite, processChunkMetrics]
  );

  return { processStream };
};
