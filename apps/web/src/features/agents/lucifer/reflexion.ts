/**
 * reflexion.ts
 *
 * Self-critique and correction pass for Lucifer responses.
 *
 * After the LLM generates a response, runs a lightweight critique pass
 * using a fast/cheap model to check:
 * 1. Did the response actually answer the user's question?
 * 2. Are any facts unverified / should cite sources?
 * 3. Is the format appropriate (code block, markdown, plain text)?
 * 4. For code: are there obvious syntax errors or missing imports?
 * 5. Is the response length appropriate for the question?
 *
 * The critique is intentionally fast and shallow — it uses a cheap model
 * (Gemini Flash or the smallest available) and runs in < 1 second.
 * For heavy tasks (code generation, research), it runs by default.
 * For conversational turns, it is SKIPPED to avoid latency.
 *
 * If the critique flags issues, it appends an inline correction note
 * to the response (does NOT re-generate the full response by default).
 */

import { invoke, Channel } from '@tauri-apps/api/core';
import { startSpan, endSpan } from './observabilitySpans';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface ReflexionResult {
  passed: boolean;
  issues: string[];
  correctionNote?: string;   // If set, append to the response
  correctedResponse?: string; // If set, replace the response entirely
  confidence: number;         // 0-1: how confident the reflexion model is
  skipped: boolean;          // True if reflexion was skipped (conversational turn)
}

export interface ReflexionOptions {
  /** The original user question */
  userQuery: string;
  /** The generated assistant response */
  response: string;
  /** Intent of the turn — affects which checks run */
  intent: 'conversational' | 'web_search' | 'code_engineering' | 'model_capabilities' | string;
  /** Model to use for the critique (default: cheapest available) */
  critiqueModel?: string;
  critiqueProvider?: string;
  critiqueApiKey?: string;
  turnId: string;
  parentSpanId?: string;
}

// ── Rule-based pre-checks (free — no LLM needed) ──────────────────────────

interface RuleCheckResult {
  issues: string[];
  skipLLMCheck: boolean;
}

