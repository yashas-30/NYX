/**
 * Analysis Service - Structured service for running model analysis
 * Handles model selection, API key resolution, and response parsing
 */

import { callAI, isCodePrompt, AISettings } from '@/src/lib/api/inferenceClient';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { Provider, ModelDefinition } from '@/src/core/types';
import { OllamaModel } from '@/src/types';
import { BugCollector } from './bugCollector';

// ============================================================================
// Type Definitions
// ============================================================================

export interface AnalysisModelConfig {
  modelId: string;
  provider: Provider;
  apiKey: string;
  label: string;
  baseUrl?: string;
}

export interface AnalysisResponse {
  bestResponseId: string;
  consensus: string;
  methodology?: string;
  differences: Array<{
    category: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }>;
  critique: Record<string, {
    analysis: string;
    actionableFeedback: string;
    score: number | string;
  }>;
}

export interface AnalysisResult {
  success: boolean;
  data?: AnalysisResponse;
  error?: string;
  debugInfo?: {
    modelUsed: string;
    provider: string;
    responseLength: number;
    parseTime: number;
  };
}

// ============================================================================
// Model Resolution - Structured way to find correct model and API key
// ============================================================================

const MODEL_PROVIDER_MAP: Record<string, { provider: Provider; label: string }> = {
  // Gemini models
  'gemini-3.1-pro-preview': { provider: 'gemini', label: 'Gemini 3.1 Pro' },
  'gemini-3-flash-preview': { provider: 'gemini', label: 'Gemini 3 Flash' },
  'gemini-3.1-flash-lite': { provider: 'gemini', label: 'Gemini 3.1 Flash Lite' },
  'gemini-2.5-pro': { provider: 'gemini', label: 'Gemini 2.5 Pro' },
  'gemini-2.5-flash': { provider: 'gemini', label: 'Gemini 2.5 Flash' },
  'gemini-2.5-flash-lite': { provider: 'gemini', label: 'Gemini 2.5 Flash Lite' },
  
  // NVIDIA models
  'moonshotai/kimi-k2.6-think': { provider: 'nvidia', label: 'Kimi K2.6 (Thinking)' },
  'moonshotai/kimi-k2.6': { provider: 'nvidia', label: 'Kimi K2.6 (Fast)' },
  
  // OpenRouter models - Paid models
  'google/gemini-pro-1.5': { provider: 'openrouter', label: 'Gemini 1.5 Pro' },
  'anthropic/claude-3.5-sonnet': { provider: 'openrouter', label: 'Claude 3.5 Sonnet' },
  'meta-llama/llama-3.1-405b-instruct': { provider: 'openrouter', label: 'Llama 3.1 405B' },
  'meta-llama/llama-3.1-70b-instruct': { provider: 'openrouter', label: 'Llama 3.1 70B' },
  'qwen/qwen-2.5-72b-instruct': { provider: 'openrouter', label: 'Qwen 2.5 72B' },
  'deepseek/deepseek-coder': { provider: 'openrouter', label: 'DeepSeek Coder' },
  'qwen/qwen-2.5-coder-32b-instruct': { provider: 'openrouter', label: 'Qwen 2.5 Coder' },
  
  // OpenRouter Free Models
  'google/gemma-2-9b-it:free': { provider: 'openrouter', label: 'Gemma 2 9B (Free)' },
  'meta-llama/llama-3.1-8b-instruct:free': { provider: 'openrouter', label: 'Llama 3.1 8B (Free)' },
  'mistralai/mistral-7b-instruct:free': { provider: 'openrouter', label: 'Mistral 7B (Free)' },
  'microsoft/phi-3-mini-128k-instruct:free': { provider: 'openrouter', label: 'Phi-3 Mini (Free)' },
  'qwen/qwen-2-7b-instruct:free': { provider: 'openrouter', label: 'Qwen 2 7B (Free)' },
  
  // OpenAI models
  'gpt-4o': { provider: 'openai', label: 'GPT-4o (OpenAI)' },
  'gpt-4o-mini': { provider: 'openai', label: 'GPT-4o Mini' },
  
  // Anthropic models
  'claude-3-5-sonnet-20241022': { provider: 'anthropic', label: 'Claude 3.5 Sonnet' },
  'claude-3-opus-20240229': { provider: 'anthropic', label: 'Claude 3 Opus' },
};

