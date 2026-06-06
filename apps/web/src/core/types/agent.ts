export interface AISettings {
  temperature: number;
  topP: number;
  maxTokens: number;
}

export interface AgentReview {
  id: string;
  userId: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface AgentTemplate {
  id: string;
  name: string;
  description: string;
  category: 'web-dev' | 'data-science' | 'devops' | 'mobile' | 'game-dev' | 'embedded';
  systemPrompt: string;
  tools: string[]; // Tool IDs this agent uses
  model: string; // Recommended model
  settings: AISettings;
  examples: string[]; // Example prompts
  author: string;
  downloads: number;
  rating: number;
  reviews: AgentReview[];
}
