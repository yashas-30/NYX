/**
 * Barrel export for classifier submodules.
 * Re-exports everything from the original promptClassifier.ts location.
 */

export type {
  PromptIntent,
  PromptAnalysis,
  ConversationState,
  AgentRoute,
  ToolCapability,
  IntentEmbedding,
  LanguagePattern,
  FrameworkPattern,
} from './types';

export { INTENT_EMBEDDINGS } from './intent-embeddings';
export { LANGUAGE_PATTERNS, FRAMEWORK_PATTERNS } from './patterns';
export { computeSemanticScore, textToVector, cosineSimilarity } from './similarity';
export { createConversationState, updateConversationState } from './conversation-state';
export { detectUrgency } from './urgency';
export { estimateTokens } from './token-estimator';
export { LLM_CLASSIFIER_PROMPT, classifyWithLLM } from './llm-classifier';
export { SYSTEM_PROMPTS, routeToAgent } from './agent-router';
export { analyzePrompt, classifyPrompt } from './prompt-classifier';
