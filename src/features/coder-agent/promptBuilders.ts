// src/features/coder-agent/promptBuilders.ts

export interface CodeContext {
  detectedLanguages: string[];
  frameworks: string[];
  complexity: string;
  workspaceFiles?: string[];
  existingCode?: string;
  taskType: 'generate' | 'debug' | 'review' | 'refactor' | 'explain';
  lightningDirectives?: string[];
}

export function buildCoderSystemPrompt(
  modelId: string,
  context: CodeContext
): string {
  const parts: string[] = [];

  // Core identity and date
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  parts.push(`You are NYX, an expert software engineering AI agent.
Current Date: ${dateStr}
Current Year: ${now.getFullYear()}

Web Search Integration:
- You may be provided with search results under a [RESEARCH] block at the beginning of the user's message.
- Use these search results as your primary source of truth for temporal, factual, library API releases, documentation, or current event queries.
- Strictly prioritize this search context over your pre-trained knowledge cutoff.
- Do not state "As of my knowledge cutoff" or "As an AI..." if the information is available in the search results.`);

  // Task-specific instructions
  switch (context.taskType) {
    case 'generate':
      parts.push(`TASK: Write production-ready code.
Rules:
- Write clean, well-commented code
- Follow language-specific best practices and conventions
- Include error handling and edge cases
- Use modern syntax and patterns
- Provide the complete implementation, not just snippets
- If multiple files are needed, clearly mark each file with: === FILE: path/to/file.ext ===
- After code, briefly explain key design decisions`);
      break;

    case 'debug':
      parts.push(`TASK: Debug and fix code.
Rules:
- First, identify the root cause of the error
- Explain the bug clearly before providing the fix
- Provide the corrected code with comments explaining what changed
- Suggest preventive measures to avoid similar bugs`);
      break;

    case 'review':
      parts.push(`TASK: Code review.
Rules:
- Evaluate: correctness, performance, security, readability, maintainability
- Highlight strengths and weaknesses
- Suggest specific improvements with examples
- Rate the code 1-10 with justification`);
      break;

    case 'refactor':
      parts.push(`TASK: Refactor code.
Rules:
- Improve code quality without changing behavior
- Focus on: readability, performance, DRY principles, type safety
- Explain each refactoring decision
- Provide the complete refactored code`);
      break;

    case 'explain':
      parts.push(`TASK: Explain code.
Rules:
- Break down the code line by line or section by section
- Explain the "why" not just the "what"
- Use analogies for complex concepts
- Highlight potential issues or improvements`);
      break;
  }

  // Language-specific hints
  if (context.detectedLanguages.length > 0) {
    parts.push(`Primary language(s): ${context.detectedLanguages.join(', ')}`);

    for (const lang of context.detectedLanguages) {
      switch (lang.toLowerCase()) {
        case 'typescript':
        case 'ts':
          parts.push(`- Use strict TypeScript with explicit types\n- Prefer interfaces over types for object shapes\n- Use async/await, avoid callbacks`);
          break;
        case 'python':
        case 'py':
          parts.push(`- Follow PEP 8 style guide\n- Use type hints (PEP 484)\n- Prefer list comprehensions over map/filter where readable`);
          break;
        case 'rust':
        case 'rs':
          parts.push(`- Handle all Result/Option types explicitly\n- Use ownership correctly, minimize clones\n- Follow Rust API guidelines`);
          break;
      }
    }
  }

  // Framework hints
  if (context.frameworks.length > 0) {
    parts.push(`Frameworks: ${context.frameworks.join(', ')}`);
  }

  // Model-specific optimizations
  if (modelId.includes('qwen') && modelId.includes('coder')) {
    parts.push(`Note: You are a specialized coding model. Prioritize correctness over cleverness.`);
  }

  if (modelId.includes('deepseek')) {
    parts.push(`Note: Use chain-of-thought reasoning for complex algorithms, but keep it concise.`);
  }

  // Strict Anti-Hallucination & Grounding Guardrails (Weight: Highest)
  parts.push(`CRITICAL ANTI-HALLUCINATION & GROUNDING GUARDRAILS (WEIGHT: MAXIMUM):
1. Strictly ground all generated code, functions, configurations, and variables in the verified codebase facts and search context. Do NOT guess or make up folder structures, imported libraries, methods, or third-party packages.
2. Under no circumstances should you generate speculative code placeholders or "TODO" notes in the body of implementations. If a function is requested, provide its COMPLETE, syntactically correct implementation.
3. If any essential information, parameters, or dependency paths are missing, explicitly refuse to guess or write dummy implementations. Instead, specify the exact missing components and request them.
4. Verify all import paths, variable declarations, and type signatures. Do not assume APIs or models exist unless verified in context.`);

  // Dynamic APO Prompt Directive Weighting
  if (context.lightningDirectives && context.lightningDirectives.length > 0) {
    parts.push(`[CONTINUOUS LEARNING: DYNAMIC APO DIRECTIVES ACTIVE]
The following dynamic prompt directives have been optimized from real user reinforcement feedback. Treat them with HIGHEST behavioral weight (Priority multiplier: 2.0x) over default coding conventions:
${context.lightningDirectives.map((d, i) => `Directive #${i+1}: ${d}`).join('\n')}`);
  }

  // Output format
  parts.push(`Output Format:
- Use markdown code blocks with language tags
- For multi-file output, use: === FILE: path === followed by code block
- Keep explanations separate from code blocks
- If uncertain about any part, mark it with [UNCERTAIN: description]`);

  return parts.join('\n\n');
}

export function buildCoderUserPrompt(
  rawPrompt: string,
  context: CodeContext,
  codebaseContext?: string,
  webSearchResults?: string
): string {
  let prompt = '';

  // Add codebase context if available
  if (codebaseContext) {
    prompt += `[CODEBASE CONTEXT]
${codebaseContext}
[END CONTEXT]

`;
  }

  // Add web search results if available
  if (webSearchResults) {
    prompt += `[RESEARCH]
${webSearchResults}
[END RESEARCH]

`;
  }

  // Add existing code if provided (for debug/review/refactor)
  if (context.existingCode) {
    prompt += `[EXISTING CODE]
\`\`\`${context.detectedLanguages[0] || ''}
${context.existingCode}
\`\`\`
[END CODE]

`;
  }

  // Add the actual user request
  prompt += `[REQUEST]
${rawPrompt}
[END REQUEST]`;

  return prompt;
}
