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
  maxCostUsd: 5.0
};

export class AutonomousAgent {
  private config: AutoModeConfig;
  private currentCost: number = 0;
  private currentIteration: number = 0;

  constructor(config: Partial<AutoModeConfig> = {}) {
    this.config = { ...DEFAULT_AUTO_CONFIG, ...config };
  }

  async runGoal(goal: string) {
    // 1. Create Plan
    // 2. Loop until complete or max iterations
    // 3. Check safety guardrails per step
    // 4. Checkpoint state
    console.log(`Starting autonomous execution for goal: ${goal}`);
  }

  canExecuteCommand(cmd: string): boolean {
    return !this.config.forbiddenCommands.some(forbidden => cmd.includes(forbidden));
  }
}
