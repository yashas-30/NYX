/**
 * chatPrompts.ts
 *
 * Master prompt builder for the unified Antigravity Agent.
 * Generates the unified Antigravity System Prompt for all model providers
 * (Gemini, Claude, GPT, Groq, Mistral, NVIDIA NIM, Ollama, Local Llama, etc.).
 */

import type { ChatMessage } from '@src/infrastructure/types';
import {
  ChatContext,
  ChatPromptBuildResult,
  estimatePromptTokens,
  ToolDefinition,
  UserPreferences,
} from './types';
import { detectPromptCategory, detectSafetyLevel } from './classifier';
import { buildAntigravityMasterPrompt } from './antigravityMasterPrompt';
import { buildPresentationPrompt } from './presentationPrompt';

// Re-export all types, builders, and utilities
export * from './types';
export * from './classifier';
export * from './antigravityMasterPrompt';
export * from './presentationPrompt';
export * from './websearchPrompt';
export * from './researchPrompt';
export * from './diagramPrompt';
export * from './codePrompt';
export * from './generalPrompt';

// -----------------------------------------------------------------------------
// Tool Schema & Preferences Serializer
// -----------------------------------------------------------------------------

function serializeAvailableTools(tools?: ToolDefinition[]): string {
  if (!tools || tools.length === 0) return '';
  const lines: string[] = ['<available_tools>'];
  lines.push('You have access to the following tools to accomplish the user request:');
  tools.forEach((t) => {
    lines.push(`- **${t.name}**: ${t.description}`);
    if (t.parameters?.properties && Object.keys(t.parameters.properties).length > 0) {
      lines.push(`  Parameters: ${JSON.stringify(t.parameters)}`);
    }
  });
  lines.push(
    'Call tools when additional live data, codebase inspection, or computation is required.'
  );
  lines.push('</available_tools>');
  return lines.join('\n');
}

function serializeUserPreferences(prefs?: UserPreferences): string {
  if (!prefs) return '';
  const items: string[] = [];
  if (prefs.preferredName) items.push(`- Preferred Name: ${prefs.preferredName}`);
  if (prefs.expertiseLevel) items.push(`- Expertise Level: ${prefs.expertiseLevel}`);
  if (prefs.detailPreference) items.push(`- Detail Preference: ${prefs.detailPreference}`);
  if (prefs.formatPreference) items.push(`- Format Preference: ${prefs.formatPreference}`);
  if (prefs.tonePreference) items.push(`- Tone Preference: ${prefs.tonePreference}`);
  if (items.length === 0) return '';
  return `<user_preferences>\n${items.join('\n')}\n</user_preferences>`;
}

// -----------------------------------------------------------------------------
// Master Prompt Builder
// -----------------------------------------------------------------------------

