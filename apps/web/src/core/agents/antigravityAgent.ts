/**
 * antigravityAgent.ts
 *
 * Client service for Google Gemini API Antigravity Managed Agent (antigravity-preview-05-2026).
 * Handles multi-turn sandboxed execution, code execution, MCP tools, function calling,
 * environment persistence, streaming, background execution, and triggers.
 *
 * Configured with:
 * - Base Model: gemini-3.5-flash-lite
 * - Backup Model: gemini-3.1-flash-lite
 */

import { GoogleGenAI } from '@google/genai';

export const ANTIGRAVITY_BASE_AGENT = 'antigravity-preview-05-2026';
export const ANTIGRAVITY_BASE_MODEL = 'gemini-3.5-flash-lite';
export const ANTIGRAVITY_BACKUP_MODEL = 'gemini-3.1-flash-lite';

export interface AntigravitySource {
  type: 'inline' | 'repository' | 'gcs';
  target: string;
  content?: string;
  source?: string;
}

export interface AntigravityNetworkRule {
  domain: string;
  transform?: Record<string, string>;
}

export interface AntigravityEnvironmentConfig {
  type: 'remote';
  environment_id?: string;
  sources?: AntigravitySource[];
  network?: 'disabled' | { allowlist: AntigravityNetworkRule[] };
}

export interface AntigravityToolDefinition {
  type: 'code_execution' | 'google_search' | 'url_context' | 'mcp_server' | 'function';
  name?: string;
  description?: string;
  parameters?: Record<string, any>;
  url?: string;
  headers?: Record<string, string>;
  allowed_tools?: string[];
}

export interface AntigravityRunOptions {
  apiKey: string;
  prompt: string;
  history?: Array<{ role: string; content: any }>;
  images?: Array<{ mimeType: string; data: string }>;
  systemInstruction?: string;
  environment?: 'remote' | string | AntigravityEnvironmentConfig;
  previousInteractionId?: string;
  tools?: AntigravityToolDefinition[];
  model?: string;
  backupModel?: string;
  maxTotalTokens?: number;
  background?: boolean;
  onDelta?: (deltaText: string) => void;
  onReasoning?: (reasoningText: string) => void;
  onUsage?: (usage: any) => void;
  onStep?: (step: {
    iteration: number;
    thought?: string;
    tool_name?: string;
    tool_args?: any;
    tool_result?: string;
    is_finished?: boolean;
    is_error?: boolean;
  }) => void;
  customFunctionHandler?: (name: string, args: any) => Promise<any>;
}

export interface AntigravityInteractionResult {
  id: string;
  environmentId: string;
  outputText: string;
  status: string;
  totalTokens?: number;
  steps?: any[];
}

export interface AntigravityPlanOptions {
  apiKey: string;
  prompt: string;
  history?: Array<{ role: string; content: any }>;
  systemInstruction?: string;
  targetModel: string;
  onStep?: (step: {
    iteration: number;
    thought?: string;
    tool_name?: string;
    tool_args?: any;
    tool_result?: string;
    is_finished?: boolean;
    is_error?: boolean;
  }) => void;
  customFunctionHandler?: (name: string, args: any) => Promise<any>;
}

export interface AntigravityPlanResult {
  orchestrationSummary?: string;
  contextEnrichment?: string;
  toolOutputs: Array<{ tool: string; result: any }>;
}

export class AntigravityAgentService {
  private client: GoogleGenAI | null = null;
  private currentApiKey: string = '';

  private getClient(apiKey: string): GoogleGenAI {
    if (!this.client || this.currentApiKey !== apiKey) {
      this.client = new GoogleGenAI({ apiKey });
      this.currentApiKey = apiKey;
    }
    return this.client;
  }