// ============================================================================
// Model Provider Detection - Same logic as comparison grid (analysisHelpers.ts)
// ============================================================================

/**
 * Detect provider exactly like comparison grid does
 */
function detectProviderForAnalysis(
  modelId: string,
  ollamaModels: ModelDefinition[] | OllamaModel[] = [],
  lmStudioModels: any[] = []
): Provider {
  // Check local Ollama models - OllamaModel has name, ModelDefinition has both id and name
  const isOllamaModel = (m: any): boolean => {
    if (m.id !== undefined) return m.id === modelId || m.name === modelId;
    return m.name === modelId;
  };
  if (ollamaModels?.some(isOllamaModel)) {
    return 'ollama';
  }

  // Check local LM Studio models
  if (lmStudioModels?.some((m: any) => m.id === modelId || m.name === modelId)) {
    return 'lmstudio';
  }
  
  // Check available cloud models
  const availableModel = AVAILABLE_MODELS.find(m => m.id === modelId);
  if (availableModel) {
    return availableModel.provider as Provider;
  }
  
  // Default fallback - same as comparison grid
  if (modelId.includes('/')) return 'openrouter';
  return 'gemini';
}

// ============================================================================
// Model Resolution - Structured way to find correct model and API key
// ============================================================================

/**
 * Resolve model configuration - uses same logic as comparison grid
 */
export function resolveModelConfig(
  modelId: string,
  apiKeys: Record<string, string>,
  ollamaModels: ModelDefinition[] | OllamaModel[] = [],
  lmStudioModels: any[] = [],
  lmStudioBaseUrl?: string,
  ollamaBaseUrl?: string
): AnalysisModelConfig | null {
  BugCollector.logEntry('AnalysisService', 'resolveModelConfig', { modelId, availableKeys: Object.keys(apiKeys) });
  
  // Check for local Ollama first
  const ollama = ollamaModels.find((m: any) => (m.id === modelId || m.name === modelId));
  if (ollama) {
    return {
      modelId,
      provider: 'ollama',
      label: `Ollama: ${ollama.name || modelId}`,
      apiKey: '',
      baseUrl: ollamaBaseUrl || 'http://localhost:11434'
    };
  }
  
  // Check for LM Studio
  const lms = lmStudioModels.find((m: any) => (m.id === modelId || m.name === modelId));
  if (lms) {
    return {
      modelId,
      provider: 'lmstudio',
      label: `LM Studio: ${lms.name || lms.id || modelId}`,
      apiKey: '',
      baseUrl: lmStudioBaseUrl || 'http://localhost:1234'
    };
  }

  // Use the same provider detection as comparison grid
  const provider = detectProviderForAnalysis(modelId, ollamaModels, lmStudioModels);
  
  // First check our explicit map
  let config = MODEL_PROVIDER_MAP[modelId];
  
  // If not found in map, use the detected provider
  if (!config) {
    const availableModel = AVAILABLE_MODELS.find(m => m.id === modelId);
    if (availableModel) {
      config = {
        provider: availableModel.provider as Provider,
        label: availableModel.name
      };
    } else {
      config = { provider, label: modelId };
    }
  }
  
  // Ensure we use the detected provider
  config = { ...config, provider };
  
  // Get API key for the provider
  const apiKey = apiKeys[provider];
  
  if (!apiKey || apiKey.trim().length === 0) {
    BugCollector.report(
      'AnalysisService',
      `Missing API key for provider: ${config.provider}`,
      { modelId, provider: config.provider, availableKeys: Object.keys(apiKeys) },
      'high'
    );
    BugCollector.logExit('AnalysisService', 'resolveModelConfig', null);
    return null;
  }
  
  const result = {
    modelId,
    provider: config.provider,
    apiKey: apiKey.trim(),
    label: config.label
  };
  
  BugCollector.logExit('AnalysisService', 'resolveModelConfig', result);
  return result;
}