export function buildChatPrompts(
  modelId: string,
  context: ChatContext,
  rawPrompt: string,
  history: ChatMessage[],
  webSearchResults?: string,
  provider?: string,
  mediaContext?: string,
  memoryContext?: string
): ChatPromptBuildResult {
  const now = new Date();
  const contextBreakdown: Record<string, number> = {};
  const isoDateStr = now.toISOString().slice(0, 10);

  const category = detectPromptCategory(rawPrompt, context, webSearchResults, history);

  const hasPreviousCode = !!history?.some(
    (m) =>
      m.role === 'assistant' &&
      typeof m.content === 'string' &&
      /(?:^|\n)```[a-zA-Z0-9_-]*\r?\n[\s\S]*?(?:\n```|$)/.test(m.content)
  );

  const isFixOrModification =
    hasPreviousCode &&
    (/^(?:fix|change|update|edit|modify|add|remove|patch|repair|solve|improve|enhance|redo)\b/i.test(
      rawPrompt.trim()
    ) ||
      /\b(?:previous|existing)\s+(?:code|response|app|file|function)\b/i.test(rawPrompt) ||
      /\b(?:in|to)\s+(?:the|this|previous)\s+code\b/i.test(rawPrompt) ||
      /\b(?:error|bug|issue|broken|doesn't work|crash|failed)\b/i.test(rawPrompt));

  const codeModificationContext =
    isFixOrModification && category === 'code'
      ? `[Instruction: The user is requesting fixes or modifications to the code from the previous assistant response. Edit and update that existing codebase directly, preserving all existing features, UI elements, logic, and styling, and provide the complete updated code block.]`
      : undefined;

  // System prompt: presentation uses the specialized slide-count-aware builder;
  // all other categories use the unified intent-aware master prompt.
  let systemPrompt: string;
  if (context.customSystemPrompt?.trim()) {
    systemPrompt = `${context.customSystemPrompt.trim()}\n\nToday is ${isoDateStr}.`;
  } else if (category === 'presentation') {
    systemPrompt = buildPresentationPrompt(context, isoDateStr, rawPrompt, modelId, provider);
  } else {
    // Pass detected category so the prompt injects the correct focused mode directive
    systemPrompt = buildAntigravityMasterPrompt(context, isoDateStr, modelId, provider, category);
  }

  // Inject user preferences block if defined
  if (context.userPreferences) {
    const userPrefsBlock = serializeUserPreferences(context.userPreferences);
    if (userPrefsBlock) {
      systemPrompt = `${systemPrompt}\n\n${userPrefsBlock}`;
    }
  }

  // Inject available tools block if defined in context
  if (context.availableTools && context.availableTools.length > 0) {
    const toolsBlock = serializeAvailableTools(context.availableTools);
    systemPrompt = `${systemPrompt}\n\n${toolsBlock}`;
  }

  // Inject lightning directives if present
  if (context.lightningDirectives && context.lightningDirectives.length > 0) {
    const directivesBlock = `<lightning_directives>\n${context.lightningDirectives.join('\n')}\n</lightning_directives>`;
    systemPrompt = `${systemPrompt}\n\n${directivesBlock}`;
  }

  contextBreakdown.system = estimatePromptTokens(systemPrompt);

  const isLocal = !!context.localModel || provider === 'nyx-native';

  // Build dynamic user prompt with injected context
  const userPrompt = buildUserPrompt(
    rawPrompt,
    isoDateStr,
    webSearchResults,
    mediaContext,
    memoryContext,
    isLocal,
    codeModificationContext
  );
  contextBreakdown.user = estimatePromptTokens(userPrompt);

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      version: '8.0.0',
      category,
      estimatedTokens: Object.values(contextBreakdown).reduce((a, b) => a + b, 0),
      contextBreakdown,
      safetyLevel: detectSafetyLevel(rawPrompt),
      timestamp: now.toISOString(),
    },
  };
}

// -----------------------------------------------------------------------------
// User Prompt Assembly
// -----------------------------------------------------------------------------

function buildUserPrompt(
  rawPrompt: string,
  _isoDateStr: string,
  webSearchResults?: string,
  mediaContext?: string,
  memoryContext?: string,
  _isLocalModel?: boolean,
  codeModificationContext?: string
): string {
  const trimmed = (rawPrompt || '').trim();

  if (!webSearchResults && !mediaContext && !memoryContext && !codeModificationContext) {
    return trimmed;
  }

  const blocks: string[] = [];

  if (codeModificationContext?.trim()) {
    blocks.push(codeModificationContext.trim());
  }

  if (memoryContext?.trim()) {
    blocks.push(`[Relevant Memory Context]\n${memoryContext.trim()}`);
  }

  if (webSearchResults?.trim()) {
    blocks.push(`[Web Search Results]\n${webSearchResults.trim()}`);
  }

  if (mediaContext?.trim()) {
    blocks.push(mediaContext.trim());
  }

  blocks.push(trimmed);

  return blocks.join('\n\n');
}
