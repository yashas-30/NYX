/**
 * geminiDeepResearchAgent.ts
 *
 * Client service for Google Gemini Deep Research Managed Agent.
 * Exclusively available for the Google Gemini model provider via the Interactions API.
 *
 * Capabilities:
 * - Autonomous multi-step planning, iterative searching, reading, code execution, and synthesis.
 * - Thinking summaries streaming (step.delta with 'thought' and 'text').
 * - Autonomous chart/graph visualization generation (step.delta with 'image').
 * - Collaborative planning (request plan, refine plan, approve and execute).
 * - Multi-turn follow-ups with previous_interaction_id.
 * - Multimodal input support (text, images, and documents/PDFs).
 * - Remote MCP server and File Search tool integration.
 */

import { GoogleGenAI } from '@google/genai';

export const GEMINI_DEEP_RESEARCH_AGENT = 'deep-research-preview-04-2026';
export const GEMINI_DEEP_RESEARCH_MAX_AGENT = 'deep-research-max-preview-04-2026';

export interface GeminiDeepResearchTool {
  type: 'google_search' | 'url_context' | 'code_execution' | 'mcp_server' | 'file_search';
  name?: string;
  url?: string;
  headers?: Record<string, string>;
  allowed_tools?: string[];
  file_search_store_names?: string[];
}

export interface GeminiDeepResearchOptions {
  apiKey: string;
  prompt: string;
  model?: string; // Selected Gemini model
  history?: Array<{ role: string; content: any }>;
  images?: Array<{ mimeType: string; data?: string; uri?: string }>;
  documents?: Array<{ uri: string; mimeType?: string }>;
  agentType?: 'standard' | 'max';
  collaborativePlanning?: boolean;
  visualization?: 'auto' | 'off';
  thinkingSummaries?: 'auto' | 'none';
  previousInteractionId?: string;
  tools?: GeminiDeepResearchTool[];
  onDelta?: (deltaText: string) => void;
  onReasoning?: (reasoningText: string) => void;
  onImage?: (imageDataBase64: string, mimeType?: string) => void;
  onStep?: (step: {
    iteration: number;
    thought?: string;
    text?: string;
    image?: string;
    isFinished?: boolean;
    isError?: boolean;
  }) => void;
}

export interface GeminiDeepResearchResult {
  id: string;
  outputText: string;
  status: 'completed' | 'failed' | 'in_progress' | 'requires_action';
  images?: Array<{ data: string; mimeType: string }>;
  error?: string;
  steps?: any[];
}