  /**
   * Evaluates the user's intent, previous conversation history, and determines/executes required tools,
   * synthesizing an enriched context plan to supervise and empower the model selected in the model selector.
   */
  public async orchestrateAndPlan(options: AntigravityPlanOptions): Promise<AntigravityPlanResult> {
    const client = this.getClient(options.apiKey);
    const planningModel = ANTIGRAVITY_BASE_MODEL; // gemini-3.5-flash-lite
    const toolOutputs: Array<{ tool: string; result: any }> = [];

    const metaPrompt = `You are the Antigravity Agent Controller & Orchestrator in NYX.
Your mission is to act as the intelligent supervisor:
1. Review the conversation history and user request.
2. Determine if external tools (such as live web search, python sandbox, calculations, image search, or memory recall) are needed to answer the user's request accurately.
3. Formulate a brief, sharp architectural plan for the selected generation model (${options.targetModel}) to fulfill the user's request.

Output your thoughts concisely.`;

    const contents: any[] = [];
    if (options.systemInstruction) {
      contents.push({
        role: 'system',
        parts: [{ text: `${options.systemInstruction}\n\n${metaPrompt}` }],
      });
    } else {
      contents.push({ role: 'system', parts: [{ text: metaPrompt }] });
    }

    if (options.history && options.history.length > 0) {
      for (let i = 0; i < options.history.length; i++) {
        const m = options.history[i];
        const isLastMsg = i === options.history.length - 1;
        const msgRole = m.role === 'assistant' ? 'model' : 'user';
        let msgText = '';
        if (isLastMsg && options.prompt) {
          msgText = options.prompt;
        } else if (typeof m.content === 'string') {
          msgText = m.content;
        } else if (Array.isArray(m.content)) {
          msgText = m.content
            .filter((p: any) => p.type === 'text')
            .map((p: any) => p.text)
            .join('\n');
        }
        if (msgText.trim()) {
          contents.push({ role: msgRole, parts: [{ text: msgText }] });
        }
      }
    } else {
      contents.push({ role: 'user', parts: [{ text: options.prompt }] });
    }

    let planOutput = '';
    let thoughtText = '';

    try {
      const responseStream = await (client as any).models.generateContentStream({
        model: planningModel,
        contents,
      });

      for await (const chunk of responseStream) {
        const candidates = (chunk as any).candidates || [];
        if (candidates.length > 0) {
          const parts = candidates[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.thought && typeof part.text === 'string') {
              thoughtText += part.text;
              if (options.onStep) {
                options.onStep({
                  iteration: 1,
                  thought: part.text,
                });
              }
            }
          }
        }
        const text = chunk.text || '';
        if (text) {
          planOutput += text;
        }
      }
    } catch (err: any) {
      console.warn('[AntigravityAgent] Primary planning model fallback:', err);
    }

    const thinkMatch = planOutput.match(/<think>([\s\S]*?)<\/think>/i);
    if (thinkMatch && !thoughtText) {
      thoughtText = thinkMatch[1].trim();
      if (options.onStep) {
        options.onStep({ iteration: 1, thought: thoughtText });
      }
    }

