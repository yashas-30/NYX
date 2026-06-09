/**
 * @file server/lib/modelUtils.ts
 * @description Shared model utilities used across the server.
 * Single source of truth for model ID resolution and common AI instructions.
 */

// ── Abstention Training Instruction ───────────────────────────────────────────
// Injected into all system prompts to reduce hallucinations by encouraging
// the model to say "I don't know" rather than guess wrong answers.
export const ABSTENTION_INSTRUCTION = `IMPORTANT: If you are unsure about an API, function, library, or implementation detail, or if the context does not contain sufficient information to answer accurately, explicitly state "I don't have enough context to answer this reliably" rather than guessing. Accuracy over completeness. Never hallucinate imports, library names, or function signatures.`.trim();

// ── Gemini Model ID Resolution ─────────────────────────────────────────────────
// Maps user-facing model IDs to canonical Gemini API model identifiers.
// This is the single source of truth — import from here instead of duplicating.
const GEMINI_MODEL_MAP: Record<string, string> = {
  'gemma-4-31b-it': 'gemma-4-31b-it',
  'gemma-4-27b-it': 'gemma-4-26b-a4b-it',
  'gemini-3.5-flash': 'gemini-3.5-flash',
  'gemini-3-flash': 'gemini-3-flash-preview',
  'gemini-3-flash-preview': 'gemini-3-flash-preview',
  'gemini-3.1-pro': 'gemini-3.1-pro-preview',
  'gemini-3.1-pro-preview': 'gemini-3.1-pro-preview',
  'gemini-3.1-flash-lite': 'gemini-3.1-flash-lite',
  'gemini-2.5-flash': 'gemini-2.5-flash',
  'gemini-2.5-pro': 'gemini-2.5-pro',
  'gemini-2.5-flash-lite': 'gemini-2.5-flash-lite',
  'gemini-flash-latest': 'gemini-flash-latest',
  'gemini-pro-latest': 'gemini-pro-latest',
};

/**
 * Resolves a user-facing Gemini model ID to the canonical API model ID.
 * Returns the input unchanged if no mapping is found.
 */
export function resolveRealGeminiModel(model: string): string {
  return GEMINI_MODEL_MAP[model] ?? model;
}
