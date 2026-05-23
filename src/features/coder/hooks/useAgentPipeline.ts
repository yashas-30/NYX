/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for NYX agent.
 * Single-agent fast path for simple prompts, multi-stage deep-thinking path for complex prompts.
 * All stages use the model selected in the model selector.
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@/src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, AISettings, AgentPersona } from '@/src/core/types';
import { detectProvider, getEffectiveApiKey, requiresApiKey } from '@/src/core/utils/provider';
import { analyzePrompt, NON_CODE_REJECTION, isMissingDebugDetails, MISSING_DEBUG_DETAILS_RESPONSE } from '@/shared/promptAnalyzer';
import { getLanguageKnowledge, CODING_KNOWLEDGE_SUMMARY } from '@/src/config/codingKnowledge';
import { toast } from 'sonner';

interface PipelineProps {
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  agentPersonas: Record<'nyx', AgentPersona>;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  history: ChatMessage[];
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
}

/** NYX system instruction — used for single-agent fast path */
const NYX_SYSTEM_INSTRUCTION = `I am Nyx, your premium AI assistant. I am a helpful, friendly, and conversational chatbot with an extensive database of coding knowledge. I can chat with you about general topics, answer questions, or help you with software development, debugging, analyzing files, and system design.

${CODING_KNOWLEDGE_SUMMARY}

OUTPUT GUIDELINES:
- Respond in a natural, conversational, and highly professional chatbot manner (like Google Gemini).
- Answer greetings, general queries, simple questions, or chit-chat directly, friendly, and concisely. Do not output system design overviews, implementation plans, or code steps for simple conversational or general prompts.
- When answering general chatbot questions or chit-chat, behave like a normal friendly AI.
- When generating code, make sure it is complete, functional, and well-commented.
- For hardware-related queries, provide clear details on wiring, safety, and non-blocking logic.
- Keep responses clean, clear, and relevant to the user's query.`;

/** Check if the prompt is a simple greeting or identity query */
const isGreetingOrIdentity = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up)\b/i;
  const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx)\b/i;
  return GREETINGS.test(trimmed) || IDENTITY.test(trimmed);
};

/** Check if the prompt is asking about codebase/project context */
const isCodebaseQuery = (prompt: string): boolean => {
  const lower = prompt.toLowerCase();
  const codebaseKeywords = /\b(project|codebase|repository|repo|workspace|directory|folder|files?|src|components|server|routes|package\.json|tsconfig)\b/i;
  const fileRef = /\b\w+\.(json|ts|tsx|js|jsx|py|cpp|h|ino|md|yml|yaml|css|html)\b/i;
  return codebaseKeywords.test(lower) || fileRef.test(lower);
};

// Cache local agent model status to avoid expensive re-polling on every query
let cachedAgentModel: { id: string; provider: string } | null = null;
let lastAgentCheckTime = 0;
const AGENT_CACHE_TTL = 30000; // Cache status for 30 seconds

/** Auto-discover active local Gemma models (local GGUF) or fallback to OpenCode free Gemma model */
const getAvailableAgentModel = async (): Promise<{ id: string; provider: string }> => {
  const now = Date.now();
  if (cachedAgentModel && (now - lastAgentCheckTime < AGENT_CACHE_TTL)) {
    return cachedAgentModel;
  }

  // 0. Try active NYX Native GGUF model loaded in RAM (ultra-fast C++ llama.cpp)
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 200);
    const response = await AIService.fetchWithAuth('/api/nyx/local-models', { signal: controller.signal }).catch(() => null);
    clearTimeout(timer);
    if (response && response.ok) {
      const data = await response.json();
      if (data.activeModelId) {
        cachedAgentModel = { id: data.activeModelId, provider: 'nyx-native' };
        lastAgentCheckTime = now;
        return cachedAgentModel;
      }
    }
  } catch (e) {
    console.warn('[getAvailableAgentModel] Native GGUF check failed:', e);
  }

  // 1. Fallback to OpenCode free Gemma
  cachedAgentModel = { id: 'opencode/gemma-3-27b-it-free', provider: 'opencode' };
  lastAgentCheckTime = now;
  return cachedAgentModel;
};