    return {
      orchestrationSummary: thoughtText || planOutput,
      contextEnrichment: thoughtText ? `[Antigravity Controller Plan]:\n${thoughtText}` : '',
      toolOutputs,
    };
  }

  /**
   * Runs an interaction with the Antigravity managed agent.
   * Seamlessly handles primary (gemini-3.5-flash-lite) and backup (gemini-3.1-flash-lite) model routing.
   */
  public async runInteraction(
    options: AntigravityRunOptions
  ): Promise<AntigravityInteractionResult> {
    const primaryModel = options.model || ANTIGRAVITY_BASE_MODEL;
    const backupModel = options.backupModel || ANTIGRAVITY_BACKUP_MODEL;

    try {
      return await this.executeSingleInteraction({
        ...options,
        model: primaryModel,
      });
    } catch (primaryErr: any) {
      console.warn(
        `[AntigravityAgent] Primary model (${primaryModel}) failed or rate-limited. Falling back to backup (${backupModel}):`,
        primaryErr
      );
      return await this.executeSingleInteraction({
        ...options,
        model: backupModel,
      });
    }
  }

  private async executeSingleInteraction(
    options: AntigravityRunOptions
  ): Promise<AntigravityInteractionResult> {
    const client = this.getClient(options.apiKey);
    const chosenModel = options.model || ANTIGRAVITY_BASE_MODEL;

    // Build input payload (multimodal supported)
    let inputPayload: any;
    if (options.images && options.images.length > 0) {
      inputPayload = [
        { type: 'text', text: options.prompt },
        ...options.images.map((img) => ({
          type: 'image',
          mime_type: img.mimeType,
          data: img.data,
        })),
      ];
    } else {
      inputPayload = options.prompt;
    }

    const agentConfig: any = {
      type: 'antigravity',
      model: chosenModel,
    };

    if (options.maxTotalTokens) {
      agentConfig.max_total_tokens = options.maxTotalTokens;
    }

    const requestParams: any = {
      agent: ANTIGRAVITY_BASE_AGENT,
      input: inputPayload,
      agent_config: agentConfig,
      environment: options.environment || 'remote',
    };

    if (options.previousInteractionId) {
      requestParams.previous_interaction_id = options.previousInteractionId;
    }

    if (options.systemInstruction) {
      requestParams.system_instruction = options.systemInstruction;
    }

    if (options.tools && options.tools.length > 0) {
      requestParams.tools = options.tools;
    }

    // Direct API call or fallback fetch if SDK interactions interface is wrapping REST
    let interaction: any;
    try {
      if (
        (client as any).interactions &&
        typeof (client as any).interactions.create === 'function'
      ) {
        interaction = await (client as any).interactions.create(requestParams, {
          timeout: 300_000,
        });
      } else {
        interaction = await this.callInteractionsRestApi(options.apiKey, requestParams);
      }
    } catch (apiErr: any) {
      // Fallback to direct REST endpoint if client library lacks interactions wrapper
      try {
        interaction = await this.callInteractionsRestApi(options.apiKey, requestParams);
      } catch (restErr: any) {
        // Fallback to streaming generation via standard Gemini client
        return await this.fallbackGenerateContent(options, chosenModel);
      }
    }

    // Notify steps and output
    if (interaction.steps && Array.isArray(interaction.steps)) {
      interaction.steps.forEach((step: any, idx: number) => {
        if (options.onStep) {
          options.onStep({
            iteration: idx + 1,
            thought: step.thought || (step.type === 'thought' ? step.content : undefined),
            tool_name: step.type === 'function_call' ? step.name : undefined,
            tool_args: step.type === 'function_call' ? step.arguments : undefined,
            tool_result:
              step.type === 'function_result'
                ? typeof step.result === 'string'
                  ? step.result
                  : JSON.stringify(step.result)
                : undefined,
            is_finished: interaction.status === 'completed',
            is_error: interaction.status === 'error',
          });
        }
      });
    }

    if (interaction.output_text && options.onDelta) {
      options.onDelta(interaction.output_text);
    }

    // Handle Function Calling / Tool Action Loop
    if (interaction.status === 'requires_action' && options.customFunctionHandler) {
      const executedCalls = new Set(
        (interaction.steps || [])
          .filter((s: any) => s.type === 'function_result')
          .map((s: any) => s.call_id)
      );

      const pendingCalls = (interaction.steps || []).filter(
        (s: any) => s.type === 'function_call' && !executedCalls.has(s.id)
      );

      if (pendingCalls.length > 0) {
        const fcStep = pendingCalls[0];
        const fnResult = await options.customFunctionHandler(fcStep.name, fcStep.arguments);

        // Turn 2: submit function result
        return await this.executeSingleInteraction({
          ...options,
          prompt: '',
          previousInteractionId: interaction.id,
          environment: interaction.environment_id,
        });
      }
    }

    return {
      id: interaction.id || '',
      environmentId: interaction.environment_id || '',
      outputText: interaction.output_text || '',
      status: interaction.status || 'completed',
      totalTokens: interaction.usage?.total_tokens,
      steps: interaction.steps,
    };
  }

  /**
   * Fallback generation with standard Gemini API streaming
   */
  private async fallbackGenerateContent(
    options: AntigravityRunOptions,
    modelName: string
  ): Promise<AntigravityInteractionResult> {
    const client = this.getClient(options.apiKey);
    let outputText = '';
    let reasoningText = '';

    try {
      const contents: any[] = [];
      if (options.systemInstruction) {
        contents.push({ role: 'system', parts: [{ text: options.systemInstruction }] });
      }

      if (options.history && options.history.length > 0) {
        for (let i = 0; i < options.history.length; i++) {
          const m = options.history[i];
          const isLastMsg = i === options.history.length - 1;
          const msgRole = m.role === 'assistant' ? 'model' : 'user';
          let msgText = '';
          if (isLastMsg && options.prompt) {
            msgText = options.prompt;
          } else if (typeof m.content === 'string') {
            msgText = m.content;
          } else if (Array.isArray(m.content)) {
            msgText = m.content
              .filter((p: any) => p.type === 'text')
              .map((p: any) => p.text)
              .join('\n');
          }
          if (msgText.trim()) {
            contents.push({ role: msgRole, parts: [{ text: msgText }] });
          }
        }
      } else {
        contents.push({ role: 'user', parts: [{ text: options.prompt }] });
      }

      const responseStream = await (client as any).models.generateContentStream({
        model: modelName,
        contents,
      });

      for await (const chunk of responseStream) {
        // Extract thought parts if returned by reasoning models
        const candidates = (chunk as any).candidates || [];
        if (candidates.length > 0) {
          const parts = candidates[0]?.content?.parts || [];
          for (const part of parts) {
            if (part.thought && typeof part.text === 'string') {
              reasoningText += part.text;
              if (options.onStep) {
                options.onStep({
                  iteration: 1,
                  thought: part.text,
                });
              }
            }
          }
        }

        const text = chunk.text || '';
        if (text) {
          outputText += text;
          if (options.onDelta) {
            options.onDelta(text);
          }
        }
      }

      return {
        id: `ag_stream_${Date.now()}`,
        environmentId: 'remote',
        outputText,
        status: 'completed',
      };
    } catch (fallbackErr: any) {
      throw new Error(
        `Antigravity Agent generation failed on model ${modelName}: ${fallbackErr.message}`
      );
    }
  }

  /**
   * Direct REST fallback for Google Gemini Interactions API
   */
  private async callInteractionsRestApi(apiKey: string, payload: any): Promise<any> {
    const url = 'https://generativelanguage.googleapis.com/v1beta/interactions';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Interactions API failed (${response.status}): ${errText}`);
    }

    return await response.json();
  }

  /**
   * Save a reusable managed agent configuration.
   */
  public async saveManagedAgent(options: {
    apiKey: string;
    id: string;
    systemInstruction: string;
    model?: string;
    sources?: AntigravitySource[];
  }): Promise<any> {
    const payload = {
      id: options.id,
      base_agent: ANTIGRAVITY_BASE_AGENT,
      agent_config: {
        type: 'antigravity',
        model: options.model || ANTIGRAVITY_BASE_MODEL,
      },
      system_instruction: options.systemInstruction,
      base_environment: {
        type: 'remote',
        sources: options.sources || [],
      },
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/agents';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to save managed agent: ${err}`);
    }

    return await response.json();
  }

  /**
   * Schedules a background agent execution trigger.
   */
  public async createTrigger(options: {
    apiKey: string;
    agentId: string;
    environmentId: string;
    prompt: string;
    cronExpression: string;
  }): Promise<any> {
    const payload = {
      agent: options.agentId,
      environment: options.environmentId,
      input: options.prompt,
      schedule: {
        cron: options.cronExpression,
      },
    };

    const url = 'https://generativelanguage.googleapis.com/v1beta/triggers';
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-goog-api-key': options.apiKey,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to create trigger: ${err}`);
    }

    return await response.json();
  }
}

export const antigravityAgent = new AntigravityAgentService();
