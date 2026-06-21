import { invoke } from '@tauri-apps/api/core';
import { generateEmbedding } from '../services/embedding.service';

export interface MemoryFact {
  id: string;
  fact: string;
  category?: string;
  createdAt: number;
  embedding?: number[];
  similarity?: number;
}

export class MemoryStore {
  static isTauri() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /**
   * Add a new fact to the agent's persistent memory.
   */
  static async addFact(fact: string, category: string = 'general'): Promise<MemoryFact> {
    // Generate semantic embedding for the new fact
    let embedding: number[] | undefined;
    try {
      embedding = await generateEmbedding(fact);
    } catch (e) {
      console.warn('[MemoryStore] Failed to generate embedding for fact', e);
    }

    const newFact: MemoryFact = {
      id: crypto.randomUUID(),
      fact,
      category,
      createdAt: Date.now(),
      embedding
    };
    
    if (this.isTauri()) {
      try {
        await invoke('db_add_memory', {
          id: newFact.id,
          fact: newFact.fact,
          category: newFact.category || 'general',
          embedding: JSON.stringify(embedding || [])
        });
      } catch (err) {
        console.error('[MemoryStore] Failed to save memory to SQLite', err);
      }
    } else {
      const facts = await this.getFacts();
      facts.push(newFact);
      localStorage.setItem('nyx_agent_memory_facts', JSON.stringify(facts));
    }
    
    return newFact;
  }

  /**
   * Delete a fact by its exact content or ID.
   */
  static async deleteFact(idOrFact: string): Promise<boolean> {
    if (this.isTauri()) {
      try {
        // If it's an ID format, delete by ID
        if (idOrFact.length > 20 && idOrFact.includes('-')) {
          await invoke('db_delete_memory', { id: idOrFact });
          return true;
        } else {
          // Find by fact string
          const facts = await this.getFacts();
          const target = facts.find(f => f.fact === idOrFact);
          if (target) {
            await invoke('db_delete_memory', { id: target.id });
            return true;
          }
          return false;
        }
      } catch (err) {
        console.error('[MemoryStore] Failed to delete memory from SQLite', err);
        return false;
      }
    } else {
      const facts = await this.getFacts();
      const initialLength = facts.length;
      const newFacts = facts.filter(f => f.id !== idOrFact && f.fact !== idOrFact);
      if (newFacts.length !== initialLength) {
        localStorage.setItem('nyx_agent_memory_facts', JSON.stringify(newFacts));
        return true;
      }
      return false;
    }
  }

  /**
   * Retrieve all memorized facts.
   */
  static async getFacts(): Promise<MemoryFact[]> {
    try {
      if (this.isTauri()) {
        const results: any[] = await invoke('db_get_memories');
        return results.map(r => ({
          id: r.id,
          fact: r.fact,
          category: r.category,
          createdAt: r.created_at,
          embedding: r.embedding ? JSON.parse(r.embedding) : undefined
        }));
      } else {
        const data = localStorage.getItem('nyx_agent_memory_facts');
        return data ? JSON.parse(data) : [];
      }
    } catch (err) {
      console.error('Failed to load memory facts', err);
      return [];
    }
  }

