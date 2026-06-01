// Re-export prompt analyzer functions from coder services
export { PromptAnalyzerService } from '@src/features/coder/services/promptAnalyzer';

// Helper function for quick regex analysis
export function analyzePrompt(prompt: string): any {
  // Simple heuristic analysis
  const lower = prompt.toLowerCase();

  let intent = 'general_chat';
  if (
    lower.includes('debug') ||
    lower.includes('fix') ||
    lower.includes('error') ||
    lower.includes('bug')
  ) {
    intent = 'debug';
  } else if (
    lower.includes('create') ||
    lower.includes('build') ||
    lower.includes('generate') ||
    lower.includes('make')
  ) {
    intent = 'generate';
  } else if (
    lower.includes('refactor') ||
    lower.includes('improve') ||
    lower.includes('optimize')
  ) {
    intent = 'refactor';
  } else if (lower.includes('explain') || lower.includes('what') || lower.includes('how')) {
    intent = 'explain';
  }

  let complexity = 'simple';
  if (lower.includes('enterprise') || lower.includes('complex') || lower.includes('advanced')) {
    complexity = 'complex';
  } else if (lower.includes('basic') || lower.includes('simple') || lower.includes('easy')) {
    complexity = 'trivial';
  }

  return {
    intent,
    complexity,
    scope: 'single_file',
    requiresExecution: false,
    requiresWebSearch: false,
    requiresCodebaseContext: false,
    estimatedTokenCount: Math.ceil(prompt.length / 4),
    suggestedTools: [],
    confidence: 0.8,
  };
}

export function routeToAgent(analysis: any): { agent: string; reasoning: string } {
  // Simple routing logic
  const intent = analysis.intent;

  if (intent === 'debug' || intent === 'debugging') {
    return { agent: 'debugger', reasoning: 'Debugging task detected' };
  } else if (intent === 'generate' || intent === 'code_generation') {
    return { agent: 'generator', reasoning: 'Code generation task detected' };
  } else if (intent === 'refactor') {
    return { agent: 'refactorer', reasoning: 'Refactoring task detected' };
  } else if (intent === 'explain' || intent === 'explanation') {
    return { agent: 'explainer', reasoning: 'Explanation task detected' };
  }

  return { agent: 'general', reasoning: 'General chat task' };
}

export function isMissingDebugDetails(prompt: string, mode: string): boolean {
  // Check if debug prompt has enough details
  if (mode !== 'debug') return false;

  const lower = prompt.toLowerCase();
  const hasErrorLog = lower.includes('error') || lower.includes('stack') || lower.includes('trace');
  const hasCode = lower.includes('```') || lower.includes('code');
  const hasDescription = prompt.length > 50;

  return !(hasErrorLog || hasCode || hasDescription);
}

export const MISSING_DEBUG_DETAILS_RESPONSE = `I need more information to help you debug. Please provide:
- The error message or stack trace
- The relevant code snippet
- A description of what you expected vs what happened

This will help me diagnose the issue more effectively.`;
