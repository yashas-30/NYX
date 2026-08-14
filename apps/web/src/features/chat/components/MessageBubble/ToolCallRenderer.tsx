import React, { memo } from 'react';
import { ToolCall } from '@src/infrastructure/types';
import { ContextIngestionCard, ToolCallCard } from '../ChatMessageList';

interface ToolCallRendererProps {
  toolCalls: ToolCall[];
  isStreaming: boolean;
  isLast: boolean;
}

type ToolStatus = 'pending' | 'running' | 'completed' | 'success' | 'error';

const RETRIEVAL_NAMES = ['search', 'read', 'memory', 'query', 'retrieve'] as const;

function getToolName(tool: ToolCall): string {
  return (tool as any)?.function?.name || (tool as any)?.name || (tool as any)?.tool || '';
}

function isRetrievalTool(tool: ToolCall): boolean {
  const name = String(getToolName(tool) || '');
  return RETRIEVAL_NAMES.some((rn) => name.toLowerCase().includes(rn));
}

/**
 * Renders the tool call section of an assistant message.
 * Groups retrieval tools into a ContextIngestionCard (Kimi-style) and
 * renders other tools individually as ToolCallCards.
 * Extracted from the IIFE at ~L1295 in ChatMessageList.
 */
export const ToolCallRenderer: React.FC<ToolCallRendererProps> = memo(
  ({ toolCalls, isStreaming, isLast }) => {
    if (!toolCalls.length) return null;

    const withStatus = toolCalls.map((tool, i) => ({
      tool,
      status: (tool.status ||
        (isStreaming && isLast && i === toolCalls.length - 1 ? 'running' : 'completed')) as ToolStatus,
      index: i,
    }));

    const retrievalTools = withStatus.filter((t) => isRetrievalTool(t.tool));
    const otherTools = withStatus.filter((t) => !isRetrievalTool(t.tool));

    return (
      <>
        {retrievalTools.length > 0 && <ContextIngestionCard tools={retrievalTools} />}
        {otherTools.map((t) => (
          <ToolCallCard key={t.tool.id || t.index} tool={t.tool} status={t.status} />
        ))}
      </>
    );
  }
);
ToolCallRenderer.displayName = 'ToolCallRenderer';
