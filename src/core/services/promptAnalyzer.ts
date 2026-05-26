/**
 * @file src/core/services/promptAnalyzer.ts
 * @description Smart prompt classification and routing helper.
 */

import { AIService } from './ai.service';
import { PromptAnalysis } from '../types';
import { analyzePrompt as localRegexAnalyze } from '@/shared/promptAnalyzer';

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
    // 1. Run quick regex heuristic check first
    const regexResult = localRegexAnalyze(prompt);
    
    // Check if it's a simple greeting or general chat
    const isTrivialChat = !regexResult.isCodeRelated || 
                          /^(hi|hello|hey|yo|greetings|thanks|thank you|ok|okay|bye|goodbye)\b/i.test(prompt.trim());
    
    if (isTrivialChat) {
      return {
        intent: 'general_chat',
        complexity: 'trivial',
        scope: 'single_file',
        requiresExecution: false,
        requiresWebSearch: false,
        requiresCodebaseContext: false,
        estimatedTokenCount: Math.ceil(prompt.length / 4),
        suggestedTools: [],
        confidence: 1.0
      };
    }

    // 2. Perform intelligent LLM analysis
    try {
      console.log(`[PromptAnalyzerService] Analyzing prompt: "${prompt.slice(0, 60)}..." using ${modelId} (${provider})`);
      const response = await AIService.execute(
        modelId,
        provider,
        `Analyze this prompt: "${prompt}"`,
        apiKey,
        PROMPT_ANALYZER_SYSTEM_PROMPT,
        { temperature: 0.1, maxTokens: 1024 }
      );

      const parsed = this.parseJsonResult(response.text);
      if (parsed) return parsed;
    } catch (err) {
      console.warn('[PromptAnalyzerService] Main analysis model failed, attempting free fallback:', err);
    }

    // Fallback: Try a free public fallback model (Zen/OpenCode free model)
    try {
      const activeKey = apiKeys['opencode'] || '';
      const response = await AIService.execute(
        'opencode/qwen3-coder-14b-free',
        'opencode',
        `Analyze this prompt: "${prompt}"`,
        activeKey,
        PROMPT_ANALYZER_SYSTEM_PROMPT,
        { temperature: 0.1, maxTokens: 1024 }
      );
      
      const parsed = this.parseJsonResult(response.text);
      if (parsed) return parsed;
    } catch (fallbackErr) {
      console.error('[PromptAnalyzerService] Fallback analysis model also failed:', fallbackErr);
    }

    // Heuristic Fallback
    console.log('[PromptAnalyzerService] Falling back to heuristic classification.');
    const suggestedTools: string[] = [];
    if (regexResult.intent === 'debug') suggestedTools.push('git_diff', 'read_file');
    if (regexResult.intent === 'generate') suggestedTools.push('write_file', 'edit_file');
    
    return {
      intent: (regexResult.intent === 'general' ? 'general_chat' : regexResult.intent) as PromptAnalysis['intent'],
      complexity: regexResult.complexity as PromptAnalysis['complexity'],
      scope: regexResult.complexity === 'complex' || regexResult.complexity === 'enterprise' ? 'project_wide' : 'single_file',
      requiresExecution: prompt.toLowerCase().includes('run') || prompt.toLowerCase().includes('exec') || prompt.toLowerCase().includes('install'),
      requiresWebSearch: prompt.toLowerCase().includes('search the web') || prompt.toLowerCase().includes('lookup'),
      requiresCodebaseContext: prompt.toLowerCase().includes('codebase') || prompt.toLowerCase().includes('project'),
      estimatedTokenCount: Math.ceil(prompt.length / 4),
      suggestedTools,
      confidence: 0.7
    };
  }

  private static parseJsonResult(text: string): PromptAnalysis | null {
    try {
      const cleanText = text.replace(/^```json\s*/i, '').replace(/```\s*$/, '').trim();
      const parsed = JSON.parse(cleanText);
      if (parsed && typeof parsed.intent === 'string' && typeof parsed.complexity === 'string') {
        return parsed as PromptAnalysis;
      }
    } catch {}
    return null;
  }
}
