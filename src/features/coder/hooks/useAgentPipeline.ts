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
import { toast } from '@/src/components/ui/sonner';
import { runMultiStagePipeline } from './pipeline';

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
const NYX_SYSTEM_INSTRUCTION = `You are NYX, a professional and highly capable AI software engineering assistant developed by Yashas. Always identify yourself as NYX. Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language like "premium" or "advanced". Focus on providing highly structured, precise, clean, and complete code solutions.

${CODING_KNOWLEDGE_SUMMARY}

AGENTIC CODE & DESIGN PROTOCOLS:
1. FULL-OUTPUT ENFORCEMENT (MANDATORY):
   - Treat every task as production-critical.
   - NEVER generate partial code or lazy placeholders (e.g. "// ...", "// rest of code", or "TODO"). Every file must be complete, runnable, and production-ready.
   
2. PREMIUM UTILITARIAN MINIMALIST UI ARCHITECTURE:
   - When generating frontend interfaces, strictly follow these design constraints:
     * Color: Scarlet spot pastels or desaturated colors for accents/tags. Canvas must be pure white (#FFFFFF) or warm off-white (#F7F6F3/#FBFBFA) and primary surfaces #FFFFFF. Use clean borders (1px solid #EAEAEA) and avoid heavy shadows.
     * Typography: Editorial serifs (e.g., Lyon Text, Instrument Serif, Playfair Display) for hero/section titles with tight tracking/leading, and geometric sans (e.g., Switzer, Geist Sans, SF Pro) for body text and UI.
     * Layout: Clean asymmetrical CSS Bento Box feature grids. Use macro-whitespace (massive vertical gaps like py-24 or py-32) to let the editorial design breathe.
     * Elements: Flat crisp buttons (solid charcoal/black background with white text, CRISP corners, micro-scale click transforms). No pill shapes for large containers, no emojis, no gradients, and no glassmorphism.
     * Motion: Ultra-subtle, scroll-entry transitions (translateY(12px) + opacity fade over 600ms).

3. MODULAR REACT & TYPESCRIPT ENGINEERING:
   - Separate concerns completely. Segregate event handlers/state logic into custom hooks, move static mock datasets to mockData.ts, and enforce strict type safety using Readonly props interfaces.

OUTPUT GUIDELINES:
- Respond in a natural, conversational, and highly professional chatbot manner (like Google Gemini).
- Answer greetings, general queries, simple questions, or chit-chat directly, friendly, and concisely. Do not output system design overviews, implementation plans, or code steps for simple conversational or general prompts.
- Keep responses clean, clear, and relevant to the user's query.`;

/** Check if the prompt is a simple greeting or identity query */
const isGreetingOrIdentity = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)\b/i;
  const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;
  return GREETINGS.test(trimmed) || IDENTITY.test(trimmed);
};

/** Check if the prompt is general conversation (non-code chat) */
const isConversational = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  if (isGreetingOrIdentity(trimmed)) return true;
  const CHAT_PATTERNS = /^(how\s+are\s+you|how's\s+it\s+going|tell\s+me\s+(about|a\s+joke)|what\s+do\s+you\s+think|how\s+do\s+you\s+feel|do\s+you\s+like|what's\s+your\s+favorite|can\s+you\s+help|what\s+time|good\s+job|well\s+done|i\s+appreciate|what\s+is\s+the\s+meaning|what\s+is\s+life|who\s+is\s+(the|a)\b|what\s+happened|when\s+did|where\s+is|how\s+old|how\s+many|how\s+much|how\s+far|how\s+long|how\s+tall|how\s+big|how\s+fast|tell\s+me\s+something|what's\s+new|what\s+should\s+i|recommend|suggest|opinion|advice)/i;
  return CHAT_PATTERNS.test(trimmed);
};

/** Lightweight system instruction for general conversation */
const NYX_CONVERSATIONAL_INSTRUCTION = `I am Nyx, your AI assistant. I am friendly, helpful, and conversational.

For general questions and conversation:
- Respond naturally, warmly, and concisely like a knowledgeable friend.
- Be direct and helpful. Don't add unnecessary structure or formality.
- Keep responses focused and relevant to what the user asked.
- If the user greets me, greet them back warmly.
- If asked about myself: I am Nyx, an AI coding and general-purpose assistant built for developers.
- Answer general knowledge questions clearly and accurately.
- Be friendly but not overly enthusiastic or verbose.`;

/** Check if the prompt is asking about codebase/project context */
const isCodebaseQuery = (prompt: string): boolean => {
  const lower = prompt.toLowerCase();
  const codebaseKeywords = /\b(project|codebase|repository|repo|workspace|directory|folder|files?|src|components|server|routes|package\.json|tsconfig)\b/i;
  const fileRef = /\b\w+\.(json|ts|tsx|js|jsx|py|cpp|h|ino|md|yml|yaml|css|html)\b/i;
  return codebaseKeywords.test(lower) || fileRef.test(lower);
};