/**
 * Get available analysis models with their provider info
 */
export function getAvailableAnalysisModels(apiKeys: Record<string, string>): AnalysisModelConfig[] {
  BugCollector.logEntry('AnalysisService', 'getAvailableAnalysisModels', { apiKeys: Object.keys(apiKeys) });
  
  const available: AnalysisModelConfig[] = [];
  
  // Priority order for analysis models - use actual valid model IDs
  // Free models first (no API key cost), then paid models
  const priorityModels = [
    // Gemini models (if key available)
    'gemini-3.1-pro-preview',
    'gemini-2.5-flash', 
    'gemini-2.5-flash-lite',
    // OpenRouter Free models (no cost)
    'google/gemma-2-9b-it:free',
    'meta-llama/llama-3.1-8b-instruct:free',
    'mistralai/mistral-7b-instruct:free',
    'microsoft/phi-3-mini-128k-instruct:free',
    'qwen/qwen-2-7b-instruct:free',
    // OpenRouter Paid models
    'google/gemini-pro-1.5',
    'anthropic/claude-3.5-sonnet',
    'meta-llama/llama-3.1-70b-instruct',
    'meta-llama/llama-3.1-405b-instruct',
    // NVIDIA
    'moonshotai/kimi-k2.6'
  ];
  
  for (const modelId of priorityModels) {
    const config = resolveModelConfig(modelId, apiKeys);
    if (config) {
      available.push(config);
    }
  }
  
  BugCollector.logExit('AnalysisService', 'getAvailableAnalysisModels', { count: available.length });
  return available;
}

// ============================================================================
// JSON Extraction - Robust parsing with error handling
// ============================================================================

/**
 * Extract JSON from model response with comprehensive error handling
 */
function extractAnalysisJSON(text: string): AnalysisResponse {
  BugCollector.logEntry('AnalysisService', 'extractAnalysisJSON', { textLength: text?.length });
  
  if (!text || text.trim().length === 0) {
    BugCollector.report('AnalysisService', 'Empty response from model', { text }, 'critical');
    throw new Error('Model returned empty response. No data received from the API.');
  }
  
  // Check for error indicators in response
  const lowerText = text.toLowerCase();
  if (lowerText.includes('error') || lowerText.includes('failed') || lowerText.includes('exception')) {
    // Try to extract error message
    const errorMatch = text.match(/"?error"?[\s:]*"?([^"]+)"?/i) || text.match(/error[\s:]+(.+)/i);
    const errorMsg = errorMatch ? errorMatch[1].substring(0, 100) : text.substring(0, 150);
    BugCollector.report('AnalysisService', 'API returned error', { error: errorMsg, fullResponse: text.substring(0, 500) }, 'critical');
    throw new Error(`API Error: ${errorMsg}`);
  }
  
  // Try markdown code block first
  let content = text;
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (markdownMatch) {
    content = markdownMatch[1];
  }
  
  // Try to find JSON object
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    content = jsonMatch[0];
  }
  
  // Validate JSON
  try {
    const parsed = JSON.parse(content);
    BugCollector.logExit('AnalysisService', 'extractAnalysisJSON', 'success');
    return parsed as AnalysisResponse;
  } catch (parseError: any) {
    // Try alternative brace matching
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const candidate = content.substring(startIdx, endIdx + 1);
      try {
        const parsed = JSON.parse(candidate);
        BugCollector.logExit('AnalysisService', 'extractAnalysisJSON', 'success (fallback)');
        return parsed as AnalysisResponse;
      } catch {}
    }
    
    // If all parsing fails, report the bug
    BugCollector.report(
      'AnalysisService',
      'Failed to parse JSON from model response',
      { 
        error: parseError.message, 
        textPreview: text.substring(0, 300),
        textLength: text.length
      },
      'high'
    );
    
    throw new Error(`Model returned invalid JSON. The response format was not recognized. Response preview: ${text.substring(0, 200)}...`);
  }
}

// ============================================================================
// Main Analysis Function
// ============================================================================

/**
 * Run standard analysis on model responses
 */
