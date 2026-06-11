import { AgentConfig, Task, ExecutionPlan } from './types.js';
import { UnifiedEngine } from '../../lib/aiEngine.js';

const AGENT_REGISTRY: Record<string, AgentConfig> = {
  architect: {
    id: 'architect',
    name: 'System Architect',
    systemPrompt: `You are a system architect. Design high-level architecture, data models, and API contracts. Output structured JSON plans.`,
    capabilities: ['architecture', 'system-design', 'api-design', 'data-modeling'],
    model: 'gemini-2.5-pro',
    provider: 'gemini',
    maxTokens: 4096,
    temperature: 0.2
  },
  coder: {
    id: 'coder',
    name: 'Implementation Engineer',
    systemPrompt: `You are a senior software engineer. Write complete, production-ready code. Follow the architecture provided.`,
    capabilities: ['coding', 'implementation', 'testing', 'debugging'],
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    maxTokens: 8192,
    temperature: 0.1
  },
  reviewer: {
    id: 'reviewer',
    name: 'Code Reviewer',
    systemPrompt: `You are a meticulous code reviewer. Check for bugs, security issues, performance problems, and style violations.`,
    capabilities: ['review', 'security', 'performance', 'best-practices'],
    model: 'gemini-2.5-pro',
    provider: 'gemini',
    maxTokens: 4096,
    temperature: 0.1
  },
  tester: {
    id: 'tester',
    name: 'QA Engineer',
    systemPrompt: `You are a QA engineer. Write comprehensive tests, identify edge cases, and verify correctness.`,
    capabilities: ['testing', 'edge-cases', 'verification'],
    model: 'gemini-2.5-flash',
    provider: 'gemini',
    maxTokens: 4096,
    temperature: 0.2
  },
  optimizer: {
    id: 'optimizer',
    name: 'Performance Engineer',
    systemPrompt: `You are a performance engineer. Optimize code for speed, memory, and scalability.`,
    capabilities: ['optimization', 'performance', 'refactoring'],
    model: 'gemini-2.5-pro',
    provider: 'gemini',
    maxTokens: 4096,
    temperature: 0.1
  }
};

export class AgentOrchestrator {
  async createExecutionPlan(task: Task): Promise<ExecutionPlan> {
    const requiredAgents = this.selectAgents(task);
    const dependencies = this.buildDependencyGraph(requiredAgents);
    const costEstimate = this.estimateCost(requiredAgents, task);

    return {
      agents: requiredAgents,
      dependencies,
      estimatedCost: costEstimate,
      estimatedTime: this.estimateTime(requiredAgents),
      parallelGroups: this.findParallelGroups(dependencies)
    };
  }

  async executePlan(plan: ExecutionPlan, context: any): Promise<any> {
    const results: Record<string, any> = {};

    for (const group of plan.parallelGroups) {
      const groupResults = await Promise.all(
        group.map(async (agentId) => {
          const agent = AGENT_REGISTRY[agentId];
          const input = this.prepareAgentInput(agent, context, results);
          const result = await this.runAgent(agent, input);
          results[agentId] = result;
          return result;
        })
      );
    }

    return results;
  }

  private selectAgents(task: Task): string[] {
    const selected: string[] = [];
    if (task.type === 'feature' || task.type === 'system-design') {
      selected.push('architect');
    }
    selected.push('coder');
    if (task.requirements?.includes('production')) {
      selected.push('reviewer');
    }
    if (task.requirements?.includes('tests')) {
      selected.push('tester');
    }
    if (task.requirements?.includes('performance')) {
      selected.push('optimizer');
    }
    return selected;
  }

  private buildDependencyGraph(agents: string[]): Map<string, string[]> {
    const graph = new Map<string, string[]>();
    if (agents.includes('coder') && agents.includes('architect')) {
      graph.set('coder', ['architect']);
    }
    if (agents.includes('reviewer') && agents.includes('coder')) {
      graph.set('reviewer', ['coder']);
    }
    if (agents.includes('tester') && agents.includes('coder')) {
      graph.set('tester', ['coder']);
    }
    if (agents.includes('optimizer')) {
      const deps = ['coder'];
      if (agents.includes('reviewer')) deps.push('reviewer');
      graph.set('optimizer', deps);
    }
    return graph;
  }

  private findParallelGroups(dependencies: Map<string, string[]>): string[][] {
    const inDegree = new Map<string, number>();
    const adjList = new Map<string, string[]>();

    for (const [agent, deps] of dependencies) {
      inDegree.set(agent, deps.length);
      for (const dep of deps) {
        if (!adjList.has(dep)) adjList.set(dep, []);
        adjList.get(dep)!.push(agent);
      }
    }

    const allAgents = new Set<string>();
    for (const [agent, deps] of dependencies) {
      allAgents.add(agent);
      for (const dep of deps) allAgents.add(dep);
    }

    for (const agent of allAgents) {
      if (!inDegree.has(agent)) inDegree.set(agent, 0);
    }

    const groups: string[][] = [];
    let current = Array.from(inDegree.entries())
      .filter(([, degree]) => degree === 0)
      .map(([agent]) => agent);

    while (current.length > 0) {
      groups.push(current);
      const next: string[] = [];

      for (const agent of current) {
        for (const dependent of adjList.get(agent) || []) {
          const newDegree = (inDegree.get(dependent) || 0) - 1;
          inDegree.set(dependent, newDegree);
          if (newDegree === 0) next.push(dependent);
        }
      }

      current = next;
    }

    return groups;
  }

  private async runAgent(agent: AgentConfig, input: any): Promise<any> {
    const messages = [
      { role: 'system', content: agent.systemPrompt },
      { role: 'user', content: input.prompt }
    ];

    let fullText = '';
    
    // Override provider and model if provided in context (e.g., local model selection)
    const providerToUse = input.provider || agent.provider;
    const modelToUse = input.model || agent.model;
    
    await new Promise<void>((resolve, reject) => {
      UnifiedEngine.executeStream(
        {
          provider: providerToUse as any,
          model: modelToUse,
          messages: messages as any[],
          apiKey: input.apiKey,
          settings: { temperature: agent.temperature, maxTokens: agent.maxTokens }
        },
        (chunk: any) => {
          fullText += chunk.chunk || chunk.token || chunk.choices?.[0]?.delta?.content || '';
        },
        () => {
          resolve();
        }
      ).catch(reject);
    });

    return {
      agent: agent.id,
      output: fullText,
    };
  }

  private estimateCost(agents: string[], task: Task): number {
    return agents.reduce((sum, id) => {
      return sum + 0.002;
    }, 0);
  }

  private estimateTime(agents: string[]): number {
    const groups = this.findParallelGroups(this.buildDependencyGraph(agents));
    return groups.length * 5000;
  }

  private prepareAgentInput(agent: AgentConfig, context: any, previousResults: Record<string, any>): any {
    let contextPrompt = context.prompt;
    if (Object.keys(previousResults).length > 0) {
      contextPrompt += '\n\nPrevious Agent Results:\n' + JSON.stringify(previousResults, null, 2);
    }
    
    // Resolve apiKey dynamically based on the provider we end up using
    const overrideProvider = context.provider || agent.provider;
    
    return {
      prompt: contextPrompt,
      apiKey: context.apiKeys?.[overrideProvider] || '',
      provider: context.provider,
      model: context.modelId || context.model,
      previousResults,
      codebase: context.codebase,
      requirements: context.requirements
    };
  }
}
