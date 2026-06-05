export function compressPrompt(prompt: string, maxTokens: number): string {
  const estimatedTokens = Math.ceil(prompt.length / 4);
  if (estimatedTokens <= maxTokens) return prompt;

  // Strategy 1: Remove redundant whitespace
  let compressed = prompt.replace(/\n\s*\n/g, '\n').replace(/\s+/g, ' ');

  // Strategy 2: Summarize long code blocks
  compressed = compressCodeBlocks(compressed);

  // Strategy 3: Remove low-relevance history messages
  compressed = truncateHistory(compressed, maxTokens);

  return compressed;
}

function detectLanguage(code: string): string {
  if (code.includes('import ') && code.includes('export ')) return 'typescript/javascript';
  if (code.includes('def ') && code.includes('print(')) return 'python';
  if (code.includes('class ') && code.includes('public ')) return 'java/c#';
  return 'unknown';
}

function compressCodeBlocks(text: string): string {
  // Replace long code blocks with summaries
  return text.replace(/```([\w]*)\n([\s\S]*?)```/g, (match, lang, code) => {
    const lines = code.split('\n');
    if (lines.length > 50) {
      const language = lang || detectLanguage(code);
      const summary = `// ${lines.length} lines of ${language} code`;
      const first20 = lines.slice(0, 20).join('\n');
      const last10 = lines.slice(-10).join('\n');
      return `\`\`\`${lang}\n${summary}\n${first20}\n// ... (${lines.length - 30} lines omitted) ...\n${last10}\n\`\`\``;
    }
    return match;
  });
}

function truncateHistory(text: string, maxTokens: number): string {
  // Keep system prompt and last N messages. Assumes \n\n separates major sections.
  const parts = text.split('\n\n');
  if (parts.length <= 2) return text; // Can't truncate much further via sectioning

  const systemPrompt = parts[0];
  const messages = parts.slice(1);

  // Binary search for optimal message count
  let low = 1, high = messages.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const candidate = systemPrompt + '\n\n' + messages.slice(-mid).join('\n\n');
    if (Math.ceil(candidate.length / 4) <= maxTokens) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }

  return systemPrompt + '\n\n' + messages.slice(-low).join('\n\n');
}