export async function runStandardAnalysis(
  globalPrompt: string,
  responses: Array<{ modelId: string; output: string; localPrompt?: string }>,
  analysisModelConfig: AnalysisModelConfig
): Promise<AnalysisResult> {
  const startTime = Date.now();
  BugCollector.logEntry('AnalysisService', 'runStandardAnalysis', {
    promptLength: globalPrompt.length,
    responseCount: responses.length,
    model: analysisModelConfig.modelId,
    provider: analysisModelConfig.provider
  });
  
  // Format responses for the judge prompt
  const formattedResponses = responses
    .map(r => `
MODEL [${r.modelId}]:
SOURCE PROMPT: ${r.localPrompt || globalPrompt}
OUTPUT:
${r.output}
---`)
    .join("\n\n");
  
  // Build the judge prompt
  const judgePrompt = `
You are an expert AI evaluator comparing responses from different language models.
Find a "Daily Driver" model based on Memory, Formatting, Nuance, Logic, and Efficiency.

USER PROMPT: "${globalPrompt}"

RULES:
1. Reference each model by its exact ID shown in brackets.
2. Output ONLY raw JSON matching the schema below. 
3. DO NOT include any markdown code fences or conversational text.
4. "consensus" is a synthesized best-answer in markdown.

SCHEMA:
{
  "bestResponseId": "exact modelId string",
  "consensus": "Synthesized markdown answer",
  "methodology": "Daily-Driver Optimization Audit",
  "differences": [
    {
      "category": "Memory|Formatting|Nuance|Logic|Efficiency",
      "description": "Short divergence description",
      "impact": "high|medium|low"
    }
  ],
  "critique": {
    "<modelId>": {
      "analysis": "Pillar-focused analysis",
      "actionableFeedback": "Specific improvement tip",
      "score": <0-100>
    }
  }
}

MODEL RESPONSES:
${formattedResponses}
`;
  
  try {
    // Call the AI
    const result = await callAI(
      analysisModelConfig.modelId,
      analysisModelConfig.provider,
      judgePrompt,
      analysisModelConfig.apiKey,
      "Output ONLY valid JSON. No markdown fences. No yapping.",
      { maxTokens: 8192 },
      undefined,
      undefined,
      undefined,
      undefined,
      { 
        lmStudioBaseUrl: analysisModelConfig.provider === 'lmstudio' ? analysisModelConfig.baseUrl : undefined,
        ollamaBaseUrl: analysisModelConfig.provider === 'ollama' ? analysisModelConfig.baseUrl : undefined
      }
    );
    
    const parseTime = Date.now() - startTime;
    
    BugCollector.logEntry('AnalysisService', 'runStandardAnalysis parse', {
      responseLength: result.text?.length,
      parseTime
    });
    
    // Extract and validate JSON
    const analysisData = extractAnalysisJSON(result.text);
    
    const successResult: AnalysisResult = {
      success: true,
      data: analysisData,
      debugInfo: {
        modelUsed: analysisModelConfig.modelId,
        provider: analysisModelConfig.provider,
        responseLength: result.text?.length || 0,
        parseTime
      }
    };
    
    BugCollector.logExit('AnalysisService', 'runStandardAnalysis', 'success');
    return successResult;
    
  } catch (error: any) {
    BugCollector.logError('AnalysisService', 'runStandardAnalysis', error);
    
    const errorMessage = error.message || String(error);
    
    let userMessage = errorMessage;
    
    if (errorMessage.includes('quota') || errorMessage.includes('429') || errorMessage.includes('RESOURCE_EXHAUSTED')) {
      userMessage = `API quota exceeded for ${analysisModelConfig.label}. Check your provider dashboard.`;
    } else if (errorMessage.includes('format')) {
      userMessage = errorMessage;
    } else if (errorMessage.includes('API key') || errorMessage.includes('unauthorized') || errorMessage.includes('401')) {
      userMessage = `Invalid API key for ${analysisModelConfig.label}. Please check your Settings.`;
    } else if (errorMessage.includes('No response') || errorMessage.includes('empty')) {
      userMessage = `No response from ${analysisModelConfig.label}. The service may be unavailable.`;
    } else if (errorMessage.includes('JSON') || errorMessage.includes('invalid')) {
      userMessage = `Model returned invalid response. Try selecting a different model for analysis.`;
    }
    
    return {
      success: false,
      error: userMessage,
      debugInfo: {
        modelUsed: analysisModelConfig.modelId,
        provider: analysisModelConfig.provider,
        responseLength: 0,
        parseTime: Date.now() - startTime
      }
    };
  }
}