/** Streams a static text response step-by-step to the UI quickly for instant feedback */
const streamStaticResponse = (
  text: string,
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void,
  updateMetrics: (metrics: TelemetryMetrics) => void,
  onComplete: () => void,
  signal: AbortSignal
) => {
  // Seed empty assistant loading placeholder
  updateHistory(prev => [
    ...prev,
    { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }
  ]);

  const words = text.split(/(\s+)/);
  let currentIdx = 0;
  let accumulatedText = "";
  const startTime = Date.now();

  const interval = setInterval(() => {
    if (signal.aborted) {
      clearInterval(interval);
      return;
    }

    if (currentIdx >= words.length) {
      clearInterval(interval);
      // Finalize
      updateHistory(prev => {
        const h = [...prev];
        const last = h[h.length - 1];
        if (last && last.role === 'assistant') {
          last.status = 'success';
          last.content = text;
        }
        return h;
      });
      onComplete();
      return;
    }

    // Stream next word/space
    accumulatedText += words[currentIdx];
    currentIdx++;

    const now = Date.now();
    const elapsed = now - startTime;
    const tokens = Math.max(1, Math.floor(accumulatedText.length / 4));
    const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 100;
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
  }, 12); // Stream extremely fast
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
      return {
        isCodeRelated: true,
        isMissingDebugDetails: false,
        missingDetailsRequest: '',
        intent: 'general',
        complexity: 'moderate',
        detectedLanguages: [],
        frameworks: [],
        summary: ''
      };
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
    const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys) || '';

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
      const isChat = isConversational(prompt);
      const regexAnalysis = analyzePrompt(prompt);
      
      let analysisResult: any = null;

      if (isGreeting || isChat || !regexAnalysis.isCodeRelated) {
        // Bypass expensive LLM prompt analysis for greetings, conversations, and non-code chat
        analysisResult = {
          isCodeRelated: false,
          isMissingDebugDetails: false,
          missingDetailsRequest: '',
          intent: isGreeting || isChat ? 'general' : regexAnalysis.intent,
          complexity: 'trivial',
          detectedLanguages: regexAnalysis.detectedLanguages,
          frameworks: regexAnalysis.frameworks,
          summary: isGreeting || isChat ? '💬 General Conversation' : regexAnalysis.summary
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

      // ── 4. Routing Decision ──────────────────────────────────────────
      // Conversational/general prompts → fast path with lightweight system prompt
      // Simple code prompts → fast path with code system prompt
      // Complex code prompts → multi-stage pipeline with planning

      const isChatMode = isGreeting || isChat || !analysisResult.isCodeRelated;

      if (isChatMode) {
        const trimmed = prompt.trim();
        const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you)\b/i;
        const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye)\b/i;

        if (IDENTITY.test(trimmed)) {
          const identityResponse = `Hello. I am **NYX**, a professional and highly capable AI software engineering assistant.

I have native, deep integration with your workspace and can run tasks, analyze repository structures, and write high-quality code. Here are some of the key capabilities I have:
- 💻 **Autonomous Coding**: Generate complete, syntax-correct, production-ready code.
- 🔍 **Workspace Analysis**: Search your local codebase, trace imports, and understand file relations.
- ⚡ **Task Automation**: Execute shell commands, run tests, and manage background processes.
- 🗣️ **Conversational Intelligence**: Explain complex codebases, plan architectures, and help troubleshoot bugs.

How can I assist you with your workspace or project today?`;
          
          await new Promise<void>((resolve) => {
            streamStaticResponse(identityResponse, updateHistory, updateMetrics, () => {
              setIsLoading(false);
              resolve();
            }, controller.signal);
          });
          return;
        } else if (GREETINGS.test(trimmed)) {
          const greetingResponse = `Hello. I am **NYX**, your professional AI software engineering assistant.

How can I help you with your repository, code, or terminal tasks today?`;
          
          await new Promise<void>((resolve) => {
            streamStaticResponse(greetingResponse, updateHistory, updateMetrics, () => {
              setIsLoading(false);
              resolve();
            }, controller.signal);
          });
          return;
        }

        // ── CONVERSATIONAL FAST PATH ────────────────────────────────────
        // Skip rules, skip local agent model, skip code knowledge — just chat
        console.log(`[runCoder] Routing to CONVERSATIONAL fast path with selected model: ${nyxModel}`);
        
        await runSingleAgentPipeline(
          prompt, 
          controller, 
          NYX_CONVERSATIONAL_INSTRUCTION, 
          analysisResult as any, 
          undefined // Always use selected model for conversation
        );
      } else {
        // Code-related prompt — fetch rules and route
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

        const isPlanningRequested = /\b(planning\s+mode|step[- ]by[- ]step\s+plan|generate\s+plan|create\s+plan|architectural\s+plan|system\s+design|architect|blueprint|multi[- ]agent|agent|claude\s+code)\b/i.test(prompt);
        const isHeavy = isPlanningRequested || (analysisResult.isCodeRelated && ['moderate', 'complex', 'enterprise'].includes(analysisResult.complexity));

        if (!isHeavy) {
          // Fast path for simple code prompts
          const agentModel = await getAvailableAgentModel();
          if (agentModel) {
            console.log(`[runCoder] Routing to CODE fast path with agent model: ${agentModel.id} (${agentModel.provider})`);
          } else {
            console.log(`[runCoder] Routing to CODE fast path with selected model: ${nyxModel}`);
          }

          const langKnowledge = getLanguageKnowledge(analysisResult.detectedLanguages);
          const instruction = `${NYX_SYSTEM_INSTRUCTION}\n\n${langKnowledge}\n\n${rulesBlock}`;
          
          await runSingleAgentPipeline(
            prompt, 
            controller, 
            instruction, 
            analysisResult as any, 
            agentModel || undefined
          );
        } else {
        // Heavy path: run multi-stage pipeline using the selected model (interconnected)
          await runMultiStagePipeline({
            prompt,
            controller,
            rulesBlock,
            analysis: analysisResult as any,
            models,
            apiKeys,
            modelSettings,
            trackUsage,
            updateHistory,
            updateMetrics,
            getSuggestions,
            webSearchEnabled,
            codebaseKnowledgeEnabled,
            historyRef,
            triggerBackgroundCritic,
            generateHandoffPlan,
            NYX_SYSTEM_INSTRUCTION
          });
        }
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
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  }, [models, apiKeys, agentPersonas, modelSettings, trackUsage, updateHistory, updateMetrics, setSuggestedPrompts]);

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
