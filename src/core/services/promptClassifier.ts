import { detectHardware, HardwareAnalysis } from '@/shared/promptAnalyzer';
import { CODING_KNOWLEDGE_SUMMARY } from '@src/features/coder/config/codingKnowledge';

export type PromptIntent =
  | 'greeting'
  | 'general_chat'
  | 'code_generation'
  | 'code_debug'
  | 'code_review'
  | 'architecture_design'
  | 'refactor'
  | 'explain_code'
  | 'terminal_command'
  | 'file_operation'
  | 'web_search'
  | 'codebase_query';

export interface PromptAnalysis {
  intent: PromptIntent;
  confidence: number; // 0-1
  detectedLanguages: string[]; // typescript, python, rust, etc.
  frameworks: string[]; // react, express, nextjs, etc.
  complexity: 'trivial' | 'simple' | 'moderate' | 'complex' | 'enterprise';
  requiresContext: boolean; // needs codebase/files
  requiresExecution: boolean; // needs terminal/file write
  estimatedTokens: number; // rough context size needed
  suggestedModel: 'fast' | 'balanced' | 'powerful'; // model tier hint
  hardware?: HardwareAnalysis;
}

const INTENT_PATTERNS: Record<PromptIntent, RegExp[]> = {
  greeting: [
    /^(hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|howdy|yo|sup)\b/i,
    /^(thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye)\b/i,
  ],
  general_chat: [
    /\b(who\s+are\s+you|what\s+can\s+you\s+do|tell\s+me\s+about|how\s+are\s+you|what's\s+new)\b/i,
    /\b(explain\s+(?:concept|idea|theory)|what\s+is\s+\w+|how\s+does\s+\w+\s+work)\b/i,
  ],
  code_generation: [
    /\b(write|create|build|generate|implement)\b.*\b(function|class|component|hook|api|endpoint|script|app|page)\b/i,
    /\b(create|build)\s+(?:a|an)\s+(?:react|vue|angular|svelte)\b/i,
    /```\w*/,
  ],
  code_debug: [
    /\b(debug|fix|solve|resolve|error|bug|exception|crash|fails?|broken|not\s+working)\b/i,
    /\b(why\s+(?:is|does)|what's\s+wrong|help\s+me\s+fix)\b/i,
  ],
  code_review: [
    /\b(review|audit|check|analyze|evaluate|assess)\b.*\b(code|function|file|implementation|pr|pull\s+request)\b/i,
  ],
  architecture_design: [
    /\b(design|architect|structure|organize|plan)\b.*\b(system|app|service|microservice|database|schema|api)\b/i,
    /\b(system\s+design|architecture\s+pattern|design\s+pattern)\b/i,
  ],
  refactor: [/\b(refactor|rewrite|restructure|optimize|clean\s+up|simplify|modernize)\b/i],
  explain_code: [
    /\b(explain|describe|walk\s+me\s+through|what\s+does\s+this\s+code\s+do)\b/i,
    /\b(how\s+(?:is|does)\s+this\s+(?:work|function|operate))\b/i,
  ],
  terminal_command: [
    /\b(run|execute|start|build|test|deploy|install|npm|yarn|pnpm|cargo|pip|docker)\b/i,
    /\b(terminal|command\s+line|shell|bash|powershell)\b/i,
  ],
  file_operation: [
    /\b(read|write|create|delete|modify|update|append)\b.*\b(file|files?)\b/i,
    /\b(save|export|import)\b.*\b(to|from)\b/i,
  ],
  web_search: [/\b(search|find|look\s+up|google|what's\s+the\s+latest|current|news\s+about)\b/i],
  codebase_query: [
    /\b(project|codebase|repository|repo|workspace|directory|folder)\b/i,
    /\b(where\s+is|find\s+(?:the|a)|locate|show\s+me)\b.*\b(file|function|class|component)\b/i,
  ],
};

const LANGUAGE_PATTERNS = [
  { lang: 'typescript', pattern: /\b(ts|typescript|\.ts|\.tsx|type\s+interface)\b/i },
  { lang: 'javascript', pattern: /\b(js|javascript|\.js|\.jsx|es6|es202\d)\b/i },
  { lang: 'python', pattern: /\b(py|python|\.py|pip|django|flask|fastapi)\b/i },
  { lang: 'rust', pattern: /\b(rust|cargo|\.rs|crates)\b/i },
  { lang: 'go', pattern: /\b(golang|go\s+lang|\.go|gin|echo)\b/i },
  { lang: 'java', pattern: /\b(java|spring|\.java|maven|gradle)\b/i },
  { lang: 'cpp', pattern: /\b(c\+\+|cpp|\.cpp|\.hpp|cmake)\b/i },
  { lang: 'c', pattern: /\b(\.c|\.h|gcc|clang)(?!\+\+)\b/i },
  { lang: 'csharp', pattern: /\b(c#|csharp|\.cs|dotnet|\.net)\b/i },
  { lang: 'ruby', pattern: /\b(ruby|rails|\.rb|gemfile)\b/i },
  { lang: 'php', pattern: /\b(php|laravel|\.php|composer)\b/i },
  { lang: 'swift', pattern: /\b(swift|\.swift|ios|uikit|swiftui)\b/i },
  { lang: 'kotlin', pattern: /\b(kotlin|\.kt|android|jetpack)\b/i },
  { lang: 'sql', pattern: /\b(sql|postgres|mysql|sqlite|query|database\s+schema)\b/i },
  { lang: 'bash', pattern: /\b(bash|shell|sh|zsh|\.sh|cron)\b/i },
  { lang: 'docker', pattern: /\b(docker|dockerfile|container|kubernetes|k8s|helm)\b/i },
];

const FRAMEWORK_PATTERNS = [
  { fw: 'react', pattern: /\b(react|jsx|tsx|usestate|useeffect|next\.js|nextjs)\b/i },
  { fw: 'vue', pattern: /\b(vue|nuxt|\.vue|v-model|composition\s+api)\b/i },
  { fw: 'angular', pattern: /\b(angular|rxjs|@angular|ng-)\b/i },
  { fw: 'svelte', pattern: /\b(svelte|sveltekit|\.svelte)\b/i },
  { fw: 'express', pattern: /\b(express|middleware|req\.|res\.|router)\b/i },
  {
    fw: 'nextjs',
    pattern: /\b(next\.js|nextjs|app\s+router|pages\s+router|getserversideprops)\b/i,
  },
  { fw: 'tailwind', pattern: /\b(tailwind|tailwindcss|tw-|className=)\b/i },
  { fw: 'prisma', pattern: /\b(prisma|schema\.prisma|@prisma)\b/i },
  { fw: 'drizzle', pattern: /\b(drizzle|drizzle-orm|db\.select)\b/i },
];

// Priority rank helper to prevent downgrading classification (WRONG-7)
const INTENT_PRIORITY: Record<PromptIntent, number> = {
  code_generation: 10,
  code_debug: 9,
  refactor: 8,
  code_review: 7,
  architecture_design: 6,
  explain_code: 5,
  terminal_command: 4,
  file_operation: 3,
  codebase_query: 3,
  web_search: 2,
  general_chat: 1,
  greeting: 0,
};

export function analyzePrompt(prompt: string): PromptAnalysis {
  const lower = prompt.toLowerCase();
  const words = lower.split(/\s+/).length;

  // --- Intent Detection ---
  let bestIntent: PromptIntent = 'general_chat';
  let bestScore = 0;

  for (const [intent, patterns] of Object.entries(INTENT_PATTERNS)) {
    const score = patterns.reduce((sum, regex) => sum + (regex.test(prompt) ? 1 : 0), 0);
    if (score > bestScore) {
      bestScore = score;
      bestIntent = intent as PromptIntent;
    } else if (score === bestScore && score > 0) {
      const currentPri = INTENT_PRIORITY[bestIntent] || 0;
      const newPri = INTENT_PRIORITY[intent as PromptIntent] || 0;
      if (newPri > currentPri) {
        bestIntent = intent as PromptIntent;
      }
    }
  }

  // Override: code blocks always = code_generation (if current priority is lower)
  if (/```\w*/.test(prompt)) {
    if (INTENT_PRIORITY['code_generation'] > (INTENT_PRIORITY[bestIntent] || 0)) {
      bestIntent = 'code_generation';
      bestScore = Math.max(bestScore, 2);
    }
  }

  // Override: file paths in prompt = codebase_query (if current priority is lower)
  if (
    /\b\w+\.(ts|tsx|js|jsx|py|rs|go|java|cpp|c|cs|rb|php|swift|kt|sql|json|md|yml|yaml)\b/.test(
      prompt
    )
  ) {
    if (INTENT_PRIORITY['codebase_query'] > (INTENT_PRIORITY[bestIntent] || 0)) {
      bestIntent = 'codebase_query';
    }
  }

  const confidence = Math.min(1, bestScore * 0.3 + 0.2);

  // --- Language Detection ---
  const detectedLanguages = LANGUAGE_PATTERNS.filter(({ pattern }) => pattern.test(prompt)).map(
    ({ lang }) => lang
  );

  // --- Framework Detection ---
  const frameworks = FRAMEWORK_PATTERNS.filter(({ pattern }) => pattern.test(prompt)).map(
    ({ fw }) => fw
  );

  // --- Complexity Scoring ---
  let complexity: PromptAnalysis['complexity'] = 'simple';
  const codeLines = (prompt.match(/\n/g) || []).length;
  const hasMultipleFiles =
    prompt.includes('=== FILE:') || (prompt.includes('```') && prompt.split('```').length > 3);

  if (words > 200 || codeLines > 50 || hasMultipleFiles) complexity = 'enterprise';
  else if (words > 100 || codeLines > 20) complexity = 'complex';
  else if (words > 50 || codeLines > 10) complexity = 'moderate';
  else if (words < 10) complexity = 'trivial';

  // --- Context & Execution Needs ---
  const requiresContext = [
    'code_debug',
    'code_review',
    'explain_code',
    'refactor',
    'architecture_design',
    'codebase_query',
    'file_operation',
  ].includes(bestIntent);

  const requiresExecution =
    ['terminal_command', 'file_operation', 'code_generation'].includes(bestIntent) &&
    complexity !== 'trivial';

  // --- Model Tier Suggestion ---
  let suggestedModel: PromptAnalysis['suggestedModel'] = 'fast';
  if (complexity === 'enterprise' || bestIntent === 'architecture_design')
    suggestedModel = 'powerful';
  else if (complexity === 'complex' || requiresContext) suggestedModel = 'balanced';

  // --- Hardware Critique Audit Integration ---
  const hardware = detectHardware(prompt);

  return {
    intent: bestIntent,
    confidence,
    detectedLanguages,
    frameworks,
    complexity,
    requiresContext,
    requiresExecution,
    estimatedTokens: words * 1.5 + codeLines * 10,
    suggestedModel,
    hardware,
  };
}

// --- Agent Routing Decision ---

export interface AgentRoute {
  agent: 'chat' | 'coder';
  reasoning: string;
  shouldUseSubagents: boolean;
  systemPrompt: string;
  tools: ('web_search' | 'codebase_search' | 'terminal' | 'file_write' | 'file_read')[];
}

export function routeToAgent(analysis: PromptAnalysis): AgentRoute {
  // Chat agent handles: greetings, general chat, simple explanations
  if (analysis.intent === 'greeting') {
    return {
      agent: 'chat',
      reasoning: 'Simple greeting — no code context needed',
      shouldUseSubagents: false,
      systemPrompt: NYX_CHAT_SYSTEM_PROMPT,
      tools: [],
    };
  }

  if (analysis.intent === 'general_chat' && analysis.complexity === 'trivial') {
    return {
      agent: 'chat',
      reasoning: 'General knowledge question, no code involved',
      shouldUseSubagents: false,
      systemPrompt: NYX_CHAT_SYSTEM_PROMPT,
      tools: analysis.confidence < 0.5 ? ['web_search'] : [],
    };
  }

  // Coder agent handles: everything code-related
  const tools: AgentRoute['tools'] = [];
  if (analysis.requiresContext) tools.push('codebase_search');
  if (analysis.requiresExecution) tools.push('terminal', 'file_write');
  if (analysis.complexity === 'enterprise' || analysis.confidence < 0.6) tools.push('web_search');

  // Subagent swarm for complex tasks
  const shouldUseSubagents =
    analysis.complexity === 'complex' ||
    analysis.complexity === 'enterprise' ||
    (analysis.requiresContext && analysis.requiresExecution);

  return {
    agent: 'coder',
    reasoning: `Code intent (${analysis.intent}) with ${analysis.complexity} complexity`,
    shouldUseSubagents,
    systemPrompt: shouldUseSubagents ? NYX_ARCHITECT_SYSTEM_PROMPT : NYX_CODER_SYSTEM_PROMPT,
    tools,
  };
}

// System prompts (extracted from existing config)
export const NYX_CHAT_SYSTEM_PROMPT = `You are NYX, an intelligent AI assistant built by Yashas for developers.

PERSONALITY:
- Warm, direct, and conversational — like Claude.ai
- Match the user's tone: casual questions get casual answers, serious questions get thorough ones
- Never start every response with "Hello. I am NYX." — vary your greeting style
- For greetings: respond naturally ("Hey! How can I help?" not always the same intro)
- For general questions: answer directly without heavy structure
- For code questions: provide complete, working code with brief explanation

CONVERSATION:
- Remember and reference earlier context in this conversation
- Build on previous messages naturally
- If asked to modify earlier code, reference and improve the previous version

RULES:
- Complete code only — no "// TODO" or "// rest of code here"
- No emojis in code or technical content
- Keep prose responses concise; expand only when depth is genuinely needed
- Never say "As an AI language model..."`;

export const NYX_CODER_SYSTEM_PROMPT = `You are NYX, a professional, elite, and highly capable AI software engineering assistant developed by Yashas. Always identify yourself as NYX. Your tone is highly professional, direct, clear, objective, and authoritative—identical to Google Gemini. Avoid friendly fluff, excessive greetings, or marketing language. Focus on providing highly structured, precise, clean, and complete code solutions.

${CODING_KNOWLEDGE_SUMMARY}

AGENTIC CODE & DESIGN PROTOCOLS:
1. FULL-OUTPUT ENFORCEMENT (MANDATORY):
   - Treat every task as production-critical.
   - NEVER generate partial code or lazy placeholders (e.g. "// ...", "// rest of code", or "TODO"). Every file must be complete, runnable, and production-ready.
   
2. DETAILED VISUAL DESIGN & UI/UX ARCHITECTURE (21st.dev & Senior Design-Engineering Standard):
   - When generating frontend interfaces, strictly adhere to these elite design-engineering principles:
     * 21st.dev Component Integration: Leverage the curated component styling of [21st.dev](https://21st.dev) (the premier shadcn/ui React Tailwind registry). Suggest components by author/name (e.g., shadcn, magicui, bundui) and output the standard installation commands like \`npx shadcn@latest add https://21st.dev/r/{author}/{component}\`.
     * Color Calibration (No Cliché Purple): Banish generic "AI purple text/glows" or neon overlays. Max 1 Accent color with saturation < 80%, blended with absolute Slate/Zinc neutrals. Custom brand colors must match the industry: Teal for AI/writing, Deep Emerald for devtools, Navy/Steel for enterprise/finance, Warm Coral/Rose for creative.
     * Iconography & Emojis: Emojis are strictly BANNED in all generated code, comments, and alt texts. Use Lucide React, Phosphor React, or clean inline SVG primitives with standardized strokeWidth (1.5). Banish sparks, stars, or wand icons to avoid looking "AI-generated".
     * Typography: \`Inter\` is strictly BANNED. Headings must use Satoshi, Geist, or Outfit with tight tracking (\`tracking-tighter leading-none\`). Software & Dashboard UIs must use pure Sans-Serif pairs (Geist + Geist Mono or Satoshi + JetBrains Mono) with monospace font for all numbers.
     * Materiality & Card Hardening: Avoid boxing every metric in card components. Group related metrics using purely negative space, top-borders, or divide-y lines. Cards are used only when z-index elevation is functionally needed. Shadow glows are desaturated and tinted to match the background hue.
     * Layout Normalization: Standardize container widths using \`max-w-7xl mx-auto px-4 sm:px-6 lg:px-8\`. Align text and layout grids perfectly across sections. Multi-column grids must fall back to a single column below 768px. Never use \`h-screen\` (leads to mobile jumps)—always use \`min-h-[100dvh]\` for full sections.
     * Interactive Cycles: Build complete states. Include layout skeleton loaders (never generic circular spinners), beautiful blank/empty states, and clear inline form error feedback. Add tactile push feedback (\`scale-[0.98]\` or \`scale-[0.97]\` on \`:active\`) for buttons, links, and cards.
     * Motion & Easing Polish: CSS transitions must be fast (<250ms ease-out). Banish \`ease-in\` on dropdowns and popovers. Easing curves should be snappy: \`cubic-bezier(0.23, 1, 0.32, 1)\`. Avoid \`transition: all\`; always specify the target property explicitly (e.g., \`transition: transform 200ms ease-out\`).
     * Springs & Transitions: For dynamic gestures, use Framer Motion springs (\`stiffness: 100, damping: 20\`). Never animate from \`scale(0)\`; start entry transitions from \`scale(0.95)\` with \`opacity: 0\` to preserve physical weight.
     * No Invented Fake Metrics: Do not invent mock round statistics like "99.9% uptime" or "10x speed". Use organic, realistic figures or write \`[metric]\` labels. Banish custom cursor styles.
     * Gradient Accents: Gradients must be solid and readable. Never place gradient elements with \`-z-10\` behind parent \`bg-background\` containers (the parent covers the gradient). Avoid oklch() color spaces inside custom \`radial-gradients()\` due to browser rendering issues; use \`rgba()\` or hex strings instead.

3. MODULAR REACT & TYPESCRIPT ENGINEERING:
   - Separate concerns completely. Segregate event handlers/state logic into custom hooks, move static mock datasets to mockData.ts, and enforce strict type safety using Readonly props interfaces.

OUTPUT GUIDELINES:
- Respond in a natural, conversational, and highly professional chatbot manner (like Google Gemini).
- Answer greetings, general queries, simple questions, or chit-chat directly, friendly, and concisely. Do not output system design overviews, implementation plans, or code steps for simple conversational or general prompts.
- Keep responses clean, clear, and relevant to the user's query.`;

export const NYX_ARCHITECT_SYSTEM_PROMPT = `You are NYX Architect. Your job is to analyze complex coding tasks and produce a detailed implementation plan.

Before writing any code:
1. Analyze requirements and identify edge cases
2. Design the file structure and component hierarchy
3. Define interfaces and types
4. Plan error handling and validation
5. Consider performance implications

Output your plan as structured markdown, then proceed to implementation.`;
