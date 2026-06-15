import { AgentOrchestrator } from '../../../server/features/agents/AgentOrchestrator.js';
import { createTools, executeTool, clearSessionMemos } from '../../../server/features/agents/tools/index.js';
import { v4 as uuidv4 } from 'uuid';

export interface AutoModeConfig {
  maxIterations: number;
  forbiddenCommands: string[];
  forbiddenFilePatterns: string[];
  maxCostUsd: number;
}

export const DEFAULT_AUTO_CONFIG: AutoModeConfig = {
  maxIterations: 50,
  forbiddenCommands: ['rm -rf /', 'sudo', 'curl | bash', 'wget | sh'],
  forbiddenFilePatterns: ['~/.ssh/*', '~/.aws/*', '*.env'],
  maxCostUsd: 5.0,
};

export class AutonomousAgent {
  private config: AutoModeConfig;
  private currentIteration: number = 0;
  private sessionId: string;

  constructor(config: Partial<AutoModeConfig> = {}) {
    this.config = { ...DEFAULT_AUTO_CONFIG, ...config };
    this.sessionId = uuidv4();
  }

  async runGoal(
    goal: string,
    context: { provider: string; model: string; apiKey?: string },
    onChunk: (chunk: any) => void
  ): Promise<string> {
    this.currentIteration = 0;

    onChunk({ type: 'thinking', content: `🎯 [AutonomousAgent] Starting goal: ${goal}\n` });

    const orchestrator = new AgentOrchestrator();

    const toolDefs = createTools(this.sessionId).map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.parameters }
    }));

    const orchestratorContext = {
      ...context,
      tools: toolDefs,
      executeToolCallback: async (name: string, args: any) => {
        if (!this.canExecuteCommand(name)) {
          return { error: `Command blocked by safety guardrails: ${name}` };
        }
        return executeTool(name, args, this.sessionId);
      },
    };

    try {
      const messages = [{ role: 'user' as const, content: goal }];
      const result = await orchestrator.orchestrateSupervisor(messages, orchestratorContext, (chunk) => {
        this.currentIteration++;
        if (this.currentIteration >= this.config.maxIterations) {
          onChunk({ type: 'thinking', content: `⚠️ [AutonomousAgent] Max iterations (${this.config.maxIterations}) reached.\n` });
        }
        onChunk(chunk);
      });
      return result;
    } finally {
      clearSessionMemos(this.sessionId);
    }
  }

  canExecuteCommand(cmd: string): boolean {
    return !this.config.forbiddenCommands.some(forbidden => cmd.includes(forbidden));
  }
}
