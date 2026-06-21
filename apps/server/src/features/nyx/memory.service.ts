import logger from '../../lib/logger.js';
import { sqlite } from '../../db/client.js';
import { getKeysSync } from '../vault/vault.service.js';
import { LOCAL_MODEL_PORT } from '@nyx/shared';
import crypto from 'crypto';
import { env } from '../../config/env.js';

export interface MemoryEntry {
  id: string;
  content: string;
  category: 'user_preference' | 'project_fact' | 'decision' | 'summary';
  relevanceKey: string;
  timestamp: number;
  agentType?: 'chat' | 'code';
  embedding?: number[];
  lastAccessed?: number;
}

// Global reference for the transformers.js pipeline
let embeddingPipeline: any = null;

export class MemoryService {
  private static inMemoryFallback: MemoryEntry[] = [];
  private static useFallback = false;

  public static async preloadModels() {
    logger.info('[MemoryService] Preloading embedding models...');
    try {
      await this.getEmbedding('warmup');
      logger.info('[MemoryService] Embedding models preloaded successfully.');
    } catch (e) {
      logger.error('[MemoryService] Failed to preload embedding models:', e);
    }
  }

  private static ensureInitialized() {
    if (this.useFallback) return;
    try {
      if (!sqlite) {
        throw new Error('SQLite client is not defined or is null');
      }
      sqlite
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          relevance_key TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          agent_type TEXT DEFAULT 'code',
          embedding TEXT,
          last_accessed INTEGER DEFAULT 0
        )
      `
        )
        .run();

      // Migrations for existing tables
      const info = sqlite.pragma('table_info(memories)') as any[];
      
      if (!info.some((col) => col.name === 'agent_type')) {
        sqlite.prepare(`ALTER TABLE memories ADD COLUMN agent_type TEXT DEFAULT 'code'`).run();
        logger.info('[MemoryService] Migrated memories table: Added agent_type column.');
      }
      if (!info.some((col) => col.name === 'embedding')) {
        sqlite.prepare(`ALTER TABLE memories ADD COLUMN embedding TEXT`).run();
        logger.info('[MemoryService] Migrated memories table: Added embedding column.');
      }
      if (!info.some((col) => col.name === 'last_accessed')) {
        sqlite.prepare(`ALTER TABLE memories ADD COLUMN last_accessed INTEGER DEFAULT 0`).run();
        sqlite.prepare(`UPDATE memories SET last_accessed = timestamp`).run();
        logger.info('[MemoryService] Migrated memories table: Added last_accessed column.');
      }
    } catch (e: any) {
      logger.error(
        '[MemoryService] Failed to initialize table rawly, switching to in-memory fallback:',
        e
      );
      this.useFallback = true;
    }
  }

  private static async getEmbedding(text: string): Promise<number[]> {
    try {
      if (!embeddingPipeline) {
        // Dynamically import to avoid breaking if not installed globally
        const { pipeline, env: hfEnv } = await import('@xenova/transformers');
        // Prevent downloading to random temp dirs
        hfEnv.allowLocalModels = true;
        embeddingPipeline = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2', {
          quantized: true,
        });
      }
      const output = await embeddingPipeline(text, { pooling: 'mean', normalize: true });
      return Array.from(output.data);
    } catch (error) {
      logger.warn('[MemoryService] Embedding generation failed. Falling back to empty embedding.', error);
      return [];
    }
  }

  private static cosineSimilarity(a: number[], b: number[]): number {
    if (!a.length || !b.length) return 0;
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private static addMemoryInMemory(
    content: string,
    category: string,
    relevanceKey: string,
    agentType: 'chat' | 'code',
    embedding: number[]
  ): void {
    const existingIdx = this.inMemoryFallback.findIndex(
      (m) => m.content.toLowerCase() === content.toLowerCase() && m.agentType === agentType
    );

    const now = Date.now();
    if (existingIdx >= 0) {
      this.inMemoryFallback[existingIdx] = {
        ...this.inMemoryFallback[existingIdx],
        timestamp: now,
        lastAccessed: now,
        category: category as any,
        relevanceKey,
        embedding: embedding.length ? embedding : this.inMemoryFallback[existingIdx].embedding
      };
      logger.info(`[MemoryService] Updated duplicate memory in-memory: "${content}"`);
      return;
    }

    const id = crypto.randomUUID();
    this.inMemoryFallback.push({
      id,
      content,
      category: category as any,
      relevanceKey,
      timestamp: now,
      lastAccessed: now,
      agentType,
      embedding,
    });
    logger.info(`[MemoryService] Saved new memory in-memory: "${content}"`);
  }

  public static async addMemory(
    content: string,
    category: string,
    relevanceKey: string,
    agentType: 'chat' | 'code' = 'code'
  ): Promise<void> {
    const trimmedContent = content.trim();
    const trimmedKey = relevanceKey.trim();
    if (!trimmedContent) return;

    this.ensureInitialized();
    const embedding = await this.getEmbedding(trimmedContent);

    if (this.useFallback) {
      this.addMemoryInMemory(trimmedContent, category, trimmedKey, agentType, embedding);
      return;
    }
    
    try {
      const existing = sqlite
        .prepare(`SELECT id FROM memories WHERE lower(content) = ? AND agent_type = ?`)
        .get(trimmedContent.toLowerCase(), agentType) as any;

      const now = Date.now();
      const embeddingStr = JSON.stringify(embedding);

      if (existing) {
        sqlite
          .prepare(
            `UPDATE memories SET timestamp = ?, last_accessed = ?, category = ?, relevance_key = ?, embedding = ? WHERE id = ?`
          )
          .run(now, now, category, trimmedKey, embeddingStr, existing.id);
        logger.info(`[MemoryService] Updated duplicate memory: "${trimmedContent}"`);
        return;
      }

      const id = crypto.randomUUID();
      sqlite
        .prepare(
          `INSERT INTO memories (id, content, category, relevance_key, timestamp, agent_type, embedding, last_accessed)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(id, trimmedContent, category, trimmedKey, now, agentType, embeddingStr, now);
      logger.info(`[MemoryService] Saved new memory successfully: "${trimmedContent}"`);
    } catch (e: any) {
      logger.error('[MemoryService] Failed to write memory, falling back to in-memory:', e);
      this.useFallback = true;
      this.addMemoryInMemory(trimmedContent, category, trimmedKey, agentType, embedding);
    }
  }

  public static getMemories(agentType: 'chat' | 'code' = 'code'): MemoryEntry[] {
    this.ensureInitialized();
    if (this.useFallback) {
      return [...this.inMemoryFallback]
        .filter((m) => m.agentType === agentType)
        .sort((a, b) => b.timestamp - a.timestamp);
    }
    try {
      // Limit to 1000 most recent to prevent OOM/bottleneck on JS-side sorting
      const rows = sqlite
        .prepare(`SELECT * FROM memories WHERE agent_type = ? ORDER BY timestamp DESC LIMIT 1000`)
        .all(agentType) as any[];
      return rows.map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category as any,
        relevanceKey: r.relevance_key,
        timestamp: r.timestamp,
        lastAccessed: r.last_accessed,
        agentType: r.agent_type as any,
        embedding: r.embedding ? JSON.parse(r.embedding) : []
      }));
    } catch (e: any) {
      logger.error('[MemoryService] Failed to get memories:', e);
      return [];
    }
  }

  public static resetMemories(agentType?: 'chat' | 'code'): void {
    this.ensureInitialized();
    if (this.useFallback) {
      if (agentType) {
        this.inMemoryFallback = this.inMemoryFallback.filter((m) => m.agentType !== agentType);
      } else {
        this.inMemoryFallback = [];
      }
      return;
    }
    try {
      if (agentType) {
        sqlite.prepare(`DELETE FROM memories WHERE agent_type = ?`).run(agentType);
      } else {
        sqlite.prepare(`DELETE FROM memories`).run();
      }
    } catch (e: any) {
      logger.error('[MemoryService] Failed to clear memories:', e);
    }
  }

  public static async getMemoriesString(
    agentType: 'chat' | 'code' = 'code',
    contextPrompt?: string
  ): Promise<string> {
    const list = this.getMemories(agentType);
    if (!list || list.length === 0) return '';

    let relevantMemories = list;

    // Retrieval-Augmented Generation based on cosine similarity if context is provided
    if (contextPrompt) {
      const queryEmbedding = await this.getEmbedding(contextPrompt);
      if (queryEmbedding.length > 0) {
        relevantMemories = list
          .map((m) => ({
            ...m,
            score: this.cosineSimilarity(queryEmbedding, m.embedding || []),
          }))
          // Threshold of 0.3 for basic semantic relevance
          .filter((m) => m.score > 0.3 || m.category === 'user_preference')
          .sort((a, b) => b.score - a.score)
          .slice(0, 15); // Top 15 most relevant memories + all user preferences

        // Update last_accessed for RAG retrieved memories
        const now = Date.now();
        if (!this.useFallback) {
          try {
            const ids = relevantMemories.map(m => m.id);
            if (ids.length > 0) {
              const placeholders = ids.map(() => '?').join(',');
              sqlite.prepare(`UPDATE memories SET last_accessed = ? WHERE id IN (${placeholders})`).run(now, ...ids);
            }
          } catch (e) {
            logger.warn('[MemoryService] Failed to update last_accessed timestamps', e);
          }
        }
      }
    } else {
      // If no context provided, just take the most recent 15
      relevantMemories = list.sort((a, b) => b.timestamp - a.timestamp).slice(0, 15);
    }

    // CoALA Structural Memory Injection
    const preferences = relevantMemories.filter((m) => m.category === 'user_preference');
    const facts = relevantMemories.filter((m) => m.category === 'project_fact');
    const decisions = relevantMemories.filter((m) => m.category === 'decision');
    const summaries = relevantMemories.filter((m) => m.category === 'summary');

    let block = '\n\n=== PERSISTENT SEMANTIC MEMORIES (LONG-TERM SESSION CONTEXT) ===\n';
    block += 'You must respect all stored developer preferences, tech stack facts, and key architectural choices listed below:\n';

    if (preferences.length > 0) {
      block += '\n[DEVELOPER PREFERENCES]:\n';
      preferences.forEach((m) => { block += `- ${m.content}\n`; });
    }
    if (facts.length > 0) {
      block += '\n[TECH STACK & PROJECT FACTS]:\n';
      facts.forEach((m) => { block += `- ${m.content}\n`; });
    }
    if (decisions.length > 0) {
      block += '\n[ARCHITECTURAL DECISIONS]:\n';
      decisions.forEach((m) => { block += `- ${m.content}\n`; });
    }
    if (summaries.length > 0) {
      block += '\n[RECENT RELEVANT ACCOMPLISHMENTS]:\n';
      summaries.forEach((m) => { block += `- ${m.content}\n`; });
    }

    block += '=================================================================\n\n';
    return block;
  }

  public static async runBackgroundMemoryKeeper(
    userPrompt: string,
    nyxResponse: string,
    modelId?: string,
    provider?: string,
    agentType: 'chat' | 'code' = 'code'
  ): Promise<void> {
    logger.info(`[Memory Keeper] Starting background semantic distillation for ${agentType}...`);
    const keys = getKeysSync();
    const activeKey = keys[provider || ''] || '';

    const memorySystemPrompt = `
You are the Core Semantic Memory Extractor for the AI assistant named Nyx.
Your task is to analyze the chat interaction between a user and Nyx, and extract any long-term persistent memories that should be remembered across future sessions.

Extract information in these categories:
1. user_preference: Direct instructions/guidelines from the user about how they like things to be written, coded, styled, or formatted.
2. project_fact: Stated facts about the workspace, architecture, directory layout, languages, frameworks, or tech stack.
3. decision: Crucial design, architectural, or implementation decisions made in this turn.
4. summary: A brief, 1-sentence summary of what was accomplished in this turn.

If no long-term persistent facts, preferences, decisions, or accomplishments are present in this turn, you MUST set the "memories" array to empty.
Strictly filter out general pleasantries, conversational fluff, standard error messages, or generic code walkthroughs. Focus on highly specific structural preferences and accomplishments.

Output your response strictly as a single, compact JSON object matching the requested schema:
{
  "memories": [
    {
      "content": "Description of the memory",
      "category": "user_preference" | "project_fact" | "decision" | "summary"
    }
  ]
}
    `.trim();

    const conversationPayload = `[USER PROMPT]:\n${userPrompt}\n\n[NYX RESPONSE]:\n${nyxResponse}`.trim();
    let responseText = '';

    if (modelId && provider) {
      try {
        logger.info(`[Memory Keeper] Executing extraction using model ${modelId} (${provider})`);

        if (provider === 'gemini') {
          const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelId}:generateContent?key=${activeKey}`;
          const contents = [{ role: 'user', parts: [{ text: conversationPayload }] }];
          const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents,
              systemInstruction: { parts: [{ text: memorySystemPrompt }] },
              generationConfig: { temperature: 0.2, maxOutputTokens: 512 },
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`Gemini Critic API error: ${res.statusText}`);
          const data: any = await res.json();
          responseText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        } else if (provider === 'nyx-native') {
          const llamaPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;
          const res = await fetch(`http://127.0.0.1:${llamaPort}/v1/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              model: modelId,
              messages: [
                { role: 'system', content: memorySystemPrompt },
                { role: 'user', content: conversationPayload },
              ],
              stream: false,
              temperature: 0.2,
              max_tokens: 512,
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) throw new Error(`Local GGUF Critic error: ${res.statusText}`);
          const data: any = await res.json();
          responseText = data.choices?.[0]?.message?.content || '';
        } else {
          throw new Error(`Unsupported provider for memory keeper: ${provider}`);
        }
      } catch (error: any) {
        logger.warn('[Memory Keeper] Selected model run failed, falling back to local Python server:', error.message);
      }
    }

    if (!responseText) {
      try {
        const scraplingPort = env.SCRAPLING_PORT || 3002;
        const hfRes = await fetch(`http://127.0.0.1:${scraplingPort}/api/gemini/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: conversationPayload,
            systemInstruction: memorySystemPrompt,
            settings: { maxTokens: 512, temperature: 0.2 },
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (hfRes.ok) {
          const data: any = await hfRes.json();
          responseText = data.text || '';
        }
      } catch (error: any) {
        logger.error('[Memory Keeper] Fallback model execution failed:', error);
      }
    }

    if (responseText) {
      try {
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          if (parsed && Array.isArray(parsed.memories)) {
            let count = 0;
            for (const item of parsed.memories) {
              if (item.content && item.category) {
                await this.addMemory(item.content, item.category, userPrompt, agentType);
                count++;
              }
            }
            logger.info(`[Memory Keeper] Semantic extraction complete! Committed ${count} new memories for ${agentType}.`);
          }
        }
      } catch (error: any) {
        logger.error('[Memory Keeper] Failed to parse or save semantic memories:', error.message);
      }
    }
  }

  public static deleteMemory(id: string): void {
    this.ensureInitialized();
    if (this.useFallback) {
      this.inMemoryFallback = this.inMemoryFallback.filter((m) => m.id !== id);
      logger.info(`[MemoryService] Deleted memory from fallback: ${id}`);
      return;
    }
    try {
      sqlite.prepare(`DELETE FROM memories WHERE id = ?`).run(id);
      logger.info(`[MemoryService] Deleted memory from database: ${id}`);
    } catch (e: any) {
      logger.error('[MemoryService] Failed to delete memory:', e);
    }
  }
}
