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
   * Formats facts into a system prompt injection string.
   */
  static async getMemoryPrompt(): Promise<string> {
    const facts = await this.getFacts();
    if (facts.length === 0) return '';
    
    const factList = facts.map(f => `- ${f.fact}`).join('\n');
    return `\n<user_memory>\nThe user has explicitly asked you to remember the following facts across sessions. Use them to personalize your responses when relevant:\n${factList}\n</user_memory>\n`;
  }
}
