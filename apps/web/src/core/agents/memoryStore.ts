import { LazyStore as Store } from '@tauri-apps/plugin-store';

const store = new Store('nyx_agent_memory.bin');

export interface MemoryFact {
  id: string;
  fact: string;
  createdAt: number;
}

export class MemoryStore {
  /**
   * Add a new fact to the agent's persistent memory.
   */
  static async addFact(fact: string): Promise<MemoryFact> {
    const facts = await this.getFacts();
    const newFact: MemoryFact = {
      id: crypto.randomUUID(),
      fact,
      createdAt: Date.now()
    };
    
    facts.push(newFact);
    if (this.isTauri()) {
      await store.set('facts', facts);
      await store.save();
    } else {
      localStorage.setItem('nyx_agent_memory_facts', JSON.stringify(facts));
    }
    
    return newFact;
  }

  /**
   * Delete a fact by its exact content or ID.
   */
  static async deleteFact(idOrFact: string): Promise<boolean> {
    const facts = await this.getFacts();
    const initialLength = facts.length;
    
    const newFacts = facts.filter(f => f.id !== idOrFact && f.fact !== idOrFact);
    
    if (newFacts.length !== initialLength) {
      if (this.isTauri()) {
        await store.set('facts', newFacts);
        await store.save();
      } else {
        localStorage.setItem('nyx_agent_memory_facts', JSON.stringify(newFacts));
      }
      return true;
    }
    
    return false;
  }

  static isTauri() {
    return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  }

  /**
   * Retrieve all memorized facts.
   */
  static async getFacts(): Promise<MemoryFact[]> {
    try {
      if (this.isTauri()) {
        const facts = await store.get<MemoryFact[]>('facts');
        return facts || [];
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
   * Implicitly extract and save memory facts from a conversation.
   * Simulates an LLM parsing the history for preferences or corrections.
   */
  static async extractImplicitMemory(messages: any[]): Promise<void> {
    if (messages.length < 2) return;
    
    const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
    if (!lastUserMsg || !lastUserMsg.content) return;
    
    const content = lastUserMsg.content.toLowerCase();
    
    // Simulate basic NLP extraction of user preferences (RLHF-lite)
    const preferences: string[] = [];
    
    // Positive heuristics
    const alwaysMatch = content.match(/always use (.*?)(?:\.|$)/);
    if (alwaysMatch) preferences.push(`User prefers to always use ${alwaysMatch[1].trim()}`);
    
    const preferMatch = content.match(/i prefer (.*?)(?:\.|$)/) || content.match(/prefer (.*?)(?:\.|$)/);
    if (preferMatch && !preferMatch[1].startsWith('to not')) preferences.push(`User prefers ${preferMatch[1].trim()}`);
    
    const likeMatch = content.match(/i like it when (.*?)(?:\.|$)/);
    if (likeMatch) preferences.push(`User likes it when ${likeMatch[1].trim()}`);
    
    const fromNowOnMatch = content.match(/from now on,?\s*(.*?)(?:\.|$)/);
    if (fromNowOnMatch) preferences.push(`From now on, user wants: ${fromNowOnMatch[1].trim()}`);

    // Negative heuristics
    const neverMatch = content.match(/never use (.*?)(?:\.|$)/);
    if (neverMatch) preferences.push(`User prefers to never use ${neverMatch[1].trim()}`);
    
    const stopMatch = content.match(/stop (doing |using )?(.*?)(?:\.|$)/);
    if (stopMatch) preferences.push(`User wants agent to stop ${stopMatch[1] || ''}${stopMatch[2].trim()}`);
    
    const avoidMatch = content.match(/avoid (.*?)(?:\.|$)/);
    if (avoidMatch) preferences.push(`User wants to avoid ${avoidMatch[1].trim()}`);
    
    const doNotUseMatch = content.match(/do not use (.*?)(?:\.|$)/) || content.match(/don't use (.*?)(?:\.|$)/);
    if (doNotUseMatch) preferences.push(`User explicitly asked to not use ${doNotUseMatch[1].trim()}`);

    for (const pref of preferences) {
      await this.addFact(pref);
    }
  }

  /**
   * Formats facts into a system prompt injection string.
   */
  static async getMemoryPrompt(): Promise<string> {
    const facts = await this.getFacts();
    if (facts.length === 0) return '';
    
    const factList = facts.map(f => `- ${f.fact}`).join('\n');
    return `\n<user_memory>\nThe following are implicit and explicit facts/preferences learned from past interactions. Adhere to them strictly:\n${factList}\n</user_memory>\n`;
  }
}
