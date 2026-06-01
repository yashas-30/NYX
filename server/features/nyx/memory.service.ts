import { sqlite } from '../../db/client.ts';
import { loadKeys } from '../vault/vault.service.ts';
import crypto from 'crypto';

export interface MemoryEntry {
  id: string;
  content: string;
  category: 'user_preference' | 'project_fact' | 'decision' | 'summary';
  relevanceKey: string;
  timestamp: number;
  agentType?: 'chat' | 'code';
}

export class MemoryService {
  private static ensureInitialized() {
    try {
      sqlite
        .prepare(
          `
        CREATE TABLE IF NOT EXISTS memories (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          category TEXT NOT NULL,
          relevance_key TEXT NOT NULL,
          timestamp INTEGER NOT NULL,
          agent_type TEXT DEFAULT 'code'
        )
      `
        )
        .run();

      // Migration: Add agent_type if not present in existing table
      const info = sqlite.pragma('table_info(memories)') as any[];
      const hasAgentType = info.some((col) => col.name === 'agent_type');
      if (!hasAgentType) {
        sqlite.prepare(`ALTER TABLE memories ADD COLUMN agent_type TEXT DEFAULT 'code'`).run();
        console.log('[MemoryService] Migrated memories table: Added agent_type column.');
      }
    } catch (e) {
      console.error('[MemoryService] Failed to initialize table rawly:', e);
    }
  }

  /**
   * Fetches all persistent semantic memories sorted by timestamp
   */
  public static getMemories(agentType: 'chat' | 'code' = 'code'): MemoryEntry[] {
    try {
      this.ensureInitialized();
      const rows = sqlite
        .prepare(`SELECT * FROM memories WHERE agent_type = ? ORDER BY timestamp DESC`)
        .all(agentType) as any[];
      return rows.map((r) => ({
        id: r.id,
        content: r.content,
        category: r.category as any,
        relevanceKey: r.relevance_key,
        timestamp: r.timestamp,
        agentType: r.agent_type as any,
      }));
    } catch (e) {
      console.error('[MemoryService] Failed to get memories:', e);
      return [];
    }
  }

  /**
   * Appends or updates a memory entry in the database (deduplication based on content)
   */
  public static addMemory(
    content: string,
    category: string,
    relevanceKey: string,
    agentType: 'chat' | 'code' = 'code'
  ): void {
    try {
      this.ensureInitialized();
      const trimmedContent = content.trim();
      const trimmedKey = relevanceKey.trim();
      if (!trimmedContent) return;

      // Check if duplicate exists (case-insensitive) under same agentType
      const existing = sqlite
        .prepare(`SELECT id FROM memories WHERE lower(content) = ? AND agent_type = ?`)
        .get(trimmedContent.toLowerCase(), agentType) as any;

      if (existing) {
        sqlite
          .prepare(
            `UPDATE memories SET timestamp = ?, category = ?, relevance_key = ? WHERE id = ?`
          )
          .run(Date.now(), category, trimmedKey, existing.id);
        console.log(
          `[MemoryService] Updated duplicate memory: "${trimmedContent}" for agentType: ${agentType}`
        );
        return;
      }

      const id = crypto.randomUUID();
      sqlite
        .prepare(
          `
        INSERT INTO memories (id, content, category, relevance_key, timestamp, agent_type)
        VALUES (?, ?, ?, ?, ?, ?)
      `
        )
        .run(id, trimmedContent, category, trimmedKey, Date.now(), agentType);
      console.log(
        `[MemoryService] Saved new memory successfully: "${trimmedContent}" for agentType: ${agentType}`
      );
    } catch (e) {
      console.error('[MemoryService] Failed to write memory:', e);
    }
  }

  /**
   * Clears stored memories
   */
  public static resetMemories(agentType?: 'chat' | 'code'): void {
    try {
      this.ensureInitialized();
      if (agentType) {
        sqlite.prepare(`DELETE FROM memories WHERE agent_type = ?`).run(agentType);
        console.log(`[MemoryService] Persistent memories cleared for agentType: ${agentType}.`);
      } else {
        sqlite.prepare(`DELETE FROM memories`).run();
        console.log('[MemoryService] All persistent memories cleared.');
      }
    } catch (e) {
      console.error('[MemoryService] Failed to clear memories:', e);
    }
  }

