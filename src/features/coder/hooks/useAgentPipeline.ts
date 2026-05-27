/**
 * @file src/features/coder/hooks/useAgentPipeline.ts
 * @description Core AI execution pipeline for NYX agent.
 * Single-agent fast path for simple prompts, multi-stage deep-thinking path for complex prompts.
 * All stages use the model selected in the model selector.
 */

import { useState, useCallback, useRef } from 'react';
import { AIService } from '@src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, AISettings, AgentPersona, SubagentTask } from '@src/infrastructure/types';
import { detectProvider, getEffectiveApiKey, requiresApiKey } from '@src/infrastructure/utils/provider';
import { analyzePrompt, NON_CODE_REJECTION, isMissingDebugDetails, MISSING_DEBUG_DETAILS_RESPONSE } from '@/shared/promptAnalyzer';
import { getLanguageKnowledge, CODING_KNOWLEDGE_SUMMARY } from '@src/config/codingKnowledge';
import { toast } from '@src/components/ui/sonner';
import { SubagentOrchestrator } from './useSubagentOrchestrator';

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
  mode: 'chat' | 'code';
}

/** NYX system instruction — used for single-agent fast path */
const NYX_SYSTEM_INSTRUCTION = `You are NYX, a professional, elite, and highly capable AI software engineering assistant developed by Yashas. Always identify yourself as NYX. Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language. Focus on providing highly structured, precise, clean, and complete code solutions.

${CODING_KNOWLEDGE_SUMMARY}

AGENTIC CODE & DESIGN PROTOCOLS:
1. FULL-OUTPUT ENFORCEMENT (MANDATORY):
   - Treat every task as production-critical.
   - NEVER generate partial code or lazy placeholders (e.g. "// ...", "// rest of code", or "TODO"). Every file must be complete, runnable, and production-ready.
   
2. DETAILED VISUAL DESIGN & UI/UX ARCHITECTURE (21st.dev & Senior Design-Engineering Standard):
   - When generating frontend interfaces, strictly adhere to these elite design-engineering principles:
     * 21st.dev Component Integration: Leverage the curated component styling of [21st.dev](https://21st.dev) (the premier shadcn/ui React Tailwind registry). Suggest components by author/name (e.g., shadcn, magicui, bundui) and output the standard installation commands like \`npx shadcn@latest add https://21st.dev/r/{author}/{component}\`.
     * Color Calibration (No Cliché Purple): Banish generic "AI purple text/glows" or neon overlays. Max 1 Accent color with saturation < 80%, blended with absolute Slate/Zinc neutrals. Custom brand colors must match the industry: Teal for AI/writing, Deep Emerald for devtools, Navy/Steel for enterprise/finance, Warm Coral/Rose for creative.
     * Iconography & Emojis: Emojis are strictly BANNED in all generated code, comments, and alt texts. Use Lucide React, Phosphor React, or clean inline SVG primitives with standardized strokeWidth (1.5). Banish sparks, stars, or wand icons to avoid looking "AI-generated".
     * Typography: \`Inter\` is strictly BANNED. Headings must use Satoshi, Geist, or Outfit with tight tracking (\`tracking-tighter leading-none\`). Software & Dashboard UIs must use pure Sans-Serif pairs (Geist + Geist Mono or Satoshi + JetBrains Mono) with monospace font for all numbers.
     * Materiality & Card Hardening: Avoid boxing every metric in card components. Group related metrics using purely negative space, top-borders, or divide-y lines. Cards are used only when z-index elevation is functionally needed. Shadow glows are desaturated and tinted to match the background hue.
     * Layout Normalization: Standardize container widths using \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`. Align text and layout grids perfectly across sections. Multi-column grids must fall back to a single column below 768px. Never use \`h-screen\` (leads to mobile jumps)—always use \`min-h-[100dvh]\` for full sections.
     * Interactive Cycles: Build complete states. Include layout skeleton loaders (never generic circular spinners), beautiful blank/empty states, and clear inline form error feedback. Add tactile push feedback (\`scale-[0.98]\` or \`scale-[0.97]\` on \`:active\`) for buttons, links, and cards.
     * Motion & Easing Polish: CSS transitions must be fast (<250ms ease-out). Banish \`ease-in\` on dropdowns and popovers. Easing curves should be snappy: \`cubic-bezier(0.23, 1, 0.32, 1)\`. Avoid \`transition: all\`; always specify the target property explicitly (e.g., \`transition: transform 200ms ease-out\`).
     * Springs & Transitions: For dynamic gestures, use Framer Motion springs (\`stiffness: 100, damping: 20\`). Never animate from \`scale(0)\`; start entry transitions from \`scale(0.95)\` with \`opacity: 0\` to preserve physical weight.
     * No Invented Fake Metrics: Do not invent mock round statistics like "99.9% uptime" or "10x speed". Use organic, realistic figures or write \`[metric]\` labels. Banish custom cursor styles.
     * Gradient Accents: Gradients must be solid and readable. Never place gradient elements with \`-z-10\` behind parent \`bg-background\` containers (the parent covers the gradient). Avoid oklch() color spaces inside custom \`radial-gradients()\` due to browser rendering issues; use \`rgba()\` or hex strings instead.

3. MODULAR REACT & TYPESCRIPT ENGINEERING:
   - Separate concerns completely. Segregate event handlers/state logic into custom hooks, move static mock datasets to mockData.ts, and enforce strict type safety using Readonly props interfaces.

OUTPUT GUIDELINES:
- Respond in a natural, conversational, and highly professional chatbot manner (like Google Gemini).
- Answer greetings, general queries, simple questions, or chit-chat directly, friendly, and concisely. Do not output system design overviews, implementation plans, or code steps for simple conversational or general prompts.
- Keep responses clean, clear, and relevant to the user's query.`;

