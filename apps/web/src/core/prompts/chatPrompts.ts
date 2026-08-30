/**
 * chatPrompts.ts
 *
 * Master prompt orchestrator and dynamic category router.
 * Dispatches to specialized prompt builders for:
 * - Slidev Presentations (presentationPrompt.ts)
 * - Grounded Web Search (websearchPrompt.ts)
 * - Deep Technical Research (researchPrompt.ts)
 * - Mermaid Architecture Diagrams (diagramPrompt.ts)
 * - Code Engineering & Refactoring (codePrompt.ts)
 * - General Claude 3H Intelligence (generalPrompt.ts)
 */

import type { ChatMessage } from '@src/infrastructure/types';
import {
  ChatContext,
  ChatPromptBuildResult,
  PromptCategory,
  estimatePromptTokens,
  ToolDefinition,
  UserPreferences,
  SafetyLevel,
} from './types';
import { detectPromptCategory, detectSafetyLevel } from './classifier';
import { buildPresentationPrompt } from './presentationPrompt';
import { buildWebSearchPrompt } from './websearchPrompt';
import { buildResearchPrompt } from './researchPrompt';
import { buildDiagramPrompt } from './diagramPrompt';
import { buildCodePrompt } from './codePrompt';
import { buildGeneralPrompt } from './generalPrompt';

// Re-export all types, classifiers, and builders for backwards compatibility
export * from './types';
export * from './classifier';
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
  _history: ChatMessage[],
  webSearchResults?: string,
  provider?: string,
  mediaContext?: string,
  memoryContext?: string
): ChatPromptBuildResult {
  const now = new Date();
  const contextBreakdown: Record<string, number> = {};
  const isoDateStr = now.toISOString().slice(0, 10);

  // Detect category
  const category = detectPromptCategory(rawPrompt, context, webSearchResults);

  // Dispatch to the specialized system prompt builder
  let systemPrompt: string;
  if (context.customSystemPrompt?.trim()) {
    systemPrompt = `${context.customSystemPrompt.trim()}\n\nToday is ${isoDateStr}.`;
  } else {
    switch (category) {
      case 'presentation':
        systemPrompt = buildPresentationPrompt(context, isoDateStr, rawPrompt, modelId, provider);
        break;
      case 'websearch':
        systemPrompt = buildWebSearchPrompt(context, isoDateStr, rawPrompt, modelId, provider);
        break;
      case 'research':
        systemPrompt = buildResearchPrompt(context, isoDateStr, rawPrompt, modelId, provider);
        break;
      case 'diagram':
        systemPrompt = buildDiagramPrompt(context, isoDateStr, rawPrompt, modelId, provider);
        break;
      case 'code':
        systemPrompt = buildCodePrompt(context, isoDateStr, rawPrompt, modelId, provider);
        break;
      case 'general':
      default:
        systemPrompt = buildGeneralPrompt(context, isoDateStr, rawPrompt, modelId, provider);
        break;
    }
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
    isLocal
  );
  contextBreakdown.user = estimatePromptTokens(userPrompt);

  return {
    systemPrompt,
    userPrompt,
    metadata: {
      version: '7.2.0',
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
  _isLocalModel?: boolean
): string {
  const trimmed = (rawPrompt || '').trim();

  if (!webSearchResults && !mediaContext && !memoryContext) {
    return trimmed;
  }

  const blocks: string[] = [];

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
