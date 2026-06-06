export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'web-dev' | 'data-science' | 'devops' | 'mobile' | 'game-dev' | 'embedded';
  systemPrompt: string;
  tools: string[]; 
  model: string; 
  examples: string[]; 
  author: string;
  downloads: number;
  rating: number;
}

export class Marketplace {
  public async publishAgent(agent: AgentTemplate): Promise<boolean> {
    // Stub for inserting into marketplace DB
    return true;
  }

  public async fetchPopularAgents(): Promise<AgentTemplate[]> {
    // Stub for returning list
    return [];
  }
}
