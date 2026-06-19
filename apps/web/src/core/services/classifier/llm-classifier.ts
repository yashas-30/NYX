/**
 * @file llm-classifier.ts
 * @description LLM-as-a-judge fallback for low-confidence prompt classifications.
 */

import type { PromptIntent } from './types';

// ---------------------------------------------------------------------------
// LLM classifier prompt
// ---------------------------------------------------------------------------

export const LLM_CLASSIFIER_PROMPT = `You are a prompt intent classifier. Analyze the user's message and classify it into EXACTLY ONE category.

Categories:
- greeting: saying hello/hi/hey
- farewell: saying goodbye/thanks/done
- gratitude: thanking without new request
- general_chat: non-technical question or conversation
- code_generation: write/create/build new code
- code_debug: fix error/bug/crash
- code_review: review/audit existing code
- architecture_design: system design, database schema, API design
- refactor: improve existing code without changing behavior
- explain_code: understand how code works
- terminal_command: run commands, build, deploy
- file_operation: read/write/modify files
- web_search: current events, latest news, real-time info
- codebase_query: find/locate/search in existing project
- clarification: asking about previous response
- correction: correcting previous misunderstanding
- continuation: asking to continue previous response
- data_analysis: analyze data, metrics, plot, visualize

Respond ONLY with a JSON object:
{"intent": "category_name", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

// ---------------------------------------------------------------------------
// LLM fallback classification
// ---------------------------------------------------------------------------

export async function classifyWithLLM(
  prompt: string,
  llmExecutor: (prompt: string, system: string) => Promise<string>
): Promise<{ intent: PromptIntent; confidence: number }> {
  try {
    const response = await llmExecutor(prompt, LLM_CLASSIFIER_PROMPT);
    const parsed = JSON.parse(response);
    return {
      intent: parsed.intent as PromptIntent,
      confidence: parsed.confidence,
    };
  } catch {
    return { intent: 'general_chat', confidence: 0.3 };
  }
}