/**
 * Run code analysis on model responses
 */
export async function runCodeAnalysis(
  userPrompt: string,
  responses: Array<{ modelId: string; output: string; localPrompt?: string }>,
  analysisModelConfig: AnalysisModelConfig
): Promise<AnalysisResult> {
  const startTime = Date.now();
  BugCollector.logEntry('AnalysisService', 'runCodeAnalysis', {
    promptLength: userPrompt.length,
    responseCount: responses.length,
    model: analysisModelConfig.modelId
  });
  
  const formattedResponses = responses
    .map(r => `MODEL [${r.modelId}]:\n${r.output}\n---`)
    .join("\n\n");
  
  const judgePrompt = `
You are a Lead Software Architect reviewing code from multiple AI models.
Evaluate implementation quality using a strict 100-point rubric.

USER'S CODING TASK: "${userPrompt}"

RUBRIC:
1. **Execution (40 pts)**: Reliability, edge cases, security.
2. **Explanation (30 pts)**: Clarity of architecture, formatting.
3. **Efficiency (30 pts)**: Optimization, modularity.

RULES:
1. Output ONLY raw JSON. No markdown code fences. No conversational text.
2. Every model ID MUST have an entry in "modelCodeAnalysis".
3. "combinedCode" must be a complete, runnable best-of implementation.

SCHEMA:
{
  "isCodeResponse": true,
  "language": "detected-lang",
  "bestModelId": "modelId",
  "combinedCode": "Complete code implementation",
  "combinedExplanation": "Architectural summary",
  "modelCodeAnalysis": {
    "<modelId>": {
      "codeQualityScore": <0-100>,
      "executionScore": <0-40>,
      "explanationScore": <0-30>,
      "efficiencyScore": <0-30>,
      "strengths": ["list"],
      "weaknesses": ["list"],
      "extractedCode": "code block"
    }
  },
  "codeDifferences": [
    {
      "aspect": "Execution|Explanation|Efficiency",
      "description": "Short divergence description",
      "winner": "modelId"
    }
  ]
}

MODEL RESPONSES:
${formattedResponses}
`;
  
  try {
    const result = await callAI(
      analysisModelConfig.modelId,
      analysisModelConfig.provider,
      judgePrompt,
      analysisModelConfig.apiKey,
      "Output ONLY valid JSON. No markdown fences. No yapping.",
      { maxTokens: 16384 },
      undefined,
      undefined,
      undefined,
      undefined,
      { 
        lmStudioBaseUrl: analysisModelConfig.provider === 'lmstudio' ? analysisModelConfig.baseUrl : undefined,
        ollamaBaseUrl: analysisModelConfig.provider === 'ollama' ? analysisModelConfig.baseUrl : undefined
      }
    );
    
    const parseTime = Date.now() - startTime;
    const analysisData = extractAnalysisJSON(result.text) as any;
    
    BugCollector.logExit('AnalysisService', 'runCodeAnalysis', 'success');
    
    return {
      success: true,
      data: analysisData,
      debugInfo: {
        modelUsed: analysisModelConfig.modelId,
        provider: analysisModelConfig.provider,
        responseLength: result.text?.length || 0,
        parseTime
      }
    };
    
  } catch (error: any) {
    BugCollector.logError('AnalysisService', 'runCodeAnalysis', error);
    
    return {
      success: false,
      error: error.message || String(error),
      debugInfo: {
        modelUsed: analysisModelConfig.modelId,
        provider: analysisModelConfig.provider,
        responseLength: 0,
        parseTime: Date.now() - startTime
      }
    };
  }
}