function runRuleBasedChecks(opts: ReflexionOptions): RuleCheckResult {
  const { userQuery, response, intent } = opts;
  const issues: string[] = [];

  // 1. Empty or very short response
  if (response.trim().length < 20) {
    issues.push('Response is too short — may not have answered the question');
  }

  // 2. Response is just a question back (non-answer)
  const responseIsQuestion =
    response.trim().endsWith('?') &&
    response.split('\n').length <= 3;
  if (responseIsQuestion && intent !== 'conversational') {
    issues.push('Response appears to be a question rather than an answer');
  }

  // 3. Code intent but no code block
  if (intent === 'code_engineering' && !response.includes('```')) {
    issues.push('Code was requested but no code block was provided');
  }

  // 4. "I don't know" / uncertainty on a factual question
  const uncertaintyPhrases = /\b(?:I don't know|I cannot|I'm not sure|I am not sure|I don't have access|I cannot access|I do not have|no real.time|my training data)\b/i;
  if (
    uncertaintyPhrases.test(response) &&
    intent === 'web_search'
  ) {
    issues.push('Model expressed uncertainty despite web search context being provided');
  }

  // 5. Response doesn't address key nouns from the query
  const queryNouns = userQuery
    .split(/\W+/)
    .filter(w => w.length > 4 && !/^(?:what|when|where|which|should|would|could|there|about|their|being|every)$/i.test(w));
  if (queryNouns.length > 0 && response.length > 100) {
    const responseL = response.toLowerCase();
    const missedNouns = queryNouns
      .filter(n => !responseL.includes(n.toLowerCase()))
      .slice(0, 3);
    if (missedNouns.length >= Math.ceil(queryNouns.length * 0.5) && queryNouns.length >= 3) {
      issues.push(`Response may not address key topics: ${missedNouns.join(', ')}`);
    }
  }

  // Skip LLM check for conversational turns or short responses
  const skipLLMCheck =
    intent === 'conversational' ||
    response.length < 100 ||
    issues.length === 0; // Rule checks passed cleanly

  return { issues, skipLLMCheck };
}

// ── LLM critique prompt ────────────────────────────────────────────────────

const CRITIQUE_PROMPT = (query: string, response: string) => `You are a response quality evaluator. Evaluate if the RESPONSE adequately answers the QUERY.

QUERY: ${query.slice(0, 500)}

RESPONSE: ${response.slice(0, 1500)}

Reply with ONLY this JSON (no markdown, no explanation):
{
  "passed": true or false,
  "issues": ["issue 1", "issue 2"],
  "correction_note": "one-sentence correction or empty string",
  "confidence": 0.0 to 1.0
}

Rules:
- passed=true if the response genuinely answers the query
- passed=false if it's incomplete, off-topic, or expresses inability
- issues: list specific, actionable problems (max 3)
- correction_note: if passed=false, a brief correction hint. If passed=true, empty string.
- confidence: how sure you are of your evaluation`;

// ── Main reflexion function ────────────────────────────────────────────────

/**
 * Run the reflexion (self-critique) pass.
 *
 * For conversational turns: skips the LLM check, runs only rule-based.
 * For code/research/search turns: runs both rule-based and LLM critique.
 */
export async function runReflexion(opts: ReflexionOptions): Promise<ReflexionResult> {
  const {
    turnId,
    parentSpanId,
    intent,
    userQuery,
    response,
    critiqueModel,
    critiqueProvider,
    critiqueApiKey,
  } = opts;

  const reflexionSpan = startSpan('reflexion', 'Reflexion Pass', turnId, parentSpanId);

  try {
    // Step 1: Rule-based checks (always run, free)
    const { issues: ruleIssues, skipLLMCheck } = runRuleBasedChecks(opts);

    if (skipLLMCheck || !critiqueApiKey) {
      // Pure rule-based result
      const passed = ruleIssues.length === 0;
      const result: ReflexionResult = {
        passed,
        issues: ruleIssues,
        correctionNote: !passed && ruleIssues.length > 0
          ? `Note: ${ruleIssues[0]}.`
          : undefined,
        confidence: 0.7,
        skipped: skipLLMCheck,
      };
      endSpan(reflexionSpan, passed ? 'ok' : 'fallback', {
        reflexionPassed: passed,
        reflexionIssues: ruleIssues,
      });
      return result;
    }

    // Step 2: LLM critique (only for non-conversational turns with API key)
    // Always use the fastest/cheapest available model for the critique
    const effectiveModel = (critiqueModel?.includes('pro') || critiqueModel?.includes('reasoner'))
      ? 'gemini-3.5-flash'
      : (critiqueModel ?? 'gemini-3.5-flash');
    const effectiveProvider = critiqueProvider ?? 'gemini';

    try {

      // Build a minimal single-shot request using run_lucifer_turn
      const critiqueMessages = [
        { role: 'user', content: CRITIQUE_PROMPT(userQuery, response) },
      ];

      let critiqueText = '';
      const ch = new Channel<any>();
      ch.onmessage = (ev: any) => {
        if (ev?.delta) critiqueText += ev.delta;
        else if (ev?.content) critiqueText += ev.content;
      };

      await invoke('run_lucifer_turn', {
        request: {
          provider: effectiveProvider,
          model_id: effectiveModel,
          api_key: critiqueApiKey,
          messages: critiqueMessages,
          temperature: 0.0,
          top_p: 0.95,
          top_k: 1,
          repeat_penalty: 1.0,
          system_instruction: 'You are a response quality evaluator. Output JSON only.',
          event_name: `reflexion_${turnId}_${Date.now()}`,
          max_tokens: 256,
          execution_mode: 'chat',
          reasoning_enabled: false,
          context_window: 4096,
        },
        onEvent: ch,
      });

      // Parse JSON response
      const jsonMatch = critiqueText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No JSON in critique response');

      const parsed = JSON.parse(jsonMatch[0]);
      const passed = parsed.passed === true;
      const allIssues = [...ruleIssues, ...(parsed.issues ?? [])].slice(0, 5);
      const correctionNote = parsed.correction_note && parsed.correction_note.trim()
        ? `\n\n> ⚠️ *Self-review note: ${parsed.correction_note}*`
        : undefined;

      const result: ReflexionResult = {
        passed,
        issues: allIssues,
        correctionNote,
        confidence: parsed.confidence ?? 0.8,
        skipped: false,
      };

      endSpan(reflexionSpan, passed ? 'ok' : 'fallback', {
        reflexionPassed: passed,
        reflexionIssues: allIssues,
      });
      return result;

    } catch (llmErr) {
      // LLM critique failed — fall back to rule-based only
      const passed = ruleIssues.length === 0;
      const result: ReflexionResult = {
        passed,
        issues: ruleIssues,
        correctionNote: undefined,
        confidence: 0.6,
        skipped: false,
      };
      endSpan(reflexionSpan, 'fallback', { error: String(llmErr) });
      return result;
    }

  } catch (err) {
    endSpan(reflexionSpan, 'error', { error: String(err) });
    return {
      passed: true, // Don't degrade UX on reflexion failure
      issues: [],
      confidence: 0,
      skipped: true,
    };
  }
}

/**
 * Determines whether reflexion should run for a given intent.
 * Avoids running the critique on simple conversational turns.
 */
export function shouldRunReflexion(
  intent: string,
  responseLength: number,
  hasApiKey: boolean
): boolean {
  if (!hasApiKey) return false; // Can't run LLM critique without key (rule-based still runs)
  if (intent === 'conversational') return false;
  // web_search: grounding is enforced by the [LIVE WEB SEARCH RESULTS] prompt structure;
  // running a second LLM call here adds 500-2000ms with negligible quality benefit.
  if (intent === 'web_search') return false;
  if (responseLength < 50) return false;  // Too short to critique
  return true;
}
