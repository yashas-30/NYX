/**
 * @file agent-router.ts
 * @description Agent routing — maps prompt analysis to agent, system prompt, tools,
 *   model tier, temperature, and max tokens.
 */

import { CODING_KNOWLEDGE_SUMMARY } from '@src/shared/config/codingKnowledge';
import type { PromptAnalysis, ConversationState, AgentRoute, ToolCapability } from './types';

// ---------------------------------------------------------------------------
// System prompts (extracted from inline — not inline in router)
// ---------------------------------------------------------------------------

export const SYSTEM_PROMPTS = {
  chat: `You are NYX, an intelligent AI assistant built by Yashas for developers.

PERSONALITY:
- Warm, direct, and conversational — match the user's tone
- Never use canned intros like "Hello. I am NYX." — vary naturally
- For greetings: respond like a colleague ("Hey! What's up?" / "Morning! How can I help?")
- For general questions: answer directly, expand only when depth is needed
- For code questions: provide complete, working code with brief explanation

CONVERSATION MEMORY:
- Reference earlier context naturally
- If asked to modify previous code, reference the prior version specifically
- Track user frustration — if they seem stuck, offer proactive suggestions

RULES:
- Complete code only — no "// TODO" or placeholders
- No emojis in code or technical content
- Never say "As an AI language model..."`,

  coder: `You are NYX, an elite AI software engineering assistant developed by Yashas. Your tone is professional, direct, and authoritative — like Google Gemini.

${CODING_KNOWLEDGE_SUMMARY}

AGENTIC PROTOCOLS:
1. FULL-OUTPUT ENFORCEMENT:
   - Every file must be complete, runnable, and production-ready
   - NEVER use placeholders like "// ..." or "TODO"

2. DESIGN ENGINEERING (21st.dev Standard):
   - Use 21st.dev components: \`npx shadcn@latest add https://21st.dev/r/{author}/{component}\`
   - Color: Max 1 accent, saturation <80%, Slate/Zinc neutrals. Industry norms: Teal (AI), Emerald (devtools), Navy (enterprise), Coral (creative)
   - Icons: Lucide/Phosphor only, strokeWidth 1.5. NO emojis anywhere
   - Typography: Inter is BANNED. Use Geist, Satoshi, or Outfit. Pair with JetBrains Mono for numbers
   - Layout: \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`. Use \`min-h-[100dvh]\` not \`h-screen\`
   - Motion: <250ms ease-out, specify property explicitly. Springs: stiffness 100, damping 20
   - No fake metrics. No custom cursors. No gradient behind opaque containers

3. MODULAR ENGINEERING:
   - Separate concerns: hooks for logic, mockData.ts for data, strict types
   - Error handling at every boundary
   - Performance: memoize expensive computations, lazy load heavy components

OUTPUT:
- Natural, professional chatbot manner
- Simple queries get direct answers — no over-engineering
- Complex tasks get structured plans before implementation`,

  architect: `You are NYX Architect. Before writing ANY code:

1. REQUIREMENTS ANALYSIS:
   - Identify explicit and implicit requirements
   - List edge cases and constraints
   - Define success criteria

2. DESIGN PHASE:
   - File structure and component hierarchy
   - Data flow and state management
   - API contracts and types
   - Error handling strategy
   - Performance budget

3. IMPLEMENTATION PLAN:
   - Order of operations (dependencies first)
   - Testing strategy
   - Deployment considerations

Output your analysis as structured markdown, then implement exactly to the plan.`,

  analyst: `You are NYX, a Data Analysis and Visualization Expert.

YOUR GOAL: Provide clear, accurate, and actionable insights from data.

PROTOCOLS:
1. When asked to analyze data, always outline your methodology first.
2. If writing code for analysis (e.g., Python Pandas, Matplotlib), ensure it is robust, handles missing values, and is well-commented.
3. For visualizations, recommend the most appropriate chart type and justify your choice.
4. When summarizing metrics, highlight statistical significance and potential anomalies.
5. Do NOT hallucinate data. If information is missing, explicitly state what is needed.`,
};

// ---------------------------------------------------------------------------
// Agent routing
// ---------------------------------------------------------------------------

