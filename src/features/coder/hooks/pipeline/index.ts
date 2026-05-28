import React from 'react';
import { AIService, countTokens } from '@src/core/services/ai.service';
import { ChatMessage, TelemetryMetrics, AISettings } from '@src/infrastructure/types';
import { detectProvider, getEffectiveApiKey } from '@src/infrastructure/utils/provider';
import { toast } from '@src/shared/components/ui/sonner';
import { getLanguageKnowledge } from '@src/features/coder/config/codingKnowledge';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

// Import our modularized stages and utils
import {
  buildCodebaseContext,
  buildWebSearchContext,
  shouldTriggerWebSearch,
} from './utils/contextBuilder';
import { createStreamUpdate } from './utils/streamHelpers';
import { runPlanningStage } from './stages/planning';
import { runGenerationStage } from './stages/generation';
import { runVerificationStage } from './stages/verification';
import { runSummaryStage } from './stages/summary';

const STREAM_THROTTLE_MS = 50;

/** Check if the prompt is a simple greeting or identity query */
const isGreetingOrIdentity = (prompt: string): boolean => {
  const trimmed = prompt.trim();
  const GREETINGS =
    /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)\b/i;
  const IDENTITY =
    /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;
  return GREETINGS.test(trimmed) || IDENTITY.test(trimmed);
};

/** Check if the prompt is asking about codebase/project context */
const isCodebaseQuery = (prompt: string): boolean => {
  const lower = prompt.toLowerCase();
  const codebaseKeywords =
    /\b(project|codebase|repository|repo|workspace|directory|folder|files?|src|components|server|routes|package\.json|tsconfig)\b/i;
  const fileRef = /\b\w+\.(json|ts|tsx|js|jsx|py|cpp|h|ino|md|yml|yaml|css|html)\b/i;
  return codebaseKeywords.test(lower) || fileRef.test(lower);
};

export interface MultiStagePipelineParams {
  prompt: string;
  controller: AbortController;
  rulesBlock: string;
  analysis: {
    isCodeRelated: boolean;
    isMissingDebugDetails: boolean;
    missingDetailsRequest: string;
    intent: string;
    complexity: string;
    detectedLanguages: string[];
    frameworks: string[];
    summary: string;
  };
  models: Record<'nyx', string>;
  apiKeys: Record<string, string>;
  modelSettings: AISettings;
  trackUsage: (provider: string, tokens: number) => void;
  updateHistory: (updater: (prev: ChatMessage[]) => ChatMessage[]) => void;
  updateMetrics: (metrics: TelemetryMetrics) => void;
  getSuggestions: (history: ChatMessage[]) => void;
  webSearchEnabled: boolean;
  codebaseKnowledgeEnabled: boolean;
  historyRef: React.MutableRefObject<ChatMessage[]>;
  triggerBackgroundCritic: (prompt: string, responseText: string) => Promise<void>;
  generateHandoffPlan: (
    prompt: string,
    codebaseContext: string,
    modelId: string,
    provider: string,
    apiKey: string,
    apiKeys: Record<string, string>
  ) => Promise<string>;
  NYX_SYSTEM_INSTRUCTION: string;
}

