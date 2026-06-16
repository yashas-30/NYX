import { BaseAgent, BaseAgentConfig } from './baseAgent';
import { StreamEvent } from '@src/infrastructure/types';
import { PromptAnalysis } from '@src/core/services/promptClassifier';
import { ChatAgent } from './ChatAgent';
import { OpenCodeAgent } from './OpenCodeAgent';
import { ClineAgent } from './ClineAgent';
import { AIService } from '@src/core/services/ai.service';

export interface RouterAgentConfig extends BaseAgentConfig {
  enableToolLoop?: boolean;
  agentType?: string; // e.g. explicitly passed 'coder', 'chat', or 'cline'
}

interface ExecutionTask {
  id: string;
  agent: 'opencode' | 'cline' | 'chat';
  task: string;
  dependencies?: string[];
}

export class RouterAgent extends BaseAgent<RouterAgentConfig, StreamEvent> {
  async *streamResponse(
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    // If a specific agent type was requested bypassing routing, use it directly
    if (this.config.agentType && this.config.agentType !== 'chat') {
      yield* this.routeToSingleAgent(this.config.agentType, prompt, analysis, signal, searchContextPromise, images);
      return;
    }

    if (this.config.isFastIntent) {
      yield* this.emitThinking(`Router Coordinator: Fast intent detected. Routing directly to Chat agent...`, []);
      const chatAgent = new ChatAgent(this.config);
      const generator = chatAgent.streamResponse(prompt, analysis, signal, searchContextPromise, images);
      for await (const event of generator) {
        yield event;
      }
      return;
    }

    yield* this.emitThinking(`Router Coordinator: Analyzing prompt and decomposing into subtasks...`, []);

    try {
      const coordinatorPrompt = `You are the Router Coordinator.
Analyze the following user prompt and decompose it into an execution plan of subtasks.
Available agents:
- opencode: For writing code, debugging, or reviewing code.
- cline: For terminal commands, system operations, and browser automation.
- chat: For general chat, web search, or answering questions.

Provide the execution plan as a JSON array of objects with the following schema:
[
  {
    "id": "task_1",
    "agent": "chat",
    "task": "A focused, synthesized brief of exactly what this agent needs to do.",
    "dependencies": []
  }
]
Only output the JSON array. Do not include markdown formatting like \`\`\`json.

USER PROMPT:
${prompt}
`;

      const aiResponse = await AIService.execute(
        this.config.modelId,
        this.config.provider,
        coordinatorPrompt,
        this.config.apiKey,
        undefined, // systemInstruction
        this.config.settings,
        undefined, // onStream
        signal
      );

      let planText = aiResponse.text.trim();
      if (planText.startsWith('```json')) planText = planText.slice(7, -3).trim();
      if (planText.startsWith('```')) planText = planText.slice(3, -3).trim();

      const plan: ExecutionTask[] = JSON.parse(planText);

      if (!Array.isArray(plan) || plan.length === 0) {
        throw new Error('Invalid or empty execution plan generated.');
      }

      yield* this.emitThinking(`Router Coordinator: Decomposed into ${plan.length} tasks. Executing plan...`, [JSON.stringify(plan, null, 2)]);

      // Phase 2: Sequential Execution with Context Isolation (Synthesized Briefs)
      for (const task of plan) {
        yield* this.emitThinking(`Router Coordinator: Spawning ${task.agent.toUpperCase()} agent for task: ${task.id}...`, [task.task]);

        let specializedAgent;
        if (task.agent === 'opencode') {
          // Future Step 4: Adversarial Critic loop will be implemented inside OpenCodeAgent
          specializedAgent = new OpenCodeAgent(this.config);
        } else if (task.agent === 'cline') {
          specializedAgent = new ClineAgent(this.config);
        } else {
          specializedAgent = new ChatAgent(this.config);
        }

        // Pass the isolated synthesized brief as the prompt, instead of the raw user prompt
        const generator = specializedAgent.streamResponse(task.task, analysis, signal, undefined, images);

        for await (const event of generator) {
          yield event;
        }
      }

    } catch (e) {
      console.warn("Failed to decompose prompt. Falling back to simple routing.", e);
      // Fallback simple monolithic routing
      const isCodeTask = ['code_generation', 'code_debug', 'code_review', 'refactor', 'explain_code'].includes(analysis.intent);
      let targetAgentType = 'chat';
      if (isCodeTask && prompt.length > 50) {
        targetAgentType = 'opencode';
      } else if (prompt.toLowerCase().includes('terminal') || prompt.toLowerCase().includes('browser') || prompt.toLowerCase().includes('run command')) {
        targetAgentType = 'cline';
      }
      
      yield* this.emitThinking(`Router Orchestrator: Fallback routing task to ${targetAgentType.toUpperCase()} Agent...`, []);
      yield* this.routeToSingleAgent(targetAgentType, prompt, analysis, signal, searchContextPromise, images);
    }
  }

  private async *routeToSingleAgent(
    targetAgentType: string,
    prompt: string,
    analysis: PromptAnalysis,
    signal: AbortSignal,
    searchContextPromise?: Promise<string>,
    images?: any[]
  ): AsyncGenerator<StreamEvent> {
    let specializedAgent;
    if (targetAgentType === 'opencode') {
      specializedAgent = new OpenCodeAgent(this.config);
    } else if (targetAgentType === 'cline') {
      specializedAgent = new ClineAgent(this.config);
    } else {
      specializedAgent = new ChatAgent(this.config);
    }

    const generator = specializedAgent.streamResponse(prompt, analysis, signal, searchContextPromise, images);
    for await (const event of generator) {
      yield event;
    }
  }
}
