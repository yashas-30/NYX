import { ChatMessage } from '@src/infrastructure/types';

/**
 * Estimates the token count of a given text, roughly 4 chars per token.
 */
export function estimateTextTokens(text: string): number {
  return Math.ceil((text || '').length / 4);
}

/**
 * Estimates tokens for an array of messages, taking images into account.
 */
export function estimateContextTokens(messages: ChatMessage[]): number {
  return messages.reduce((sum, m) => {
    const base = m.role === 'system' ? 50 : 0;
    const contentTokens = estimateTextTokens(m.content || '');
    const imageTokens = (m.images?.length || 0) * 512;
    return sum + base + contentTokens + imageTokens;
  }, 0);
}

/**
 * Basic synchronous history compaction (sliding window).
 */
export function compactHistory(
  messages: ChatMessage[],
  maxTokens: number
): ChatMessage[] {
  let currentTokens = estimateContextTokens(messages);
  
  if (currentTokens <= maxTokens) {
    return messages;
  }

  const systemMsg = messages.find(m => m.role === 'system');
  const otherMsgs = messages.filter(m => m.role !== 'system');
  
  let dropCount = 0;
  
  while (currentTokens > maxTokens && dropCount < otherMsgs.length - 1) {
    const msgToDrop = otherMsgs[dropCount];
    const msgTokens = estimateTextTokens(msgToDrop.content || '') + ((msgToDrop.images?.length || 0) * 512);
    currentTokens -= msgTokens;
    dropCount++;
  }

  const compacted = otherMsgs.slice(dropCount);
  
  if (systemMsg) {
    return [systemMsg, ...compacted];
  }
  return compacted;
}

/**
 * Smart asynchronous history compaction.
 * Summarises old messages via a native Tauri one-shot invoke so no HTTP
 * client is needed in the frontend.
 */
export async function compactHistoryAsync(
  messages: ChatMessage[],
  maxTokens: number,
  _aiService?: any,   // kept for call-site compat — no longer used
  _settings?: any,
): Promise<ChatMessage[]> {
  let currentTokens = estimateContextTokens(messages);

  if (currentTokens <= maxTokens) {
    return messages;
  }

  // 1. Strip images from older messages (keep last 2 messages intact)
  const strippedMessages = messages.map((m, idx) => {
    if (m.role === 'system' || idx >= messages.length - 2) return m;
    return { ...m, images: undefined };
  });

  currentTokens = estimateContextTokens(strippedMessages);
  if (currentTokens <= maxTokens) {
    return strippedMessages;
  }

  // 2. Smart summarisation: collapse everything except the last 4 messages
  const systemMsg = strippedMessages.find(m => m.role === 'system');
  const otherMsgs = strippedMessages.filter(m => m.role !== 'system');

  if (otherMsgs.length <= 4) {
    return compactHistory(strippedMessages, maxTokens);
  }

  const msgsToSummarize = otherMsgs.slice(0, otherMsgs.length - 4);
  const msgsToKeep = otherMsgs.slice(otherMsgs.length - 4);

  const summaryPrompt = `Summarize the following conversation concisely, retaining all critical facts, decisions, and context. Omit pleasantries.\n\n${msgsToSummarize.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`;

  try {
    // Check for Tauri environment before invoking
    const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

    let summaryText = '';

    if (isTauri) {
      // Native one-shot invoke — Rust handles model selection and streaming internally.
      // We use the compact_history_summarize command which runs a fast model call
      // with no streaming overhead.
      const result = await (window as any).__TAURI_INTERNALS__.invoke('compact_history_summarize', {
        prompt: summaryPrompt,
      }).catch(() => null) as string | null;
      summaryText = result ?? '';
    }

    if (!summaryText) {
      // Fallback: sliding window compaction if Tauri call fails or not in Tauri env
      return compactHistory(strippedMessages, maxTokens);
    }

    const summaryMsg: ChatMessage = {
      id: `summary-${Date.now()}`,
      role: 'assistant',
      content: `[CONVERSATION HISTORY SUMMARY]\n${summaryText}`,
      timestamp: Date.now(),
    };

    const result = systemMsg
      ? [systemMsg, summaryMsg, ...msgsToKeep]
      : [summaryMsg, ...msgsToKeep];

    // Final safety check — if still too long, apply sliding window
    if (estimateContextTokens(result) > maxTokens) {
      return compactHistory(result, maxTokens);
    }

    return result;
  } catch (err) {
    console.error('[compactHistoryAsync] Smart compaction failed, falling back to basic:', err);
    return compactHistory(strippedMessages, maxTokens);
  }
}