/** Asynchronously analyze prompt using the user-selected model */
const analyzePromptIntelligently = async (
  prompt: string,
  modelId: string,
  provider: string,
  apiKey: string,
  apiKeys: Record<string, string>
): Promise<{
  isCodeRelated: boolean;
  isMissingDebugDetails: boolean;
  missingDetailsRequest: string;
  intent: string;
  complexity: string;
  detectedLanguages: string[];
  frameworks: string[];
  summary: string;
} | null> => {
  const systemInstruction = `You are a highly advanced AI prompt analyzer. Your job is to analyze the user's prompt and output a JSON object with the following fields:
{
  "isCodeRelated": boolean,
  "isMissingDebugDetails": boolean,
  "missingDetailsRequest": string, // If the user asks to debug or fix an error/bug/compile-issue but has NOT pasted any code and has NOT pasted any error logs, write a friendly request asking them for their code and logs. Tailor it specifically to any language/platform they mentioned. Keep it brief (under 3 sentences). Otherwise, write empty string.
  "intent": "generate" | "refactor" | "debug" | "explain" | "convert" | "optimize" | "review" | "integrate" | "test" | "deploy" | "general",
  "complexity": "trivial" | "simple" | "moderate" | "complex" | "enterprise",
  "detectedLanguages": string[],
  "frameworks": string[],
  "summary": string // A brief 1-sentence summary of what the user wants to accomplish
}
A prompt is isMissingDebugDetails = true if the user asks to debug or fix an error, bug, or crash, but has NOT pasted any code snippet and has NOT pasted any error logs or compile outputs.
Response must contain ONLY the raw JSON object. Do not include markdown code block syntax (like \`\`\`json).`;

  console.log(`[analyzePromptIntelligently] Using selected model for analysis: ${modelId} (${provider})`);

  try {
    const response = await AIService.execute(
      modelId,
      provider,
      prompt,
      apiKey,
      systemInstruction,
      { temperature: 0.1, maxTokens: 1024 },
      undefined,
      undefined,
      undefined
    );
    const text = response.text.trim();
    const jsonStr = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
    const parsed = JSON.parse(jsonStr);
    return {
      ...parsed,
      summary: parsed.summary || ''
    };
  } catch (err) {
    console.warn(`[analyzePromptIntelligently] Analysis with selected model ${modelId} failed, trying fallback:`, err);
    try {
      const activeKey = apiKeys['opencode'] || '';
      const response = await AIService.execute(
        'opencode/qwen3-coder-14b-free',
        'opencode',
        prompt,
        activeKey,
        systemInstruction,
        { temperature: 0.1, maxTokens: 1024 },
        undefined,
        undefined,
        undefined
      );
      const text = response.text.trim();
      const jsonStr = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(jsonStr);
      return {
        ...parsed,
        summary: parsed.summary || ''
      };
    } catch (err2) {
      console.error('[analyzePromptIntelligently] All analysis models failed:', err2);
      return null;
    }
  }
};

/** Use the user-selected model to analyze the query and codebase context, generating a structured Handoff Specification */
const generateHandoffPlan = async (
  prompt: string,
  codebaseContext: string,
  modelId: string,
  provider: string,
  apiKey: string,
  apiKeys: Record<string, string>
): Promise<string> => {
  const systemInstruction = `You are Nyx, the coordinating agent. Your task is to analyze the user's query and the codebase context, and prepare a structured Handoff Specification for the next step.
Focus on:
1. Target Files: Which files in the codebase need to be modified or created.
2. Technical Requirements: Core functions, interfaces, or logic to be implemented.
3. Constraints & Safety: Any safety hazards, voltage mismatches, or platform restrictions (especially for Arduino/Raspberry Pi).
4. Recommended design pattern or architecture.
5. Learned critic rules from past lessons.
Keep it technical, clear, and structured as bullet points. Do not include greetings, introductions, or code blocks.`;

  console.log(`[generateHandoffPlan] Running NYX Agent (Selected Model) to generate handoff plan using: ${modelId}`);

  try {
    const response = await AIService.execute(
      modelId,
      provider,
      `User Prompt: ${prompt}\n\nCodebase Context:\n${codebaseContext.substring(0, 8000)}`,
      apiKey,
      systemInstruction,
      { temperature: 0.2, maxTokens: 1024 },
      undefined,
      undefined,
      undefined
    );
    return response.text.trim();
  } catch (err) {
    console.warn(`[generateHandoffPlan] Handoff generation with selected model ${modelId} failed, trying fallback:`, err);
    try {
      const activeKey = apiKeys['opencode'] || '';
      const response = await AIService.execute(
        'opencode/qwen3-coder-14b-free',
        'opencode',
        `User Prompt: ${prompt}\n\nCodebase Context:\n${codebaseContext.substring(0, 8000)}`,
        activeKey,
        systemInstruction,
        { temperature: 0.2, maxTokens: 1024 },
        undefined,
        undefined,
        undefined
      );
      return response.text.trim();
    } catch (err2) {
      console.error('[generateHandoffPlan] Fallback handoff model failed:', err2);
    }
    return 'Perform the requested codebase changes ensuring clean architecture, modular code blocks, and robust error handling.';
  }
};