/** NYX Chat system instruction — conversational, Claude-like, no stiff greeting */
const NYX_CHAT_SYSTEM_PROMPT = `You are NYX, an intelligent AI assistant built by Yashas for developers.

PERSONALITY:
- Warm, direct, and conversational — like Claude.ai
- Match the user's tone: casual questions get casual answers, serious questions get thorough ones
- Never start every response with "Hello. I am NYX." — vary your greeting style
- For greetings: respond naturally ("Hey! How can I help?" not always the same intro)
- For general questions: answer directly without heavy structure
- For code questions: provide complete, working code with brief explanation

CONVERSATION:
- Remember and reference earlier context in this conversation
- Build on previous messages naturally
- If asked to modify earlier code, reference and improve the previous version

RULES:
- Complete code only — no "// TODO" or "// rest of code here"
- No emojis in code or technical content
- Keep prose responses concise; expand only when depth is genuinely needed
- Never say "As an AI language model..."`;

/** Check if the prompt is a simple greeting or identity query */
const isGreetingOrIdentity = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)(?:\s+(?:nyx|assistant|there|friend|everyone|all))?[.,!?\s]*$/i;
  const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;
  return GREETINGS.test(trimmed) || IDENTITY.test(trimmed);
};



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
  codebaseKnowledgeEnabled,
  mode
}: PipelineProps) => {
  const [isLoading, setIsLoading] = useState(false);
  const [subagentTasks, setSubagentTasks] = useState<SubagentTask[]>([]);
  const controllerRef = useRef<AbortController | null>(null);
  const orchestratorRef = useRef<SubagentOrchestrator | null>(null);
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
    orchestratorRef.current?.abort();
    orchestratorRef.current = null;
    const controller = new AbortController();
    controllerRef.current = controller;

    // Append user message
    const userMsg: ChatMessage = { role: 'user', content: prompt, timestamp: Date.now() };
    updateHistory(prev => [...prev, userMsg]);

    setIsLoading(true);
    setSuggestedPrompts([]);
    updateMetrics({ latency: 0, tokens: 0, tps: 0 });
    setSubagentTasks([]);

    try {
      if (mode === 'chat') {
        // ── CHAT MODE: Pure direct LLM, like Claude Desktop ──
        // Seed loading placeholder
        updateHistory(prev => [...prev, { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' }]);

        const startTime = Date.now();
        let lastStreamUpdate = 0;

        const result = await AIService.execute(
          nyxModel,
          nyxProvider,
          prompt,
          nyxApiKey,
          NYX_CHAT_SYSTEM_PROMPT,
          modelSettings,
          (accumulatedText) => {
            const now = Date.now();
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
          { history: historyRef.current.slice(-20) } // more history for chat
        );

        trackUsage(nyxProvider, result.metrics.tokens);

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

      } else {
        // ── CODE MODE: Single-agent with context injection ──
        const regexAnalysis = analyzePrompt(prompt);

        // Missing details check
        if (isMissingDebugDetails(prompt, regexAnalysis.intent)) {
          updateHistory(prev => [
            ...prev,
            { role: 'assistant', content: MISSING_DEBUG_DETAILS_RESPONSE, timestamp: Date.now(), status: 'success' }
          ]);
          toast.error('Please provide your code or error logs');
          return;
        }

        // Fetch rules
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

        const langKnowledge = getLanguageKnowledge(regexAnalysis.detectedLanguages);
        const systemPrompt = `${NYX_SYSTEM_INSTRUCTION}\n\n${langKnowledge}\n\n${rulesBlock}`;

        await runSingleAgentPipeline(
          prompt,
          controller,
          systemPrompt,
          regexAnalysis as any,
          undefined // Always use selected model
        );
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
      orchestratorRef.current = null;
      setIsLoading(false);
    }
  }, [models, apiKeys, agentPersonas, modelSettings, trackUsage, updateHistory, updateMetrics, setSuggestedPrompts, mode]);

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
    if (orchestratorRef.current) {
      orchestratorRef.current.abort();
      orchestratorRef.current = null;
    }
    setIsLoading(false);
  }, []);

  return { isLoading, runCoder, stopCoder, subagentTasks };
};