export async function runMultiStagePipeline({
  prompt,
  controller,
  rulesBlock,
  analysis,
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
  NYX_SYSTEM_INSTRUCTION,
}: MultiStagePipelineParams): Promise<void> {
  const nyxModel = models['nyx'];
  if (!nyxModel) {
    toast.error('Please select a model first');
    throw new Error('No model selected');
  }
  const nyxProvider = detectProvider(nyxModel);
  const nyxApiKey = getEffectiveApiKey(nyxProvider, apiKeys) || '';

  // Resolve context flags
  const isGreeting = isGreetingOrIdentity(prompt);
  const isCodebase = codebaseKnowledgeEnabled && isCodebaseQuery(prompt) && !isGreeting;

  // Seed empty assistant message
  updateHistory((prev) => [
    ...prev,
    { role: 'assistant', content: '', timestamp: Date.now(), status: 'loading' },
  ]);

  const startTime = Date.now();

  // Build language-specific knowledge
  const langKnowledge = getLanguageKnowledge(analysis.detectedLanguages);
  const analysisContext = `\n[PROMPT ANALYSIS]\n${analysis.summary}\n- Detected Languages: ${analysis.detectedLanguages.join(', ') || 'auto-detect'}\n- Intent: ${analysis.intent}\n- Complexity: ${analysis.complexity}\n- Frameworks: ${analysis.frameworks.join(', ') || 'none'}\n[END ANALYSIS]\n`;

  // ── Codebase Context ──────────────────────────────────────────────────
  const { context: codebaseContext, maxScore: maxCodebaseScore } = await buildCodebaseContext(
    prompt,
    isCodebase,
    controller.signal
  );

  const needsCorrectiveSearch = isCodebase && maxCodebaseScore < 120 && !isGreeting;
  const executeWebSearch =
    ((webSearchEnabled && shouldTriggerWebSearch(prompt, analysis)) || needsCorrectiveSearch) &&
    !isGreeting;

  // ── Web Search Context ────────────────────────────────────────────────
  const searchContext = await buildWebSearchContext(prompt, executeWebSearch, controller.signal);

  // Helper: stream content updates to the chat
  const streamUpdate = createStreamUpdate(startTime, updateHistory, updateMetrics);

  // Helper: run a command in the sandbox terminal
  const runSandboxCommand = async (
    command: string
  ): Promise<{ success: boolean; stdout: string; stderr: string; error?: string }> => {
    try {
      const res = await fetchWithAuth('/api/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command }),
        signal: controller.signal,
      });
      const data = await res.json();
      if (res.ok) {
        return { success: true, stdout: data.stdout || '', stderr: data.stderr || '' };
      }
      return {
        success: false,
        stdout: data.stdout || '',
        stderr: data.stderr || '',
        error: data.error,
      };
    } catch (e: any) {
      return { success: false, stdout: '', stderr: '', error: e.message };
    }
  };

  // Pipeline settings: max output tokens
  const pipelineSettings = { ...modelSettings, maxTokens: 16384 };

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 1: EXECUTION PLANNING
  // ═══════════════════════════════════════════════════════════════════════
  let accumulatedOutput = `## 🧠 NYX Autonomous Agent — Execution Plan\n\n⏳ *Analyzing prompt and formulating execution plan...*\n`;
  streamUpdate(accumulatedOutput);

  const planPrompt = `USER PROMPT: ${prompt}${analysisContext}${codebaseContext}${searchContext}`;
  const plan = await runPlanningStage(
    nyxModel,
    nyxProvider,
    nyxApiKey,
    planPrompt,
    pipelineSettings,
    controller.signal,
    trackUsage
  );

  // Fallback: if planning fails, run the legacy single-shot code generation
  if (!plan || !plan.files || plan.files.length === 0) {
    accumulatedOutput = `## 🚀 NYX Agent — Generating Solution\n\n*Planning step was not needed for this request. Generating complete solution directly...*\n\n`;
    streamUpdate(accumulatedOutput);

    const handoffPlan = await generateHandoffPlan(
      prompt,
      codebaseContext,
      nyxModel,
      nyxProvider,
      nyxApiKey,
      apiKeys
    );
    const handoffBlock = `\n[NYX AGENT COORDINATOR HANDOFF SPECIFICATION]\n${handoffPlan}\n[END OF HANDOFF SPECIFICATION]\n`;

    const instruction = `${NYX_SYSTEM_INSTRUCTION}\n\n${langKnowledge}\n\nYou are Nyx, the premium AI assistant executing the final implementation.\n${rulesBlock}\n\nGEMINI-STYLE RESPONSE RULES:\n- Begin with a brief, premium architectural overview.\n- Deliver COMPLETE, FINAL, production-ready code.\n- Output each file in a properly labeled code block.\n- Do NOT reference internal stages or pipeline steps.\n- Ensure all imports, package names, and APIs are correct.\n- After all code blocks, provide a concise explanation.\n- End with a clear "## How to Use" checklist.\n- Keep the tone highly professional and authoritative.`;

    const finalPrompt = `USER PROMPT: ${prompt}${analysisContext}${handoffBlock}${codebaseContext}${searchContext}\n\nDeliver the final complete solution. Output 100% complete files only.`;

    let resultText = '';
    let lastStreamUpdate = 0;

    const result = await AIService.execute(
      nyxModel,
      nyxProvider,
      finalPrompt,
      nyxApiKey,
      instruction,
      pipelineSettings,
      (accText) => {
        resultText = accText;
        const now = Date.now();
        if (now - lastStreamUpdate < STREAM_THROTTLE_MS) return;
        lastStreamUpdate = now;
        streamUpdate(accumulatedOutput + resultText);
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

    updateHistory((prev) => {
      const h = [...prev];
      const last = h[h.length - 1];
      if (last && last.role === 'assistant') {
        last.status = 'success';
        last.content = accumulatedOutput + resultText;
        last.metrics = finalMetrics;
      }
      getSuggestions(h);
      return h;
    });
    updateMetrics(finalMetrics);
    await triggerBackgroundCritic(prompt, accumulatedOutput + resultText);
    return;
  }

  // ── Render the execution plan as a checklist ─────────────────────────
  const taskStatuses: string[] = plan.files.map(() => '⬜');

  const renderPlanChecklist = () => {
    let md = `## 🧠 NYX Autonomous Agent — Execution Plan\n\n`;
    md += `**Goal:** ${plan.summary}\n\n`;
    md += `**Architecture:** ${plan.architecture}\n\n`;
    md += `### 📋 Task Checklist\n\n`;
    plan.files.forEach((file, i) => {
      md += `${taskStatuses[i]} \`${file.path}\` — ${file.description}\n\n`;
    });
    if (plan.verifyCommands.length > 0) {
      md += `### 🔬 Verification Commands\n\n`;
      plan.verifyCommands.forEach((cmd) => {
        md += `- \`${cmd}\`\n`;
      });
      md += `\n`;
    }
    return md;
  };

  accumulatedOutput = renderPlanChecklist();
  streamUpdate(accumulatedOutput);

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 2: CODE GENERATION & DIRECT FILE WRITES
  // ═══════════════════════════════════════════════════════════════════════
  const generatedFiles: Array<{ path: string; content: string }> = [];

  await runGenerationStage(
    nyxModel,
    nyxProvider,
    nyxApiKey,
    plan,
    rulesBlock,
    prompt,
    codebaseContext,
    pipelineSettings,
    controller.signal,
    trackUsage,
    renderPlanChecklist,
    streamUpdate,
    taskStatuses,
    generatedFiles
  );

  // Sync checklist output
  accumulatedOutput = renderPlanChecklist();
  streamUpdate(accumulatedOutput);

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 3: SANDBOX VERIFICATION & SELF-CORRECTION
  // ═══════════════════════════════════════════════════════════════════════
  let accumulatedOutputVal = accumulatedOutput;
  const getAccumulatedOutput = () => accumulatedOutputVal;
  const setAccumulatedOutput = (val: string) => {
    accumulatedOutputVal = val;
  };

  const verificationLog = await runVerificationStage(
    nyxModel,
    nyxProvider,
    nyxApiKey,
    plan,
    rulesBlock,
    prompt,
    codebaseContext,
    pipelineSettings,
    controller.signal,
    trackUsage,
    streamUpdate,
    getAccumulatedOutput,
    setAccumulatedOutput,
    generatedFiles,
    runSandboxCommand
  );

  // ═══════════════════════════════════════════════════════════════════════
  // STAGE 4: FINAL AUTHORITATIVE SUMMARY
  // ═══════════════════════════════════════════════════════════════════════
  const finalSummaryOutput = runSummaryStage(
    plan,
    generatedFiles,
    verificationLog,
    getAccumulatedOutput,
    setAccumulatedOutput,
    streamUpdate
  );

  // Commit final output
  const finalElapsed = Date.now() - startTime;
  const finalTokens = countTokens(finalSummaryOutput);
  const finalTps = finalElapsed > 0 ? Math.round(finalTokens / (finalElapsed / 1000)) : 0;
  const finalMetrics = { latency: finalElapsed, tokens: finalTokens, tps: finalTps };

  updateHistory((prev) => {
    const h = [...prev];
    const last = h[h.length - 1];
    if (last && last.role === 'assistant') {
      last.status = 'success';
      last.content = finalSummaryOutput;
      last.metrics = finalMetrics;
    }
    getSuggestions(h);
    return h;
  });

  updateMetrics(finalMetrics);
  await triggerBackgroundCritic(prompt, finalSummaryOutput);
}