/** Streaming update throttle interval (ms) */
const STREAM_THROTTLE_MS = 50;

export const useAgentPipeline = ({
  models,
  apiKeys,
  agentPersonas,
  modelSettings,
  trackUsage,
  history,
  updateHistory,
  updateMetrics,
  getSuggestions,
  setSuggestedPrompts,
  webSearchEnabled,
  codebaseKnowledgeEnabled
}: PipelineProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  // Keep a ref to history to avoid stale closure in useCallback
  const historyRef = useRef(history);
  historyRef.current = history;

  const triggerBackgroundCritic = useCallback(async (prompt: string, responseText: string) => {
    const nyxModel = models['nyx'];
    if (!nyxModel) return;
    const activeProvider = detectProvider(nyxModel);
    const apiKey = getEffectiveApiKey(activeProvider, apiKeys);

    try {
      await fetch('/api/nyx/critic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          response: responseText,
          apiKey,
          provider: activeProvider,
          modelId: nyxModel
        })
      });
    } catch (err) {
      console.error('[useAgentPipeline] Background critic failed:', err);
    }
  }, [models, apiKeys]);

  /**
   * Main entry point — analyzes the prompt and routes to fast or deep-thinking path.
   */
  const runCoder = useCallback(async (prompt: string) => {
    const nyxModel = models['nyx'];
    if (!prompt.trim() || !nyxModel) return;
    const nyxProvider = detectProvider(nyxModel);
    const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys);

    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    // Append user message
    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
    updateHistory(prev => [...prev, userMsg]);

    setIsLoading(true);
    setSuggestedPrompts([]);
    updateMetrics({ latency: 0, tokens: 0, tps: 0 });

    try {
      // ── 1. Fast Local Regex Analysis (Zero Latency) ──────────────────────────
      const isGreeting = isGreetingOrIdentity(prompt);
      const regexAnalysis = analyzePrompt(prompt);
      
      let analysisResult: any = null;

      if (isGreeting || !regexAnalysis.isCodeRelated) {
        // Bypass expensive LLM prompt analysis for greetings and simple general chat
        analysisResult = {
          isCodeRelated: regexAnalysis.isCodeRelated || isGreeting,
          isMissingDebugDetails: false,
          missingDetailsRequest: '',
          intent: regexAnalysis.intent,
          complexity: regexAnalysis.complexity,
          detectedLanguages: regexAnalysis.detectedLanguages,
          frameworks: regexAnalysis.frameworks,
          summary: regexAnalysis.summary
        };
      } else {
        // ── 2. Smart LLM Prompt Analysis (Qwen 2.5 1.5B / Zen) ─────────────────────────
        analysisResult = await analyzePromptIntelligently(
          prompt,
          nyxModel,
          nyxProvider,
          nyxApiKey,
          apiKeys
        );

        // Fallback to local regex-based analyzer if LLM analysis fails
        if (!analysisResult) {
          analysisResult = {
            isCodeRelated: regexAnalysis.isCodeRelated,
            isMissingDebugDetails: isMissingDebugDetails(prompt, regexAnalysis.intent),
            missingDetailsRequest: MISSING_DEBUG_DETAILS_RESPONSE,
            intent: regexAnalysis.intent,
            complexity: regexAnalysis.complexity,
            detectedLanguages: regexAnalysis.detectedLanguages,
            frameworks: regexAnalysis.frameworks,
            summary: regexAnalysis.summary
          };
        }
      }

      // ── 3. Missing Details Gate ────────────────────────────────────────
      if (analysisResult.isMissingDebugDetails && analysisResult.isCodeRelated) {
        const reqMessage = analysisResult.missingDetailsRequest || MISSING_DEBUG_DETAILS_RESPONSE;
        updateHistory(prev => [
          ...prev,
          { role: 'assistant', content: reqMessage, timestamp: Date.now(), status: 'success' }
        ]);
        toast.error('Please provide your code or error logs');
        return;
      }

      // Fetch learned critic rules
      let fetchedRules: string[] = [];
      try {
        const res = await fetch('/api/nyx/rules');
        if (res.ok) {
          const data = await res.json();
          if (data.success && Array.isArray(data.rules)) {
            fetchedRules = data.rules.map((r: any) => r.rule);
          }
        }
      } catch (err) {
        console.error('Failed to fetch evolutionary rules:', err);
      }

      const formattedRules = fetchedRules.length > 0
        ? fetchedRules.map(r => `- ${r}`).join('\n')
        : "- No specific rules accumulated for this context yet.";

      const rulesBlock = `
To ensure continuous optimization and prevent past mistakes, you must strictly adhere to the following evolutionary rules derived from your past interactions:

[PAST LESSONS LEARNED]
${formattedRules}
[END OF LESSONS]`;

      // ── 4. Routing Decision (Interconnected) ──────────────────────────
      // Simple/trivial/general Q&A prompts go to fast path (Qwen Local for coding, Selected model for general conversation)
      // Heavy/complex coding and debugging prompts go to the selected model in model selector
      const isSimple = 
        isGreeting ||
        !analysisResult.isCodeRelated ||
        analysisResult.complexity === 'trivial' || 
        analysisResult.complexity === 'simple' ||
        analysisResult.intent === 'explain' ||
        analysisResult.intent === 'general';
        
      const isHeavy = !isSimple || 
        (analysisResult.isCodeRelated && (
          analysisResult.complexity === 'enterprise' ||
          analysisResult.complexity === 'complex' ||
          /\b(system\s+design|architect|blueprint|multi[- ]agent|planning\s+mode|step[- ]by[- ]step\s+plan|thinking|think|deep|heavy)\b/i.test(prompt)
        ));

      if (!isHeavy) {
        // Fast path: run single agent pipeline
        // If it's a non-code prompt, use the selected model in the model selector directly (to avoid local limitations)
        // Otherwise, use Gemma Local (which is the default fast path coder model)
        const agentModel = !analysisResult.isCodeRelated 
          ? null 
          : await getAvailableAgentModel();

        if (agentModel) {
          console.log(`[runCoder] Routing to fast path with Gemma model: ${agentModel.id} (${agentModel.provider})`);
        } else {
          console.log(`[runCoder] Routing to fast path with selected model: ${nyxModel}`);
        }

        const langKnowledge = getLanguageKnowledge(analysisResult.detectedLanguages);
        const instruction = (isGreeting || !analysisResult.isCodeRelated)
          ? NYX_SYSTEM_INSTRUCTION 
          : `${NYX_SYSTEM_INSTRUCTION}\n\n${langKnowledge}\n\n${rulesBlock}`;
        
        await runSingleAgentPipeline(
          prompt, 
          controller, 
          instruction, 
          analysisResult as any, 
          agentModel || undefined
        );
      } else {
        // Heavy path: run multi-stage pipeline using the selected model (interconnected)
        await runMultiStagePipeline(prompt, controller, rulesBlock, analysisResult as any);
      }
    } catch (error: any) {
      const isAborted = error?.name === 'AbortError' || controller.signal.aborted;
      
      if (error.message && error.message.startsWith('SAFETY_GATE_BLOCKED:')) {
        try {
          const payload = JSON.parse(error.message.substring(20));
          updateHistory(prev => {
            const h = prev.filter(m => !(m.role === 'assistant' && m.content === ''));
            return [
              ...h,
              { 
                role: 'assistant', 
                content: `⚠️ **NYX Safety Gate Blocked**\n\n${payload.message}\n\n${payload.details && payload.details.length > 0 ? `**Details:**\n${payload.details.map((d: any) => `- ${d}`).join('\n')}` : ''}`, 
                timestamp: Date.now(), 
                status: 'success' 
              }
            ];
          });
          toast.warning('Request blocked by Safety Gate');
          setIsLoading(false);
          controllerRef.current = null;
          return;
        } catch {}
      }

      updateHistory(prev => {
        const h = [...prev];
        const last = h[h.length - 1];
        if (last && last.role === 'assistant') last.status = isAborted ? 'stopped' : 'error';
        return h;
      });

      if (!isAborted) {
        toast.error(`Coder failed: ${error.message}`);
      }
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  // Use historyRef instead of history in deps to prevent useCallback recreation on every message
  }, [models, apiKeys, agentPersonas, modelSettings, trackUsage, updateHistory, updateMetrics, setSuggestedPrompts]);

  /**
   * Multi-stage deep-thinking pipeline (Architect → Coder → Optimizer).
   * All 3 stages use the SAME model selected in the model selector.
   */
  const runMultiStagePipeline = async (
    prompt: string,
    controller: AbortController,
    rulesBlock: string,
    analysis: {
      isCodeRelated: boolean;
      isMissingDebugDetails: boolean;
      missingDetailsRequest: string;
      intent: string;
      complexity: string;
      detectedLanguages: string[];
      frameworks: string[];
      summary: string;
    }
  ) => {
    const nyxModel = models['nyx'];
    if (!nyxModel) {
      toast.error('Please select a model first');
      throw new Error('No model selected');
    }
    const nyxProvider = detectProvider(nyxModel);
    const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys);

    // Resolve context flags
    const isGreeting = isGreetingOrIdentity(prompt);
    const isCodebase = codebaseKnowledgeEnabled && isCodebaseQuery(prompt) && !isGreeting;

    // Seed empty assistant message
    updateHistory(prev => [
      ...prev,
      { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }
    ]);

    const startTime = Date.now();

    // Build language-specific knowledge
    const langKnowledge = getLanguageKnowledge(analysis.detectedLanguages);
    const analysisContext = `\n[PROMPT ANALYSIS]\n${analysis.summary}\n- Detected Languages: ${analysis.detectedLanguages.join(', ') || 'auto-detect'}\n- Intent: ${analysis.intent}\n- Complexity: ${analysis.complexity}\n- Frameworks: ${analysis.frameworks.join(', ') || 'none'}\n[END ANALYSIS]\n`;

    // ── Codebase Search ──────────────────────────────────────────────────
    let codebaseContext = '';
    let maxCodebaseScore = 0;
    if (isCodebase) {
      try {
        const codebaseRes = await fetch('/api/nyx/codebase-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt }),
          signal: controller.signal
        });
        if (codebaseRes.ok) {
          const codebaseData = await codebaseRes.json();
          if (codebaseData.success) {
            const results = codebaseData.results || [];
            maxCodebaseScore = results.length > 0
              ? Math.max(...results.map((f: any) => f.relevanceScore || f.score || 0))
              : 0;
            const resultsStr = results
              .map((f: any) => `File: ${f.relativePath || f.path} (Relevance Score: ${f.relevanceScore || f.score})\n\`\`\`\n${f.content}\n\`\`\``)
              .join('\n\n');
            codebaseContext = `\n\n[LOCAL CODEBASE CONTEXT]\nDIRECTORY STRUCTURE:\n${codebaseData.directoryStructure || ''}\n\nRELEVANT SOURCE CODE FILES:\n${resultsStr}\n[END CODEBASE CONTEXT]\n`;
          }
        }
      } catch (err) {
        console.error('Codebase search API failed:', err);
      }
    }

    const needsCorrectiveSearch = isCodebase && maxCodebaseScore < 120 && !isGreeting;
    const executeWebSearch = (webSearchEnabled || needsCorrectiveSearch) && !isGreeting;

    // ── Web Search ───────────────────────────────────────────────────────
    let searchContext = '';
    if (executeWebSearch) {
      try {
        const searchRes = await fetch('/api/nyx/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt }),
          signal: controller.signal
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.success && Array.isArray(searchData.results)) {
            const resultsStr = searchData.results
              .map((r: any, idx: number) => `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`)
              .join('\n\n');
            searchContext = `\n\nADDITIONAL WEB SEARCH RESULTS:\n${resultsStr}\n`;
          }
        }
      } catch (err) {
        console.error('Web search API failed:', err);
      }
    }

    const handoffPlan = await generateHandoffPlan(
      prompt,
      codebaseContext,
      nyxModel,
      nyxProvider,
      nyxApiKey,
      apiKeys
    );
    const handoffBlock = `
[NYX AGENT COORDINATOR (Qwen 2.5 1.5B) HANDOFF SPECIFICATION]
The NYX agent has pre-analyzed the prompt and codebase, establishing the following requirements:
${handoffPlan}
[END OF HANDOFF SPECIFICATION]\n`;

    // ── Pipeline settings: max output tokens ─────────────────────────────
    const pipelineSettings = { ...modelSettings, maxTokens: 16384 };

    // ── Unified System Instruction for Selected Model ────────────────────
    const instruction = `${NYX_SYSTEM_INSTRUCTION}

${langKnowledge}

You are Nyx, the premium AI assistant executing the final implementation.
You must analyze the user prompt, local codebase context, and the Qwen 2.5 1.5B handoff specification below to deliver a high-end, production-ready engineering response.

${rulesBlock}

GEMINI-STYLE RESPONSE RULES:
- Begin with a brief, premium architectural overview of the planned changes/optimizations.
- Deliver the COMPLETE, FINAL, production-ready code. Do not cut corners, truncate files, or use placeholders.
- Output each file in a properly labeled code block (e.g. \`\`\`html, \`\`\`typescript, \`\`\`css, etc.)
- Do NOT reference internal stages, agents, or pipeline steps in your response.
- Ensure all imports, package names, and APIs are correct for the detected language/framework.
- After all code blocks, provide a concise explanation of the core logic and security details.
- End your response with a clear, step-by-step "## How to Use" or implementation checklist.
- Keep the tone highly professional, authoritative, and helpful.`;

    const finalPrompt = `USER PROMPT: ${prompt}${analysisContext}${handoffBlock}${codebaseContext}${searchContext}\n\nDeliver the final complete solution following the engineering rules. Output 100% complete files only.`;

    let resultText = '';
    let lastStreamUpdate = 0;

    const result = await AIService.execute(
      nyxModel, nyxProvider, finalPrompt, nyxApiKey, instruction, pipelineSettings,
      (accumulatedText) => {
        resultText = accumulatedText;
        const now = Date.now();
        if (now - lastStreamUpdate < STREAM_THROTTLE_MS) return;
        lastStreamUpdate = now;

        const elapsed = now - startTime;
        const tokens = Math.floor(resultText.length / 4);
        const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;
        const currentMetrics = { latency: elapsed, tokens, tps };

        updateHistory(prev => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant') {
            last.content = resultText;
            last.metrics = currentMetrics;
          }
          return h;
        });
        updateMetrics(currentMetrics);
      },
      controller.signal,
      { history: historyRef.current.slice(-10) }
    );

    resultText = result.text;
    trackUsage(nyxProvider, result.metrics.tokens);

    const finalElapsed = Date.now() - startTime;
    const finalTokens = result.metrics.tokens;
    const finalTps = finalElapsed > 0 ? Math.round(finalTokens / (finalElapsed / 1000)) : 0;
    const finalMetrics = { latency: finalElapsed, tokens: finalTokens, tps: finalTps };

    // Commit final output
    updateHistory(prev => {
      const h = [...prev];
      const last = h[h.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = resultText;
        last.metrics = finalMetrics;
      }
      getSuggestions(h);
      return h;
    });

    updateMetrics(finalMetrics);
    triggerBackgroundCritic(prompt, resultText);
  };

  /**
   * Fast single-agent pipeline — streams directly to user for instant responses.
   */
  const runSingleAgentPipeline = async (
    prompt: string,
    controller: AbortController,
    systemPromptOverride?: string,
    analysis?: ReturnType<typeof analyzePrompt>,
    modelOverride?: { id: string; provider: string }
  ) => {
    const persona = agentPersonas['nyx'];
    const systemPrompt = systemPromptOverride || persona.systemPrompt;
    const currentModelId = modelOverride ? modelOverride.id : models['nyx'];
    const provider = modelOverride ? modelOverride.provider : detectProvider(currentModelId);
    const apiKey = getEffectiveApiKey(provider, apiKeys);

    const isGreeting = isGreetingOrIdentity(prompt);
    const isCodebase = codebaseKnowledgeEnabled && isCodebaseQuery(prompt) && !isGreeting;

    const analysisContext = analysis && !isGreeting ? `\n[PROMPT ANALYSIS]\n${analysis.summary}\n- Detected Languages: ${analysis.detectedLanguages.join(', ') || 'auto-detect'}\n- Intent: ${analysis.intent}\n- Complexity: ${analysis.complexity}\n- Frameworks: ${analysis.frameworks.join(', ') || 'none'}\n[END ANALYSIS]\n` : '';

    // Seed empty assistant loading placeholder
    updateHistory(prev => [
      ...prev,
      { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }
    ]);

    // ── Codebase Search ──────────────────────────────────────────────────
    let codebaseContext = '';
    let maxCodebaseScore = 0;
    let needsCorrectiveSearch = false;
    if (isCodebase) {
      try {
        const codebaseRes = await fetch('/api/nyx/codebase-search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt }),
          signal: controller.signal
        });
        if (codebaseRes.ok) {
          const codebaseData = await codebaseRes.json();
          if (codebaseData.success) {
            const results = codebaseData.results || [];
            maxCodebaseScore = results.length > 0
              ? Math.max(...results.map((f: any) => f.relevanceScore || f.score || 0))
              : 0;
            const resultsStr = results
              .map((f: any) => `File: ${f.relativePath || f.path} (Relevance Score: ${f.relevanceScore || f.score})\n\`\`\`\n${f.content}\n\`\`\``)
              .join('\n\n');
            codebaseContext = `\n\n[LOCAL CODEBASE CONTEXT]\nDIRECTORY STRUCTURE:\n${codebaseData.directoryStructure || ''}\n\nRELEVANT SOURCE CODE FILES:\n${resultsStr}\n[END CODEBASE CONTEXT]\n`;
            if (maxCodebaseScore < 120) needsCorrectiveSearch = true;
          }
        }
      } catch (err) {
        console.error('Codebase search failed:', err);
      }
    }

    // ── Web Search Fallback ──────────────────────────────────────────────
    let searchContext = '';
    const executeWebSearch = (webSearchEnabled || needsCorrectiveSearch) && !isGreeting;
    if (executeWebSearch) {
      try {
        const searchRes = await fetch('/api/nyx/search', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ query: prompt }),
          signal: controller.signal
        });
        if (searchRes.ok) {
          const searchData = await searchRes.json();
          if (searchData.success && Array.isArray(searchData.results)) {
            const resultsStr = searchData.results
              .map((r: any, idx: number) => `[Result ${idx + 1}] Title: ${r.title}\nLink: ${r.link}\nSnippet: ${r.snippet}`)
              .join('\n\n');
            searchContext = `\n\nADDITIONAL WEB SEARCH RESULTS:\n${resultsStr}\n`;
          }
        }
      } catch (err) {
        console.error('Web search failed:', err);
      }
    }

    const finalPrompt = `${prompt}${analysisContext}${codebaseContext}${searchContext}`;

    const startTime = Date.now();
    let lastStreamUpdate = 0;

    const result = await AIService.execute(
      currentModelId, provider, finalPrompt, apiKey, systemPrompt, modelSettings,
      (accumulatedText) => {
        const now = Date.now();
        // Throttle UI updates to every STREAM_THROTTLE_MS
        if (now - lastStreamUpdate < STREAM_THROTTLE_MS) return;
        lastStreamUpdate = now;

        const elapsed = now - startTime;
        const tokens = Math.floor(accumulatedText.length / 4);
        const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;
        updateMetrics({ latency: elapsed, tokens, tps });

        updateHistory(prev => {
          const h = [...prev];
          const last = h[h.length - 1];
          if (last && last.role === 'assistant') {
            last.content = accumulatedText;
            last.metrics = { latency: elapsed, tokens, tps };
          }
          return h;
        });
      },
      controller.signal,
      { history: historyRef.current.slice(-10) }
    );

    trackUsage(provider, result.metrics.tokens);

    updateHistory(prev => {
      const h = [...prev];
      const last = h[h.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = result.text;
        last.metrics = result.metrics;
      }
      getSuggestions(h);
      return h;
    });

    updateMetrics(result.metrics);
    triggerBackgroundCritic(prompt, result.text);
  };

  const stopCoder = useCallback(() => {
    if (controllerRef.current) {
      controllerRef.current.abort();
      controllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return { isLoading, runCoder, stopCoder };
};