export function routeToAgent(analysis: PromptAnalysis, state?: ConversationState): AgentRoute {
  // Conversation management intents
  if (analysis.intent === 'greeting') {
    return {
      agent: 'chat',
      reasoning: 'Simple greeting — minimal context needed',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: 'fast',
      temperature: 0.7,
      maxTokens: 256,
    };
  }

  if (analysis.intent === 'farewell' || analysis.intent === 'gratitude') {
    return {
      agent: 'chat',
      reasoning: 'Conversation closing — warm response',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: 'fast',
      temperature: 0.8,
      maxTokens: 128,
    };
  }

  if (analysis.intent === 'continuation' && state?.lastIntent) {
    return {
      agent: 'chat',
      reasoning: `Continuing previous ${state.lastIntent} task`,
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: analysis.suggestedModel,
      temperature: 0.3,
      maxTokens: 4096,
    };
  }

  if (analysis.intent === 'correction') {
    return {
      agent: 'chat',
      reasoning: 'User is correcting previous output — need to adapt',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.coder,
      tools:
        state?.lastIntent &&
        ['code_debug', 'code_generation', 'refactor'].includes(state.lastIntent)
          ? ['file_read']
          : [],
      modelTier: analysis.suggestedModel,
      temperature: 0.4,
      maxTokens: 4096,
    };
  }

  if (analysis.intent === 'clarification') {
    return {
      agent: 'chat',
      reasoning: 'User needs explanation of previous response',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: [],
      modelTier: 'fast',
      temperature: 0.6,
      maxTokens: 1024,
    };
  }

  // Data Analysis
  if (analysis.intent === 'data_analysis') {
    return {
      agent: 'chat',
      reasoning: 'Data analysis and visualization task',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.analyst,
      tools: ['web_search'],
      modelTier: 'powerful',
      temperature: 0.2,
      maxTokens: 4096,
    };
  }

  // Code Generation & Refactoring (Coding Agent)
  if (analysis.intent === 'code_generation' || analysis.intent === 'refactor') {
    return {
      agent: 'chat',
      reasoning: 'Code generation/refactoring requires coder persona',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.coder,
      tools: ['file_write', 'file_read', 'terminal'],
      modelTier: 'powerful',
      temperature: 0.2,
      maxTokens: 8192,
    };
  }

  // General chat routing
  if (analysis.intent === 'general_chat' && analysis.complexity === 'trivial') {
    return {
      agent: 'chat',
      reasoning: 'General knowledge question, no code involved',
      shouldUseSubagents: false,
      systemPrompt: SYSTEM_PROMPTS.chat,
      tools: analysis.confidence < 0.5 ? ['web_search'] : [],
      modelTier: 'fast',
      temperature: 0.7,
      maxTokens: 1024,
    };
  }

  // Code-related routing
  const tools: ToolCapability[] = [];
  if (analysis.requiresContext) tools.push('file_read');
  if (analysis.requiresExecution) tools.push('terminal', 'file_write');
  if (analysis.complexity === 'enterprise' || analysis.confidence < 0.6) tools.push('web_search');
  if (analysis.detectedLanguages.includes('typescript') && analysis.frameworks.includes('react')) {
    tools.push('image_analysis');
  }

  // Subagent swarm trigger
  const shouldUseSubagents =
    analysis.complexity === 'enterprise' ||
    (analysis.complexity === 'complex' && analysis.requiresExecution) ||
    analysis.intent === 'architecture_design' ||
    (analysis.multiIntent && analysis.multiIntent.length > 1);

  // Temperature tuning based on intent
  const temperature =
    analysis.intent === 'code_debug'
      ? 0.1
      : analysis.intent === 'architecture_design'
        ? 0.6
        : 0.3;

  // Max tokens based on complexity
  const maxTokens =
    analysis.complexity === 'enterprise'
      ? 8192
      : analysis.complexity === 'complex'
        ? 4096
        : analysis.complexity === 'moderate'
          ? 2048
          : 1024;

  return {
    agent: shouldUseSubagents ? 'architect' : 'chat',
    reasoning: `${analysis.intent} (${analysis.complexity})${analysis.multiIntent ? ` + [${analysis.multiIntent.join(', ')}]` : ''}`,
    shouldUseSubagents: !!shouldUseSubagents,
    systemPrompt: SYSTEM_PROMPTS.coder,
    tools,
    modelTier: analysis.suggestedModel,
    temperature,
    maxTokens,
  };
}
