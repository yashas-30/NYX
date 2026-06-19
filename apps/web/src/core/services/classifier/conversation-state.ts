/**
 * @file conversation-state.ts
 * @description Conversation state tracking — creation and updates across turns.
 */

import type { ConversationState, PromptAnalysis } from './types';

// ---------------------------------------------------------------------------
// Create initial conversation state
// ---------------------------------------------------------------------------

export function createConversationState(): ConversationState {
  return {
    turnCount: 0,
    lastIntent: null,
    lastLanguages: [],
    lastFrameworks: [],
    pendingToolCalls: false,
    userFrustrationLevel: 0,
    topicDrift: 0,
  };
}

// ---------------------------------------------------------------------------
// Update conversation state after each prompt analysis
// ---------------------------------------------------------------------------

export function updateConversationState(
  state: ConversationState,
  analysis: PromptAnalysis
): ConversationState {
  // Detect repeated similar prompts (frustration indicator)
  if (analysis.intent === state.lastIntent) {
    state.userFrustrationLevel = Math.min(1, state.userFrustrationLevel + 0.2);
  } else {
    state.userFrustrationLevel = Math.max(0, state.userFrustrationLevel - 0.1);
  }

  state.topicDrift = state.lastIntent === analysis.intent ? 0 : 0.5;
  state.lastIntent = analysis.intent;
  state.lastLanguages = analysis.detectedLanguages;
  state.lastFrameworks = analysis.frameworks;
  state.turnCount++;

  return state;
}
