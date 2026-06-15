import { db } from '../../db/client.js';
import { userMemories } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { EmbeddingService } from '../rag/embeddingService.js';
import { UnifiedEngine } from '../../lib/aiEngine.js';
import logger from '../../lib/logger.js';
import { v4 as uuidv4 } from 'uuid';

export class MemoryService {
  /**
   * Extract personal observations, coding preferences, and guidelines from a conversation session's history.
   */
  static async consolidateSession(sessionId: string, messages: any[], context: any): Promise<void> {
    if (!messages || messages.length < 2) return;
    
    logger.info(`[MemoryService] Running memory consolidation for session ${sessionId}...`);
    
    // Format transcript for the extractor LLM
    const transcript = messages
      .map(m => `${m.role.toUpperCase()}: ${m.content}`)
      .join('\n\n');

    const extractionPrompt = `
You are a Personalization Memory Extractor. Analyze the chat transcript below.
Extract user facts, technical preferences, coding styles, OS environment, and structural guidelines that the user has shared or demonstrated.

Guidelines:
- Extract ONLY facts that will help customize future prompts. E.g. "User uses Windows OS", "User prefers TypeScript and React 19", "User dislikes Tailwind CSS", "User writes clean architecture".
- Do not extract temporary conversational detail, questions, or random variables.
- Respond with a raw JSON array of strings: ["fact 1", "fact 2", ...]
- Respond ONLY with the JSON array. Output nothing else.

Transcript:
${transcript.slice(-16000)}
`;

    try {
      let responseRaw = '';
      await new Promise<void>((resolve, reject) => {
        UnifiedEngine.executeStream(
          {
            provider: 'gemini',
            model: 'gemini-2.5-flash',
            messages: [{ role: 'user', content: extractionPrompt }],
            apiKey: context.apiKey,
            settings: {
              temperature: 0.0,
              maxTokens: 500,
              jsonMode: true,
            }
          },
          (chunk: any) => { if (chunk.chunk) responseRaw += chunk.chunk; },
          () => resolve()
        ).catch(reject);
      });

      let facts: string[] = [];
      try {
        const arrayMatch = responseRaw.match(/\[[\s\S]*\]/);
        const cleanJson = arrayMatch ? arrayMatch[0] : responseRaw.replace(/```(?:json)?|```/g, '').trim();
        
        const parsed = JSON.parse(cleanJson);
        if (Array.isArray(parsed)) {
          facts = parsed.filter(item => typeof item === 'string');
        }
      } catch (parseErr: any) {
        logger.warn('[MemoryService] Failed to parse memory JSON:', parseErr.message, 'Raw:', responseRaw);
        return;
      }
      
      if (Array.isArray(facts) && facts.length > 0) {
        logger.info(`[MemoryService] Extracted ${facts.length} facts. Storing...`);
        for (const fact of facts) {
          // Check for duplication to prevent cluttering
          const existing = await db
            .select()
            .from(userMemories)
            .where(eq(userMemories.fact, fact));

          if (existing.length === 0) {
            await db.insert(userMemories).values({
              id: uuidv4(),
              fact,
              category: 'personalization',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              sessionId
            });
          }
        }
      }
    } catch (err: any) {
      logger.warn('[MemoryService] Memory consolidation failed:', err.message);
    }
  }

  /**
   * Retrieves relevant memories matching the query/prompt.
   */
  static async retrieveMemories(query: string, limit = 5): Promise<string[]> {
    try {
      // Fetch all memories
      const allMemories = await db.select().from(userMemories);
      if (allMemories.length === 0) return [];

      // Calculate semantic similarity against query
      const queryEmbedding = await EmbeddingService.embedText(query, { provider: 'gemini' });
      const scored = await Promise.all(allMemories.map(async (m: any) => {
        try {
          const memoryEmbedding = await EmbeddingService.embedText(m.fact, { provider: 'gemini' });
          
          let dotProduct = 0;
          let normA = 0;
          let normB = 0;
          for (let i = 0; i < queryEmbedding.length; i++) {
            dotProduct += queryEmbedding[i] * memoryEmbedding[i];
            normA += queryEmbedding[i] * queryEmbedding[i];
            normB += memoryEmbedding[i] * memoryEmbedding[i];
          }
          const score = dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
          return { memory: m, score };
        } catch {
          return { memory: m, score: 0 };
        }
      }));

      // Sort and return top facts
      return scored
        .filter(s => s.score > 0.4)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map(s => s.memory.fact);
    } catch (err: any) {
      logger.warn('[MemoryService] Memory retrieval failed:', err.message);
      return [];
    }
  }
}