  /**
   * Implicitly extract and save memory facts from a conversation using LLM reflection.
   * Runs on a debounced schedule (e.g. every 5 messages) as Observational Memory.
   */
  static async extractImplicitMemory(messages: any[]): Promise<void> {
    if (messages.length < 2) return;
    
    // Debounce schedule: Only extract memory every 5 user messages
    const userMessages = messages.filter(m => m.role === 'user');
    if (userMessages.length % 5 !== 0) return;
    
    const recentThread = messages.slice(-10).map(m => `${m.role}: ${m.content}`).join('\n');
    
    try {
      // Lazy import to avoid circular dependencies
      const { AIService } = await import('../../infrastructure/api/ai.service');
      const { detectProvider, getEffectiveApiKey } = await import('../../infrastructure/utils/provider');

      const prompt = `Analyze the following recent conversation thread and extract any new explicit preferences, facts, or instructions the user wants the assistant to remember.
Return ONLY a valid JSON array of strings. If there are no clear preferences or facts, return an empty array []. Do not include markdown code blocks, just the JSON array.
Conversation thread:
${recentThread}`;

      // Use the current chat model for extraction
      let modelId = 'gemini-1.5-flash';
      if (typeof localStorage !== 'undefined') {
        const storedModel = localStorage.getItem('nyx_model');
        if (storedModel) modelId = storedModel;
      }
      
      const provider = detectProvider(modelId);
      
      let apiKeys = {};
      if (typeof localStorage !== 'undefined') {
        const storedKeys = localStorage.getItem('nyx_api_keys');
        if (storedKeys) apiKeys = JSON.parse(storedKeys);
      }
      const apiKey = getEffectiveApiKey(provider, apiKeys) || undefined;

      const response = await AIService.execute(
        modelId,
        provider,
        prompt,
        apiKey,
        "You are an Observational Memory extractor. Return ONLY a JSON array of strings. No conversational text.",
        { temperature: 0.1 }
      );

      const text = response.text.trim();
      const match = text.match(/\[[\s\S]*\]/);
      if (match) {
        const preferences = JSON.parse(match[0]);
        if (Array.isArray(preferences)) {
          for (const pref of preferences) {
            // Check if we already know a very similar fact
            const existing = await this.getFacts();
            const isDuplicate = existing.some(e => e.fact.toLowerCase() === pref.toLowerCase());
            if (!isDuplicate) {
              await this.addFact(pref);
            }
          }
        }
      }
    } catch (err) {
      console.error('Failed to extract implicit memory via LLM', err);
    }
  }

  /**
   * Helper to compute cosine similarity between two vectors
   */
  private static cosineSimilarity(vecA: number[], vecB: number[]): number {
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    for (let i = 0; i < vecA.length; i++) {
      dotProduct += vecA[i] * vecB[i];
      normA += vecA[i] * vecA[i];
      normB += vecB[i] * vecB[i];
    }
    if (normA === 0 || normB === 0) return 0;
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  /**
   * Formats top-K semantically relevant facts into a system prompt injection string.
   */
  static async getMemoryPrompt(currentQuery?: string): Promise<string> {
    let relevantFacts: MemoryFact[] = [];

    // If a current query is provided, do a Semantic Recall (Top K=5)
    if (currentQuery) {
      try {
        // Enforce a strict 1500ms timeout on embedding generation to prevent 
        // blocking the entire LLM chat pipeline (e.g., waiting for ONNX model downloads).
        const queryEmbedding = await Promise.race([
          generateEmbedding(currentQuery),
          new Promise<undefined>((_, reject) => 
            setTimeout(() => reject(new Error('Embedding timeout')), 1500)
          )
        ]);
        
        if (queryEmbedding && this.isTauri()) {
          const results: any[] = await invoke('db_search_memories', {
            queryEmbedding: queryEmbedding, 
            topK: 5
          });
          relevantFacts = results.map(r => ({
            id: r.id,
            fact: r.fact,
            category: r.category,
            createdAt: r.created_at,
            similarity: r.similarity
          }));
        } else if (queryEmbedding) {
          // Fallback to JS filtering
          const facts = await this.getFacts();
          const scoredFacts = facts.map(f => {
            const score = (f.embedding && queryEmbedding) 
              ? this.cosineSimilarity(queryEmbedding, f.embedding)
              : 0;
            return { ...f, score };
          });
          scoredFacts.sort((a, b) => (b.score || 0) - (a.score || 0));
          relevantFacts = scoredFacts.slice(0, 5);
        }
      } catch (e) {
        console.warn('[MemoryStore] Semantic recall failed or timed out, using raw facts fallback', e);
        const facts = await this.getFacts();
        relevantFacts = facts.slice(0, 5); // Fallback should take top 5 recent
      }
    } else {
      // If no query, just return latest 5 facts
      const facts = await this.getFacts();
      relevantFacts = facts.slice(0, 5); // Take the most recent 5 facts. (Note: db_get_memories is ordered by created_at DESC)
    }

    if (relevantFacts.length === 0) return '';
    
    const factList = relevantFacts.map(f => `- ${f.fact}`).join('\n');
    return `\n<user_memory>\nThe following are implicit and explicit facts/preferences learned from past interactions. Adhere to them strictly:\n${factList}\n</user_memory>\n`;
  }
}
