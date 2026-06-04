/**
 * @file src/core/services/promptAnalyzer.ts
 * @description Smart prompt classification and routing helper.
 */

import { AIService, countTokens } from '@src/core/services/ai.service';
import { PromptAnalysis } from '@src/infrastructure/types';
import { analyzePrompt as localRegexAnalyze } from '@nyx/shared';

const PROMPT_ANALYZER_SYSTEM_PROMPT = `You are the NYX Prompt Analyzer. Analyze the user's prompt and output a valid JSON object matching this schema:
{
  "intent": "code_generation" | "debugging" | "refactoring" | "explanation" | "architecture" | "testing" | "deployment" | "general_chat",
  "complexity": "trivial" | "simple" | "moderate" | "complex" | "enterprise",
  "scope": "single_file" | "multi_file" | "project_wide" | "external_knowledge",
  "requiresExecution": boolean,
  "requiresWebSearch": boolean,
  "requiresCodebaseContext": boolean,
  "estimatedTokenCount": number,
  "suggestedTools": ("read_file" | "edit_file" | "write_file" | "search_codebase" | "run_terminal" | "web_search" | "list_directory" | "git_diff" | "git_status")[],
  "confidence": number
}
Rules:
- For greetings, general conversation, off-topic prompts, or simple questions: intent="general_chat", complexity="trivial", scope="single_file", requiresExecution/WebSearch/CodebaseContext=false, suggestedTools=[], confidence=1.0.
- For bugs, exceptions, stack traces: intent="debugging".
- If it requires running build/run/test commands, requiresExecution must be true.
- If it mentions project-wide files or large updates, scope must be "project_wide" and requiresCodebaseContext must be true.
- Output ONLY valid raw JSON. No markdown code block wrapper (like \`\`\`json).`;

export class PromptAnalyzerService {
  static async analyze(
    prompt: string,
    modelId: string,
    provider: string,
    apiKey: string,
    apiKeys: Record<string, string>
  ): Promise<PromptAnalysis> {
    // 1. Run quick regex heuristic check first (instant and 100% robust)
    const regexResult = localRegexAnalyze(prompt);

    // 2. Try smart LLM prompt analysis using the selected model
    try {
      console.log(
        `[PromptAnalyzerService] Attempting LLM prompt analysis with model: ${modelId} (${provider})`
      );

      const response = await AIService.execute(
        modelId,
        provider,
        prompt,
        apiKey,
        PROMPT_ANALYZER_SYSTEM_PROMPT,
        { temperature: 0.1, maxTokens: 400 }
      );

      if (response && response.text) {
        const parsed = this.parseJsonResult(response.text);
        if (parsed) {
          console.log('[PromptAnalyzerService] LLM prompt analysis succeeded:', parsed);
          return {
            intent: parsed.intent || 'general_chat',
            complexity: parsed.complexity || 'simple',
            scope: parsed.scope || 'single_file',
            requiresExecution: !!parsed.requiresExecution,
            requiresWebSearch: !!parsed.requiresWebSearch,
            requiresCodebaseContext: !!parsed.requiresCodebaseContext,
            estimatedTokenCount:
              typeof parsed.estimatedTokenCount === 'number'
                ? parsed.estimatedTokenCount
                : Math.ceil(prompt.length / 4),
            suggestedTools: Array.isArray(parsed.suggestedTools) ? parsed.suggestedTools : [],
            confidence: typeof parsed.confidence === 'number' ? parsed.confidence : 0.9,
          };
        }
      }
    } catch (err: any) {
      console.warn(
        '[PromptAnalyzerService] LLM prompt analysis failed, falling back to heuristic:',
        err
      );
    }

    console.log('[PromptAnalyzerService] Running instant isomorphic heuristic prompt analysis.');
    return this.getHeuristicAnalysis(prompt, regexResult);
  }

  private static getHeuristicAnalysis(prompt: string, regexResult: any): PromptAnalysis {
    const suggestedTools: string[] = [];
    if (regexResult.intent === 'debug') suggestedTools.push('git_diff', 'read_file');
    if (regexResult.intent === 'generate') suggestedTools.push('write_file', 'edit_file');

    // Map intent to PromptAnalysis['intent'] perfectly
    let mappedIntent: PromptAnalysis['intent'] = 'general_chat';
    const regexIntent = regexResult.intent;
    if (regexIntent === 'generate' || regexIntent === 'integrate') {
      mappedIntent = 'code_generation';
    } else if (regexIntent === 'debug') {
      mappedIntent = 'debugging';
    } else if (
      regexIntent === 'refactor' ||
      regexIntent === 'optimize' ||
      regexIntent === 'convert'
    ) {
      mappedIntent = 'refactoring';
    } else if (regexIntent === 'explain' || regexIntent === 'review') {
      mappedIntent = 'explanation';
    } else if (regexIntent === 'test') {
      mappedIntent = 'testing';
    } else if (regexIntent === 'deploy') {
      mappedIntent = 'deployment';
    }

    return {
      intent: mappedIntent,
      complexity: regexResult.complexity as PromptAnalysis['complexity'],
      scope:
        regexResult.complexity === 'complex' || regexResult.complexity === 'enterprise'
          ? 'project_wide'
          : 'single_file',
      requiresExecution:
        prompt.toLowerCase().includes('run') ||
        prompt.toLowerCase().includes('exec') ||
        prompt.toLowerCase().includes('install') ||
        prompt.toLowerCase().includes('npm') ||
        prompt.toLowerCase().includes('python'),
      requiresWebSearch:
        prompt.toLowerCase().includes('search the web') ||
        prompt.toLowerCase().includes('lookup') ||
        prompt.toLowerCase().includes('google') ||
        prompt.toLowerCase().includes('search web'),
      requiresCodebaseContext:
        prompt.toLowerCase().includes('codebase') ||
        prompt.toLowerCase().includes('project') ||
        prompt.toLowerCase().includes('repo') ||
        prompt.toLowerCase().includes('files'),
      estimatedTokenCount: countTokens(prompt),
      suggestedTools,
      confidence: 1.0,
    };
  }

  private static parseJsonResult(text: string): PromptAnalysis | null {
    try {
      const cleanText = text
        .replace(/^```json\s*/i, '')
        .replace(/```\s*$/, '')
        .trim();
      const parsed = JSON.parse(cleanText);
      if (parsed && typeof parsed.intent === 'string' && typeof parsed.complexity === 'string') {
        return parsed as PromptAnalysis;
      }
    } catch {}
    return null;
  }
}
