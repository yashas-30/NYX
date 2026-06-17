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
 * Smart asynchronous history compaction (summarizing old messages + whitelist filtering).
 * Requires an AIService instance and settings.
 */
export async function compactHistoryAsync(
  messages: ChatMessage[],
  maxTokens: number,
  aiService: any,
  settings: any
): Promise<ChatMessage[]> {
  let currentTokens = estimateContextTokens(messages);
  
  if (currentTokens <= maxTokens) {
    return messages;
  }

  // 1. Whitelist filtering: Strip images from older messages first (keep images only in last 2 messages)
  const strippedMessages = messages.map((m, idx) => {
    if (m.role === 'system' || idx >= messages.length - 2) return m;
    return { ...m, images: undefined };
  });

  currentTokens = estimateContextTokens(strippedMessages);
  if (currentTokens <= maxTokens) {
    return strippedMessages;
  }

  // 2. Smart summarization: Summarize everything except the last 4 messages and system prompt
  const systemMsg = strippedMessages.find(m => m.role === 'system');
  const otherMsgs = strippedMessages.filter(m => m.role !== 'system');

  if (otherMsgs.length <= 4) {
    // Too few messages to summarize effectively, fallback to basic compaction
    return compactHistory(strippedMessages, maxTokens);
  }

  const msgsToSummarize = otherMsgs.slice(0, otherMsgs.length - 4);
  const msgsToKeep = otherMsgs.slice(otherMsgs.length - 4);

  const summaryPrompt = `Please summarize the following conversation history concisely, retaining all critical facts, decisions, and context. Omit pleasantries. Conversation:\n\n${msgsToSummarize.map(m => `${m.role.toUpperCase()}: ${m.content}`).join('\n\n')}`;

  try {
    // Use a fast model for summarization
    const response = await aiService.execute({
      model: 'gemini-3.1-flash-lite',
      provider: 'google', // Adjust based on availability
      systemPrompt: 'You are an AI context summarizer. Provide a highly condensed summary of the conversation history.',
      prompt: summaryPrompt,
      temperature: 0.1,
      settings
    });

    const summaryContent = `[CONVERSATION HISTORY SUMMARY]\n${response.content}`;
    
    const summaryMsg: ChatMessage = {
      id: `summary-${Date.now()}`,
      role: 'assistant',
      content: summaryContent,
      timestamp: Date.now()
    };

    const result = systemMsg ? [systemMsg, summaryMsg, ...msgsToKeep] : [summaryMsg, ...msgsToKeep];
    
    // If it STILL exceeds maxTokens, fallback to sliding window on the result
    if (estimateContextTokens(result) > maxTokens) {
       return compactHistory(result, maxTokens);
    }
    
    return result;
  } catch (err) {
    console.error('Error during smart compaction, falling back to basic:', err);
    return compactHistory(strippedMessages, maxTokens);
  }
}