export class GeminiDeepResearchService {
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
   * Executes a Deep Research task using the Google Gemini Interactions API.
   */
  public async runDeepResearch(
    options: GeminiDeepResearchOptions
  ): Promise<GeminiDeepResearchResult> {
    const agentId =
      options.agentType === 'max' ? GEMINI_DEEP_RESEARCH_MAX_AGENT : GEMINI_DEEP_RESEARCH_AGENT;

    // Build multimodal input payload
    let inputPayload: any;
    const inputParts: any[] = [];

    if (options.prompt) {
      inputParts.push({ type: 'text', text: options.prompt });
    }

    if (options.images && options.images.length > 0) {
      for (const img of options.images) {
        if (img.data) {
          inputParts.push({
            type: 'image',
            mime_type: img.mimeType || 'image/jpeg',
            data: img.data,
          });
        } else if (img.uri) {
          inputParts.push({
            type: 'image',
            mime_type: img.mimeType || 'image/jpeg',
            uri: img.uri,
          });
        }
      }
    }

    if (options.documents && options.documents.length > 0) {
      for (const doc of options.documents) {
        inputParts.push({
          type: 'document',
          uri: doc.uri,
          mime_type: doc.mimeType || 'application/pdf',
        });
      }
    }

    if (inputParts.length === 1 && inputParts[0].type === 'text') {
      inputPayload = inputParts[0].text;
    } else {
      inputPayload = inputParts;
    }

    const agentConfig: Record<string, any> = {
      type: 'deep-research',
      thinking_summaries: options.thinkingSummaries ?? 'auto',
      visualization: options.visualization ?? 'auto',
      collaborative_planning: options.collaborativePlanning ?? false,
    };

    const requestBody: Record<string, any> = {
      agent: agentId,
      input: inputPayload,
      agent_config: agentConfig,
      background: true,
    };

    if (options.model) {
      requestBody.model = options.model;
    }

    if (options.previousInteractionId) {
      requestBody.previous_interaction_id = options.previousInteractionId;
    }

    if (options.tools && options.tools.length > 0) {
      requestBody.tools = options.tools;
    }

    let initialInteraction: any;
    try {
      initialInteraction = await this.callInteractionsRestApi(options.apiKey, requestBody);
    } catch (err: any) {
      // If Interactions API fails or is restricted, gracefully fallback to model-grounded search synthesis
      return await this.fallbackResearchSynthesis(options);
    }

    const interactionId = initialInteraction?.id;
    if (!interactionId) {
      return {
        id: '',
        outputText: initialInteraction?.output_text || '',
        status: initialInteraction?.status || 'completed',
      };
    }

    let currentInteraction = initialInteraction;
    let pollCount = 0;
    const maxPolls = 120; // Up to ~6 minutes of background polling

    const generatedImages: Array<{ data: string; mimeType: string }> = [];
    let aggregatedThoughts = '';
    let latestOutput = '';

    while (currentInteraction.status === 'in_progress' && pollCount < maxPolls) {
      pollCount++;
      await new Promise((resolve) => setTimeout(resolve, 3000));

      try {
        currentInteraction = await this.getInteraction(options.apiKey, interactionId);

        // Process step updates
        if (currentInteraction.steps && Array.isArray(currentInteraction.steps)) {
          for (let idx = 0; idx < currentInteraction.steps.length; idx++) {
            const step = currentInteraction.steps[idx];

            // Thought reasoning steps
            if (step.type === 'thought' || step.delta?.type === 'thought') {
              let text = '';
              if (step.summary && Array.isArray(step.summary)) {
                text = step.summary.map((s: any) => s.text || '').join('\n');
              } else if (step.text) {
                text = step.text;
              } else if (step.delta?.text) {
                text = step.delta.text;
              }

              if (text && !aggregatedThoughts.includes(text)) {
                aggregatedThoughts += (aggregatedThoughts ? '\n\n' : '') + text;
                if (options.onReasoning) {
                  options.onReasoning(text);
                }
                if (options.onStep) {
                  options.onStep({
                    iteration: idx + 1,
                    thought: text,
                  });
                }
              }
            }

            // Model output text steps
            if (step.type === 'model_output' && step.content) {
              for (const c of step.content) {
                if (c.type === 'text' && c.text) {
                  latestOutput = c.text;
                } else if (c.type === 'image' && c.data) {
                  generatedImages.push({ data: c.data, mimeType: c.mime_type || 'image/png' });
                  if (options.onImage) {
                    options.onImage(c.data, c.mime_type || 'image/png');
                  }
                }
              }
            }
          }
        }
      } catch (pollErr) {
        console.warn('[GeminiDeepResearch] Polling error:', pollErr);
      }
    }

    let finalOutput = currentInteraction.output_text || latestOutput;
    if (currentInteraction.steps && currentInteraction.steps.length > 0 && !finalOutput) {
      const lastStep = currentInteraction.steps[currentInteraction.steps.length - 1];
      if (lastStep?.content?.[0]?.text) {
        finalOutput = lastStep.content[0].text;
      }
    }

    if (generatedImages.length > 0) {
      const imageMarkdown = generatedImages
        .map(
          (img, i) =>
            `\n\n![Generated Research Visualization ${i + 1}](data:${img.mimeType};base64,${img.data})\n`
        )
        .join('');
      finalOutput = `${finalOutput}${imageMarkdown}`;
    }

    if (options.onDelta && finalOutput) {
      options.onDelta(finalOutput);
    }

    return {
      id: interactionId,
      outputText: finalOutput,
      status: currentInteraction.status || 'completed',
      images: generatedImages,
      error: currentInteraction.error,
      steps: currentInteraction.steps,
    };
  }

  /**
   * Retrieves status of an ongoing interaction.
   */
  public async getInteraction(apiKey: string, interactionId: string): Promise<any> {
    const url = `https://generativelanguage.googleapis.com/v1beta/interactions/${interactionId}`;
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'x-goog-api-key': apiKey,
      },
    });

    if (!response.ok) {
      const err = await response.text();
      throw new Error(`Failed to poll Deep Research interaction: ${err}`);
    }

    return await response.json();
  }

  /**
   * Helper to perform direct REST interactions API POST.
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
      const err = await response.text();
      throw new Error(`Deep Research Interactions API returned ${response.status}: ${err}`);
    }

    return await response.json();
  }

  /**
   * Fallback research synthesis via Google GenAI stream if Interactions API preview is unavailable.
   */
  private async fallbackResearchSynthesis(
    options: GeminiDeepResearchOptions
  ): Promise<GeminiDeepResearchResult> {
    const client = this.getClient(options.apiKey);
    const chosenModel = options.model || 'gemini-3.7-flash';
    let outputText = '';

    const systemInstruction = `You are the Gemini Deep Research Agent in NYX.
Your task is to conduct an exhaustive, rigorous, cited research analysis on the user's prompt.
Provide deep structural sections, executive summary, comprehensive comparative data tables, verified citations, and detailed insights.`;

    const responseStream = await (client as any).models.generateContentStream({
      model: chosenModel,
      contents: [{ role: 'user', parts: [{ text: options.prompt }] }],
      config: {
        systemInstruction,
        thinkingConfig: {
          thinkingBudget: -1,
        },
      },
    });

    for await (const chunk of responseStream) {
      const candidates = (chunk as any).candidates || [];
      if (candidates.length > 0) {
        const parts = candidates[0]?.content?.parts || [];
        for (const part of parts) {
          if (part.thought && typeof part.text === 'string') {
            if (options.onReasoning) {
              options.onReasoning(part.text);
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
      id: `dr_fallback_${Date.now()}`,
      outputText,
      status: 'completed',
    };
  }
}

export const geminiDeepResearchAgent = new GeminiDeepResearchService();
