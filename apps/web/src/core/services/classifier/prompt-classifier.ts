/**
 * Core prompt classifier — ties together intent embeddings, similarity scoring,
 * urgency detection, token estimation, conversation state, and LLM fallback.
 */

import { detectHardware } from '@nyx/shared';
import { createConversationState } from './conversation-state';
import { INTENT_EMBEDDINGS } from './intent-embeddings';
import { LANGUAGE_PATTERNS, FRAMEWORK_PATTERNS } from './patterns';
import { computeSemanticScore } from './similarity';
import { detectUrgency } from './urgency';
import { estimateTokens } from './token-estimator';
import { classifyWithLLM } from './llm-classifier';
import { routeToAgent } from './agent-router';
import type {
  PromptIntent,
  PromptAnalysis,
  ConversationState,
  AgentRoute,
} from './types';

// ---------------------------------------------------------------------------
// Core classifier
// ---------------------------------------------------------------------------

export function analyzePrompt(
  prompt: string,
  conversationState?: ConversationState
): PromptAnalysis {
  const lower = prompt.toLowerCase();

  // --- Semantic intent detection ---
  const scores: Array<{ intent: PromptIntent; score: number; weight: number }> = [];

  for (const embedding of INTENT_EMBEDDINGS) {
    const semanticScore = computeSemanticScore(prompt, embedding);
    scores.push({
      intent: embedding.intent,
      score: semanticScore,
      weight: embedding.weight,
    });
  }

  // Sort by weighted score
  scores.sort((a, b) => b.score * b.weight - a.score * a.weight);

  let bestIntent = scores[0].intent;
  let bestScore = scores[0].score;

  // Multi-intent detection (score within 20% of top)
  const multiIntent = scores
    .filter((s) => s.intent !== bestIntent && s.score > bestScore * 0.2 && s.score > 0.1)
    .map((s) => s.intent);

  // Conversation context overrides
  const isFollowUp = !!conversationState && conversationState.turnCount > 0;

  if (isFollowUp && conversationState) {
    // Continuation detection
    if (prompt.length < 20 && /^(continue|go on|more|and\?|then\?|keep going)/i.test(prompt)) {
      bestIntent = 'continuation';
      bestScore = 1;
    }

    // Correction detection
    if (/^(no|not|actually|wait|hold on|that is wrong|incorrect)/i.test(prompt)) {
      bestIntent = 'correction';
      bestScore = 1;
    }

    // Clarification
    if (/^(what do you mean|i do not understand|confused|elaborate|explain that)/i.test(prompt)) {
      bestIntent = 'clarification';
      bestScore = 1;
    }

    // Topic drift detection
    if (bestIntent !== conversationState.lastIntent) {
      const drift = computeSemanticScore(
        prompt,
        INTENT_EMBEDDINGS.find((e) => e.intent === conversationState.lastIntent) ||
          INTENT_EMBEDDINGS[0]
      );
      if (drift < 0.1) {
        bestScore = Math.min(1, bestScore + 0.1);
      }
    }
  }

  // Code block override (only if no stronger signal)
  if (/```\w*/.test(prompt)) {
    const codeGenScore = scores.find((s) => s.intent === 'code_generation')?.score || 0;
    const explainScore = scores.find((s) => s.intent === 'explain_code')?.score || 0;
    const debugScore = scores.find((s) => s.intent === 'code_debug')?.score || 0;

    if (codeGenScore > explainScore && codeGenScore > debugScore && bestScore < 0.5) {
      bestIntent = 'code_generation';
      bestScore = Math.max(bestScore, 0.6);
    }
  }

  // File path detection
  const hasFilePath =
    /\b\w+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|cs|rb|php|swift|kt|sql|json|md|yml|yaml|html|css|scss)\b/.test(
      prompt
    );
  if (hasFilePath && bestScore < 0.4) {
    bestIntent = 'codebase_query';
    bestScore = Math.max(bestScore, 0.5);
  }

  const confidence = Math.min(1, bestScore * 2 + 0.15);

  // --- Language & framework detection ---
  const detectedLanguages = LANGUAGE_PATTERNS.filter((p) => p.pattern.test(prompt)).map(
    (p) => p.id
  );

  const frameworks = FRAMEWORK_PATTERNS.filter((p) => p.pattern.test(prompt)).map((p) => p.id);

  // --- Complexity analysis ---
  const codeLines = (prompt.match(/\n/g) || []).length;
  const codeBlocks = (prompt.match(/```/g) || []).length / 2;
  const hasMultipleFiles = prompt.includes('=== FILE:') || codeBlocks > 1;
  const words = prompt.split(/\s+/).length;
  const uniqueTokens = new Set(prompt.toLowerCase().split(/\W+/)).size;
  const lexicalDensity = uniqueTokens / words;

  let complexity: PromptAnalysis['complexity'] = 'simple';

  if (words > 300 || codeLines > 100 || hasMultipleFiles || lexicalDensity > 0.7) {
    complexity = 'enterprise';
  } else if (words > 150 || codeLines > 40 || codeBlocks > 2) {
    complexity = 'complex';
  } else if (words > 60 || codeLines > 15 || lexicalDensity > 0.55) {
    complexity = 'moderate';
  } else if (words < 8 && !hasFilePath) {
    complexity = 'trivial';
  }

  // --- Context & execution needs ---
  const contextIntents: PromptIntent[] = [
    'code_debug',
    'code_review',
    'explain_code',
    'refactor',
    'architecture_design',
    'codebase_query',
    'file_operation',
  ];
  const requiresContext = contextIntents.includes(bestIntent) || hasFilePath;

  const executionIntents: PromptIntent[] = [
    'terminal_command',
    'file_operation',
    'code_generation',
  ];
  const requiresExecution = executionIntents.includes(bestIntent) && complexity !== 'trivial';

  // --- Model tier suggestion ---
  let suggestedModel: PromptAnalysis['suggestedModel'] = 'fast';
  if (complexity === 'enterprise' || bestIntent === 'architecture_design') {
    suggestedModel = 'powerful';
  } else if (complexity === 'complex' || (requiresContext && complexity === 'moderate')) {
    suggestedModel = 'balanced';
  }

  // Urgency boost
  const urgency = detectUrgency(prompt);
  if (urgency === 'high' && bestIntent === 'code_debug') {
    suggestedModel = 'powerful';
  }

  // Hardware analysis
  const hardware = detectHardware(prompt);

  // --- Execution Mode Selection Heuristics ---
  let suggestedExecutionMode: 'standard' | 'parallel' | 'ensemble' | 'ab-test' = 'standard';
  let suggestedExecutionReasoning = 'Standard conversational request. Using single selected model.';

  const isABTest = /\b(a\/b\s*test|ab\s*test|split\s*test|ab-test)\b/i.test(lower);
  const isParallel =
    /\b(compare|comparison|versus|vs|side\s*by\s*side|parallel|simultaneous|simultaneously|difference\s*between)\b/i.test(
      lower
    ) ||
    /\b(model\s*difference|which\s*model\s*is\s*better|which\s*is\s*better)\b/i.test(lower);
  const isEnsemble =
    /\b(ensemble|synthesize|synthesis|consensus|merge\s*responses|combine\s*answers|blend)\b/i.test(
      lower
    );

  if (isABTest) {
    suggestedExecutionMode = 'ab-test';
    suggestedExecutionReasoning = 'Detected request for A/B testing of responses.';
  } else if (isParallel) {
    suggestedExecutionMode = 'parallel';
    suggestedExecutionReasoning =
      'Detected comparative query. Running models in parallel for side-by-side evaluation.';
  } else if (isEnsemble) {
    suggestedExecutionMode = 'ensemble';
    suggestedExecutionReasoning =
      'Detected request for consensus synthesis across multiple models.';
  } else if (complexity === 'enterprise' || complexity === 'complex') {
    suggestedExecutionMode = 'ensemble';
    suggestedExecutionReasoning =
      'Highly complex task. Routing to ensemble synthesis to combine capabilities of multiple models.';
  }

  return {
    intent: bestIntent,
    confidence,
    detectedLanguages,
    frameworks,
    complexity,
    requiresContext,
    requiresExecution,
    estimatedTokens: estimateTokens(prompt, detectedLanguages),
    suggestedModel,
    hardware,
    multiIntent: multiIntent.length ? multiIntent : undefined,
    urgency,
    isFollowUp,
    suggestedExecutionMode,
    suggestedExecutionReasoning,
  };
}

// ---------------------------------------------------------------------------
// Unified entry point with fallback
// ---------------------------------------------------------------------------

export async function classifyPrompt(
  prompt: string,
  conversationState?: ConversationState,
  llmExecutor?: (prompt: string, system: string) => Promise<string>
): Promise<{ analysis: PromptAnalysis; route: AgentRoute }> {
  const analysis = analyzePrompt(prompt, conversationState);

  // Low confidence fallback to LLM
  if (analysis.confidence < 0.4 && llmExecutor) {
    const llmResult = await classifyWithLLM(prompt, llmExecutor);
    if (llmResult.confidence > analysis.confidence) {
      analysis.intent = llmResult.intent;
      analysis.confidence = llmResult.confidence;
    }
  }

  const route = routeToAgent(analysis, conversationState);
  return { analysis, route };
}
