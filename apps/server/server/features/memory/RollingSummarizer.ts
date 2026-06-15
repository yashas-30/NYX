import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';

export class RollingSummarizer {
  /**
   * Compresses N older messages into a dense summary.
   * Keeps the system prompt and the most recent M messages intact.
   * Returns a summarized string that can be inserted as a 'system' or 'assistant' message.
   */
  static async summarizeContext(messages: any[], context: any): Promise<string | null> {
    if (!messages || messages.length < 5) return null;

    logger.info(`[RollingSummarizer] Summarizing context of ${messages.length} messages...`);

    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const summaryPrompt = `
You are an expert Context Summarizer. Your goal is to compress the following chat transcript into a highly dense summary.
Retain all factual information, code snippets, tool usage contexts, and user constraints.
Do NOT omit details that might be relevant for completing an ongoing task.
Discard conversational filler, pleasantries, and redundant information.

Transcript:
${transcript}
`;

    try {
      let responseRaw = '';
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: summaryPrompt }],
            apiKey: context.apiKey,
            settings: {
              temperature: 0.1,
              maxTokens: 1024,
            }
          },
          (chunk: any) => { if (chunk.chunk) responseRaw += chunk.chunk; },
          () => resolve()
        ).catch(reject);
      });

      logger.info(`[RollingSummarizer] Successfully generated summary of length ${responseRaw.length}`);
      return responseRaw.trim();
    } catch (err: any) {
      logger.warn('[RollingSummarizer] Context summarization failed:', err.message);
      return null;
    }
  }
}