  /**
   * Returns a formatted injection-ready string containing all memories
   */
  public static getMemoriesString(agentType: 'chat' | 'code' = 'code'): string {
    const list = this.getMemories(agentType);
    if (!list || list.length === 0) return '';

    // Group memories by category for cleaner visual styling
    const preferences = list.filter((m) => m.category === 'user_preference');
    const facts = list.filter((m) => m.category === 'project_fact');
    const decisions = list.filter((m) => m.category === 'decision');
    const summaries = list.filter((m) => m.category === 'summary');

    let block = '\n\n=== PERSISTENT SEMANTIC MEMORIES (LONG-TERM SESSION CONTEXT) ===\n';
    block +=
      'You must respect all stored developer preferences, tech stack facts, and key architectural choices listed below:\n';

    if (preferences.length > 0) {
      block += '\n[DEVELOPER PREFERENCES]:\n';
      preferences.forEach((m) => {
        block += `- ${m.content}\n`;
      });
    }
    if (facts.length > 0) {
      block += '\n[TECH STACK & PROJECT FACTS]:\n';
      facts.forEach((m) => {
        block += `- ${m.content}\n`;
      });
    }
    if (decisions.length > 0) {
      block += '\n[ARCHITECTURAL DECISIONS]:\n';
      decisions.forEach((m) => {
        block += `- ${m.content}\n`;
      });
    }
    if (summaries.length > 0) {
      block += '\n[RECENT SESSION ACCOMPLISHMENTS]:\n';
      summaries.slice(0, 5).forEach((m) => {
        block += `- ${m.content}\n`;
      });
    }

    block += '=================================================================\n\n';
    return block;
  }

  /**
   * Run background task to analyze conversational turn, extract semantic memories, and commit to DB
   */
  public static async runBackgroundMemoryKeeper(
    userPrompt: string,
    nyxResponse: string,
    modelId?: string,
    provider?: string,
    agentType: 'chat' | 'code' = 'code'
  ): Promise<void> {
    console.log(`[Memory Keeper] Starting background semantic distillation for ${agentType}...`);
    const keys = loadKeys();
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
      "content": "Description of the memory (e.g., 'User prefers using HSL colors for Tailwind styling in this project.')",
      "category": "user_preference" | "project_fact" | "decision" | "summary"
    }
  ]
}
    `.trim();

    const conversationPayload = `
[USER PROMPT]:
${userPrompt}

[NYX RESPONSE]:
${nyxResponse}
    `.trim();

    let responseText = '';

    if (modelId && provider) {
      try {
        console.log(`[Memory Keeper] Executing extraction using model ${modelId} (${provider})`);

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
          const res = await fetch('http://127.0.0.1:12345/v1/chat/completions', {
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
      } catch (err: any) {
        console.warn(
          '[Memory Keeper] Selected model run failed, falling back to local Python server:',
          err.message
        );
      }
    }

    // Fallback to local Python HF service
    if (!responseText) {
      try {
        const hfRes = await fetch('http://127.0.0.1:3002/api/gemini/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            prompt: conversationPayload,
            systemInstruction: memorySystemPrompt,
            settings: {
              maxTokens: 512,
              temperature: 0.2,
            },
          }),
          signal: AbortSignal.timeout(15000),
        });

        if (hfRes.ok) {
          const data: any = await hfRes.json();
          responseText = data.text || '';
        }
      } catch (error) {
        console.error('[Memory Keeper] Fallback model execution failed:', error);
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
                this.addMemory(item.content, item.category, userPrompt, agentType);
                count++;
              }
            }
            console.log(
              `[Memory Keeper] Semantic extraction complete! Committed ${count} new memories for ${agentType}.`
            );
          }
        }
      } catch (err: any) {
        console.error('[Memory Keeper] Failed to parse or save semantic memories:', err.message);
      }
    }
  }
}
