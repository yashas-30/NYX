/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for single-agent and multi-agent (NYX) flows.
 *
 * NYX multi-agent pipeline:
 *   Stage 1 (Architect)  → internal only, shown as a compact progress banner
 *   Stage 2 (Coder)      → internal only, shown as a compact progress banner
 *   Stage 3 (Optimizer)  → final output streamed directly to the user
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@/src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, AISettings, AgentPersona } from '@/src/core/types';
import { detectProvider, getEffectiveApiKey, requiresApiKey } from '@/src/core/utils/provider';
import { analyzePrompt, NON_CODE_REJECTION } from '@/src/features/coder/utils/promptAnalyzer';
import { getLanguageKnowledge, CODING_KNOWLEDGE_SUMMARY } from '@/src/config/codingKnowledge';
import { toast } from 'sonner';

type AgentKey = 'open' | 'claude' | 'nyx';

interface PipelineProps {
  activeAgent: AgentKey;
  models: Record<AgentKey, string>;
  apiKeys: Record<string, string>;
  agentPersonas: Record<AgentKey, AgentPersona>;
  modelSettings: AISettings;
  lmStudioBaseUrl: string;
  ollamaBaseUrl: string;
  ollamaModels: any[];
  lmStudioModels: any[];
  trackUsage: (provider: string, tokens: number) => void;
  historyMap: Record<AgentKey, ChatMessage[]>;
  updateHistory: (agent: AgentKey, updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (agent: AgentKey, metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  setSuggestedPrompts: (prompts: string[]) => void;
  webSearchEnabled: boolean;
}

// Status banners shown during internal stages (not shown in final output)
const ANALYSIS_BANNER = `> 🧠 **Prompt Analyzer** — detecting language, intent, and complexity...\n`;
const STAGE0_BANNER = `> 🔎 **Search Agent** — scouring the web for code production insights and SDK docs...\n`;
const KNOWLEDGE_BANNER = `> 📚 **Knowledge Agent** — enriching context with deep SDK and framework intelligence...\n`;
const STAGE1_BANNER = `> ⚙️ **Architect Agent** — analysing the problem and designing the system blueprint...`;
const STAGE2_BANNER = `\n> 💻 **Coder Agent** — writing the complete implementation from the blueprint...`;
const STAGE3_BANNER = `\n> ⚡ **Optimizer Agent** — finalising and delivering your answer...\n\n`;

const SIMPLE_NYX_INSTRUCTION = `You are NYX 2.0, an elite direct coding assistant with expert knowledge of 30+ programming languages.

${CODING_KNOWLEDGE_SUMMARY}

ABSOLUTE RULES:
- Output ONLY the direct answer or code. Nothing else.
- NEVER describe what the user said or wrote.
- NEVER use phrases like "The user said", "You asked", "This is a".
- NEVER greet, introduce, or acknowledge the prompt.
- NEVER add closing remarks or offers to help.
- If the input is a greeting: respond with a brief acknowledgment only.
- If asked for code: output ONLY the code blocks or files requested.
- Always use the most modern idioms and patterns for the detected language.
- Start immediately with the answer. Zero preamble.`;

// Simple prompt detection: uses the analyzer's complexity score instead of regex heuristics
const isSimplePrompt = (prompt: string): boolean => {
  const analysis = analyzePrompt(prompt);
  return analysis.complexity === 'trivial' || analysis.complexity === 'simple';
};

export const useAgentPipeline = ({
  activeAgent,
  models,
  apiKeys,
  agentPersonas,
  modelSettings,
  lmStudioBaseUrl,
  ollamaBaseUrl,
  ollamaModels,
  lmStudioModels,
  trackUsage,
  historyMap,
  updateHistory,
  updateMetrics,
  getSuggestions,
  setSuggestedPrompts,
  webSearchEnabled
}: PipelineProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);

  const triggerBackgroundCritic = useCallback(async (prompt: string, responseText: string) => {
    if (activeAgent !== 'nyx') return;
    
    const activeProvider = detectProvider(models['nyx'], ollamaModels, lmStudioModels);
    const apiKey = getEffectiveApiKey(activeProvider, apiKeys);

    try {
      await fetch('/api/nyx/critic', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt,
          response: responseText,
          apiKey
        })
      });
      console.log('[useAgentPipeline] Background critic triggered successfully.');
    } catch (err) {
      console.error('[useAgentPipeline] Failed to trigger background critic:', err);
    }
  }, [activeAgent, models, apiKeys, ollamaModels, lmStudioModels]);

  const runCoder = useCallback(async (prompt: string) => {
    if (!prompt.trim() || !models[activeAgent]) return;

    if (controllerRef.current) controllerRef.current.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
    updateHistory(activeAgent, prev => [...prev, userMsg]);

    setIsLoading(true);
    setSuggestedPrompts([]);
    updateMetrics(activeAgent, { latency: 0, tokens: 0, tps: 0 });

    try {
      if (activeAgent === 'nyx') {
        // ── Prompt Analysis & Code-Only Gate ─────────────────────────────
        const analysis = analyzePrompt(prompt);
        console.log(`[Prompt Analyzer] ${analysis.summary}`);

        if (!analysis.isCodeRelated) {
          // Reject non-code prompts immediately
          updateHistory(activeAgent, prev => [
            ...prev,
            { role: 'assistant', content: NON_CODE_REJECTION, timestamp: Date.now(), status: 'success' }
          ]);
          toast.error('NYX only accepts coding-related prompts');
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

        if (isSimplePrompt(prompt) && !webSearchEnabled) {
          // Enrich simple instruction with detected language knowledge
          const langKnowledge = getLanguageKnowledge(analysis.detectedLanguages);
          const simpleInstructionWithRules = `${SIMPLE_NYX_INSTRUCTION}\n\n${langKnowledge}\n\n${rulesBlock}`;
          await runSingleAgentPipeline(prompt, controller, controllerRef, simpleInstructionWithRules);
        } else {
          await runMultiAgentPipeline(prompt, controller, controllerRef, rulesBlock, analysis);
        }
      } else {
        await runSingleAgentPipeline(prompt, controller, controllerRef);
      }
    } catch (error: any) {
      const isAborted = error?.name === 'AbortError' || controller.signal.aborted;
      updateHistory(activeAgent, prev => {
        const history = [...prev];
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') last.status = isAborted ? 'stopped' : 'error';
        return history;
      });

      if (!isAborted) {
        toast.error(`Coder failed: ${error.message}`);
      }
    } finally {
      controllerRef.current = null;
      setIsLoading(false);
    }
  }, [activeAgent, models, apiKeys, agentPersonas, modelSettings, lmStudioBaseUrl, ollamaBaseUrl, ollamaModels, lmStudioModels, trackUsage, historyMap]);

  const runMultiAgentPipeline = async (prompt: string, controller: AbortController, controllerRef: React.MutableRefObject<AbortController | null>, rulesBlock?: string, analysis?: ReturnType<typeof analyzePrompt>) => {
    // ── Resolve Models ─────────────────────────────────────────────────────
    const initialOpenModelId = models['open'] || models['nyx'];
    if (!initialOpenModelId) {
      toast.error('Please select a model for the planning engine');
      throw new Error('No model selected for OpenCode planner');
    }
    const initialOpenProvider = detectProvider(initialOpenModelId, ollamaModels, lmStudioModels);
    const initialOpenApiKey = getEffectiveApiKey(initialOpenProvider, apiKeys);
    const hasPlanningKey = !requiresApiKey(initialOpenProvider) || !!initialOpenApiKey;

    const architectModelId = hasPlanningKey ? initialOpenModelId : models['nyx'];
    const architectProvider = hasPlanningKey ? initialOpenProvider : detectProvider(architectModelId, ollamaModels, lmStudioModels);
    const architectApiKey = hasPlanningKey ? initialOpenApiKey : getEffectiveApiKey(architectProvider, apiKeys);

    const initialClaudeModelId = models['claude'] || models['nyx'];
    if (!initialClaudeModelId) {
      toast.error('Please select a model for the execution engine');
      throw new Error('No model selected for Coder executor');
    }
    const initialClaudeProvider = detectProvider(initialClaudeModelId, ollamaModels, lmStudioModels);
    const initialClaudeApiKey = getEffectiveApiKey(initialClaudeProvider, apiKeys);
    const hasClaudeKey = !requiresApiKey(initialClaudeProvider) || !!initialClaudeApiKey;

    const coderModelId = hasClaudeKey ? initialClaudeModelId : models['nyx'];
    const coderProvider = hasClaudeKey ? initialClaudeProvider : detectProvider(coderModelId, ollamaModels, lmStudioModels);
    const coderApiKey = hasClaudeKey ? initialClaudeApiKey : getEffectiveApiKey(coderProvider, apiKeys);

    const optimizerModelId = models['nyx'];
    if (!optimizerModelId) {
      toast.error('Please select a model for the optimization engine');
      throw new Error('No model selected for Optimizer');
    }
    const optimizerProvider = detectProvider(optimizerModelId, ollamaModels, lmStudioModels);
    const optimizerApiKey = getEffectiveApiKey(optimizerProvider, apiKeys);

    // ── Analysis + Stage 0: Search Agent ──────────────────────────────────
    const analysisPrefix = ANALYSIS_BANNER;
    const searchPrefix = webSearchEnabled ? STAGE0_BANNER : '';

    // Seed the assistant message with analysis banner
    updateHistory(activeAgent, prev => [
      ...prev,
      { role: 'assistant', content: analysisPrefix, timestamp: Date.now(), status: 'loading' }
    ]);

    const startTime = Date.now();

    // Build language-specific knowledge from analysis
    const langKnowledge = analysis ? getLanguageKnowledge(analysis.detectedLanguages) : '';
    const analysisContext = analysis ? `\n[PROMPT ANALYSIS]\n${analysis.summary}\n- Detected Languages: ${analysis.detectedLanguages.join(', ') || 'auto-detect'}\n- Intent: ${analysis.intent}\n- Complexity: ${analysis.complexity}\n- Frameworks: ${analysis.frameworks.join(', ') || 'none'}\n[END ANALYSIS]\n` : '';

    // Transition to search banner if needed
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.content = analysisPrefix + (webSearchEnabled ? searchPrefix : KNOWLEDGE_BANNER);
      }
      return history;
    });

    // Web search (if enabled)
    let searchContext = '';
    if (webSearchEnabled) {
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
            searchContext = `\n\nADDITIONAL WEB SEARCH RESULTS:\nHere are some relevant search results from the web for reference:\n${resultsStr}\n`;
          }
        }
      } catch (err) {
        console.error('Web search API failed:', err);
      }

      // Transition to knowledge banner
      updateHistory(activeAgent, prev => {
        const history = [...prev];
        const last = history[history.length - 1];
        if (last && last.role === 'assistant') {
          last.content = analysisPrefix + searchPrefix + KNOWLEDGE_BANNER;
        }
        return history;
      });
    }

    // Google SDK Knowledge Extension (for moderate+ complexity)
    let sdkKnowledge = '';
    const shouldFetchKnowledge = analysis && (analysis.complexity === 'moderate' || analysis.complexity === 'complex' || analysis.complexity === 'enterprise');
    if (shouldFetchKnowledge) {
      try {
        const knowledgeRes = await fetch('/api/nyx/knowledge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            languages: analysis!.detectedLanguages,
            frameworks: analysis!.frameworks,
            intent: analysis!.intent,
            prompt: prompt.substring(0, 500)
          }),
          signal: controller.signal
        });
        if (knowledgeRes.ok) {
          const knowledgeData = await knowledgeRes.json();
          if (knowledgeData.success && knowledgeData.knowledge) {
            sdkKnowledge = `\n\n[GOOGLE SDK KNOWLEDGE EXTENSION]\n${knowledgeData.knowledge}\n[END SDK KNOWLEDGE]\n`;
          }
        }
      } catch (err) {
        console.error('Knowledge extension API failed:', err);
      }
    }

    // Transition to Stage 1 banner
    const prefix = analysisPrefix + searchPrefix + (shouldFetchKnowledge ? KNOWLEDGE_BANNER : '');
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.content = prefix + STAGE1_BANNER;
      }
      return history;
    });

    // ── Pipeline settings: always use max output tokens so code is NEVER cut off ──
    const pipelineSettings = { ...modelSettings, maxTokens: 16384 };

    // ── System Instructions (enriched with language knowledge) ─────────────
    const architectInstruction = `You are the Principal Software Architect Agent with expert knowledge of 30+ programming languages and their ecosystems.

${CODING_KNOWLEDGE_SUMMARY}
${langKnowledge}

Given the user's prompt and the analysis context, formulate a highly detailed architectural plan and system design blueprint.
Focus on:
- System design patterns & components using the DETECTED LANGUAGE'S modern idioms
- Core data structures & algorithms appropriate for the detected tech stack
- Critical performance considerations & bottlenecks
- Edge cases, error handling, and security considerations
- The correct package manager, build tools, and project structure for the detected language

Output a structured blueprint. Do NOT include greetings or extra conversation.`;

    const coderInstructionOriginal = `You are the Senior Coder Agent with expert knowledge of 30+ programming languages.

${CODING_KNOWLEDGE_SUMMARY}
${langKnowledge}

Your job is to implement the complete system codebase based on the Architect's blueprint.
RULES:
- Output ONLY complete, production-ready code using the most modern idioms for the detected language.
- Never use comments like "// todo", "// implement later", or placeholders.
- Strictly handle all security, error boundaries, and edge cases described in the blueprint.
- Use the correct import syntax, package names, and API patterns for the detected frameworks.
- Keep the code well-organized, highly readable, and modular.`;

    const optimizerInstructionOriginal = `You are the High-Performance Optimizer & Lead Delivery Agent with expert knowledge of 30+ programming languages.

${CODING_KNOWLEDGE_SUMMARY}
${langKnowledge}

Your job is to:
1. Audit and fully optimize the draft code for speed, memory, accessibility (WCAG 2.2 AA), and clean architecture.
2. Deliver the COMPLETE, FINAL, production-ready code to the user.

CRITICAL RULES — VIOLATIONS WILL BREAK THE OUTPUT:
- NEVER truncate or abbreviate code. Every file must be 100% complete from first character to last.
- NEVER write comments like "/* rest of styles */", "// ... existing code ...", or "[rest of code here]" — these are forbidden.
- If a file is long, output ALL of it anyway. Do not cut corners.
- Output each file in a properly labeled code block (e.g. \`\`\`html, \`\`\`typescript, \`\`\`css, etc.)
- Do NOT reference stages, agents, or internal pipeline steps in your response.
- Ensure all imports, package names, and APIs are correct for the detected language/framework.
- After all code blocks, add a ## How to Use section with numbered steps (save as X, open in Y, etc.)
- Keep the tone direct and professional.`;

    const coderInstruction = rulesBlock ? `${coderInstructionOriginal}\n\n${rulesBlock}` : coderInstructionOriginal;
    const optimizerInstruction = rulesBlock ? `${optimizerInstructionOriginal}\n\n${rulesBlock}` : optimizerInstructionOriginal;

    // ── Stage 1: Architect (internal — user sees banner only) ──────────────
    let architectText = '';

    const architectPrompt = `${prompt}${analysisContext}${searchContext}${sdkKnowledge}`;

    const architectResult = await AIService.execute(
      architectModelId, architectProvider, architectPrompt, architectApiKey, architectInstruction, pipelineSettings,
      (_accumulatedText) => {
        // Stage 1 output is internal — keep the banner visible but don't expose raw architect text
        const elapsed = Date.now() - startTime;
        updateMetrics(activeAgent, { latency: elapsed, tokens: Math.floor(_accumulatedText.length / 4), tps: 0 });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    architectText = architectResult.text;
    trackUsage(architectProvider, architectResult.metrics.tokens);

    // Show stage-2 banner
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.content = prefix + STAGE1_BANNER + STAGE2_BANNER;
      }
      return history;
    });

    // ── Stage 2: Coder (internal — user sees banner only) ─────────────────
    let coderText = '';

    const coderPrompt = `USER PROMPT: ${prompt}

ARCHITECT'S BLUEPRINT:
${architectText}

Implement the complete system codebase. Cover all files, functions, and edge cases specified by the architect. Output complete and functional code only.`;

    const coderResult = await AIService.execute(
      coderModelId, coderProvider, coderPrompt, coderApiKey, coderInstruction, pipelineSettings,
      (_accumulatedText) => {
        // Stage 2 output is internal — keep the banner visible but don't expose raw coder text
        const elapsed = Date.now() - startTime;
        const totalTokens = architectResult.metrics.tokens + Math.floor(_accumulatedText.length / 4);
        updateMetrics(activeAgent, { latency: elapsed, tokens: totalTokens, tps: 0 });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    coderText = coderResult.text;
    trackUsage(coderProvider, coderResult.metrics.tokens);

    // Show stage-3 banner (brief, then replaced by streaming optimizer output)
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.content = prefix + STAGE1_BANNER + STAGE2_BANNER + STAGE3_BANNER;
      }
      return history;
    });

    // ── Stage 3: Optimizer (streamed directly to the user as the final answer)
    let optimizerText = '';

    const optimizerPrompt = `USER PROMPT: ${prompt}

ARCHITECT'S BLUEPRINT:
${architectText}

INITIAL DRAFT CODE:
${coderText}

Audit this implementation. Apply maximum optimizations for speed, memory efficiency, accessibility, and clean architecture.
Deliver the final complete code to the user — no placeholders, no partial snippets, 100% complete files only.
End your response with a "## How to Use" section with clear implementation steps.`;

    const optimizerResult = await AIService.execute(
      optimizerModelId, optimizerProvider, optimizerPrompt, optimizerApiKey, optimizerInstruction, pipelineSettings,
      (accumulatedText) => {
        optimizerText = accumulatedText;
        const elapsed = Date.now() - startTime;
        const totalTokens = architectResult.metrics.tokens + coderResult.metrics.tokens + Math.floor(optimizerText.length / 4);
        const tps = elapsed > 0 ? Math.round(totalTokens / (elapsed / 1000)) : 0;
        const currentMetrics = { latency: elapsed, tokens: totalTokens, tps };

        // Replace the entire message content with the optimizer's streaming output
        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = optimizerText;
            last.metrics = currentMetrics;
          }
          return history;
        });

        updateMetrics(activeAgent, currentMetrics);
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap['nyx'].slice(-10) }
    );

    optimizerText = optimizerResult.text;
    trackUsage(optimizerProvider, optimizerResult.metrics.tokens);

    const finalElapsed = Date.now() - startTime;
    const finalTokens = architectResult.metrics.tokens + coderResult.metrics.tokens + optimizerResult.metrics.tokens;
    const finalTps = finalElapsed > 0 ? Math.round(finalTokens / (finalElapsed / 1000)) : 0;
    const finalMetrics = { latency: finalElapsed, tokens: finalTokens, tps: finalTps };

    // Commit the final clean output
    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = optimizerText;
        last.metrics = finalMetrics;
      }
      getSuggestions(history);
      return history;
    });

    updateMetrics(activeAgent, finalMetrics);
    if (activeAgent === 'nyx') {
      triggerBackgroundCritic(prompt, optimizerText);
    }
  };

  const runSingleAgentPipeline = async (
    prompt: string, 
    controller: AbortController, 
    controllerRef: React.MutableRefObject<AbortController | null>,
    systemPromptOverride?: string
  ) => {
    const persona = agentPersonas[activeAgent];
    const systemPrompt = systemPromptOverride || persona.systemPrompt;
    const currentModelId = models[activeAgent];
    const provider = detectProvider(currentModelId, ollamaModels, lmStudioModels);
    const apiKey = getEffectiveApiKey(provider, apiKeys);

    updateHistory(activeAgent, prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]);

    const startTime = Date.now();
    const result = await AIService.execute(
      currentModelId, provider, prompt, apiKey, systemPrompt, modelSettings,
      (accumulatedText) => {
        const elapsed = Date.now() - startTime;
        const tokens = Math.floor(accumulatedText.length / 4);
        const tps = elapsed > 0 ? Math.round(tokens / (elapsed / 1000)) : 0;
        updateMetrics(activeAgent, { latency: elapsed, tokens, tps });

        updateHistory(activeAgent, prev => {
          const history = [...prev];
          const last = history[history.length - 1];
          if (last && last.role === 'assistant') {
            last.content = accumulatedText;
            last.metrics = { latency: elapsed, tokens, tps };
          }
          return history;
        });
      },
      controller.signal,
      { lmStudioBaseUrl, ollamaBaseUrl, history: historyMap[activeAgent].slice(-10) }
    );

    trackUsage(provider, result.metrics.tokens);

    updateHistory(activeAgent, prev => {
      const history = [...prev];
      const last = history[history.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = result.text;
        last.metrics = result.metrics;
      }
      getSuggestions(history);
      return history;
    });

    updateMetrics(activeAgent, result.metrics);
    if (activeAgent === 'nyx') {
      triggerBackgroundCritic(prompt, result.text);
    }
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
