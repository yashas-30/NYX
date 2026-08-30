const LEAKED_TAG_PATTERNS = [
  // ── Leaked instruction tags & prompt structure XML ──────────────────────────
  /^(?:<\/?(?:role|state|constraints|tools|system|system_instructions|instructions|context|prompt|user|assistant|think|thought|thinking|reasoning|antThinking|plan|reflection|safety|user_input|date_context|turn_format_directive|execution_rules)\b[^>]*>|\[\/?(?:INST|SYSTEM|SAFETY|RESEARCH|CONTEXT|THINKING|REASONING)\]|<\|im_start\|>|<\|im_end\|>)\s*/i,
  // ── Leaked prompt context wrappers ──────────────────────────────────────────
  /^\[LIVE (?:REAL-TIME )?WEB SEARCH RESULTS[^\]]*\][\s\S]*?\[\/(?:LIVE )?WEB SEARCH RESULTS\]\s*/i,
  /^\[(?:CONTEXT|RESEARCH CONTEXT|SYSTEM CONTEXT|LIVE WEB SEARCH RESULTS)[^\]]*\][\s\S]*?\[\/(?:CONTEXT|RESEARCH CONTEXT|SYSTEM CONTEXT|LIVE WEB SEARCH RESULTS)\]\s*/i,
  /^<(?:web_search_context|deep_research_context|verified_media_library|verified_media_inventory|memory_context|turn_format_directive|execution_rules)[^>]*>[\s\S]*?<\/(?:web_search_context|deep_research_context|verified_media_library|verified_media_inventory|memory_context|turn_format_directive|execution_rules)>\s*/i,
  // ── Leaked tool calls in prose ───────────────────────────────────────────────
  /^<tool_call>[\s\S]*?<\/tool_call>\s*/i,
];

const CONVERSATIONAL_PREAMBLES = [
  /^(?:(?:Certainly|Sure|Of course|Gladly)[!,.]?\s*(?:here(?:'s| is)|below is|the following|a detailed breakdown)[^\n:]*[:.]?\s*\n+)/i,
  /^(?:(?:Certainly|Sure|Of course|Gladly)[!,.]?\s*\n+)/i,
];

/**
 * Strips leaked prompt tags and technical artifacts from the start of text
 * without stripping normal natural language words.
 */
export function stripResponsePreamble(text: string): string {
  if (!text) return '';
  let cleaned = text.trimStart();
  let prev = '';
  let iterations = 0;
  while (cleaned !== prev && iterations < 5) {
    prev = cleaned;
    iterations++;
    for (const pattern of LEAKED_TAG_PATTERNS) {
      cleaned = cleaned.replace(pattern, '').trimStart();
    }
    for (const pattern of CONVERSATIONAL_PREAMBLES) {
      cleaned = cleaned.replace(pattern, '').trimStart();
    }
  }
  return cleaned;
}

export class StreamFluffFilter {
  public processChunk(chunk: string): string {
    return chunk;
  }

  public flush(): string {
    return '';
  }
}

export function sanitizeLeakedMediaUrls(text: string): string {
  if (!text) return '';
  return text
    .replace(
      /(?<!\!\[[^\]]*\]\()(?<!\[[^\]]*\]\()(?:https?:\/\/[^\s\)]*|[a-z0-9_\-\.\/]+)\.(?:jpg|jpeg|png|webp|gif|svg)(?:\?[^\s\)]*)?\)?/gi,
      (match) => {
        if (match.startsWith('http') && match.includes('](')) return match;
        return '';
      }
    )
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([.,!?;:])/g, '$1')
    .trim();
}

/**
 * Intelligently separates internal model thinking/reasoning (<think> tags, fenced blocks)
 * from the actual response body.
 */
export function extractThinkingAndContent(
  rawContent: string,
  existingReasoning?: string
): { parsedReasoning: string; parsedContent: string } {
  if (!rawContent) {
    return { parsedReasoning: existingReasoning?.trim() || '', parsedContent: '' };
  }

  let content = rawContent;
  const thinkingChunks: string[] = [];
  if (existingReasoning?.trim()) {
    thinkingChunks.push(existingReasoning.trim());
  }

  // 1. Extract explicit XML think tags: <think>, <thought>, <thinking>, <reasoning>, <antThinking>, <plan>, <reflection>
  const thinkTagRegex =
    /<(think|thought|thinking|reasoning|antThinking|plan|reflection)(?:\s+[^>]*?)?>/i;
  let thinkStartMatch = content.match(thinkTagRegex);

  while (thinkStartMatch) {
    const tagName = thinkStartMatch[1];
    const startIndex = thinkStartMatch.index!;
    const startTagLen = thinkStartMatch[0].length;
    const closingTagRegex = new RegExp(`<\/${tagName}>`, 'i');
    const endMatch = content.substring(startIndex + startTagLen).match(closingTagRegex);

    if (endMatch) {
      const endIndex = startIndex + startTagLen + endMatch.index!;
      const endTagLen = endMatch[0].length;
      const inner = content.substring(startIndex + startTagLen, endIndex).trim();
      const outside = (
        content.substring(0, startIndex) + content.substring(endIndex + endTagLen)
      ).trim();
      if (inner) thinkingChunks.push(inner);
      content = outside;
    } else {
      // Unclosed think tag (streaming in progress)
      const inner = content.substring(startIndex + startTagLen).trim();
      if (inner) thinkingChunks.push(inner);
      content = content.substring(0, startIndex).trim();
      break;
    }
    thinkStartMatch = content.match(thinkTagRegex);
  }

  // 2. Extract Bracket tags: [THINKING]...[/THINKING], [REASONING]...[/REASONING]
  const bracketTagRegex = /\[(THINKING|REASONING)\]([\s\S]*?)\[\/\1\]/gi;
  content = content.replace(bracketTagRegex, (_, _tag, inner) => {
    if (inner && inner.trim()) {
      thinkingChunks.push(inner.trim());
    }
    return '';
  });

  // 3. Extract Fenced thought blocks: ```thought ... ``` or ```thinking ... ```
  const fencedThoughtRegex = /```(?:thought|thinking|reasoning)\s*\n([\s\S]*?)(?:```|$)/gi;
  content = content.replace(fencedThoughtRegex, (_, inner) => {
    if (inner && inner.trim()) {
      thinkingChunks.push(inner.trim());
    }
    return '';
  });

  // 4. Extract leaked tool calls in content: <tool_call>...</tool_call>
  const toolCallRegex = /<tool_call>([\s\S]*?)<\/tool_call>/gi;
  content = content.replace(toolCallRegex, (_, inner) => {
    try {
      const parsed = JSON.parse(inner.trim());
      thinkingChunks.push(`🛠️ Executed Tool: \`${parsed.name || 'unknown'}\``);
    } catch {
      thinkingChunks.push(`🛠️ Tool Call: ${inner.trim()}`);
    }
    return '';
  });

  // 5. Extract untagged planning, query dissection monologues, and scratchpads
  const dissectionHeaderMatch = content.match(
    /^(?:Begin Dissecting User Input|Interpreting the Query|Defining the Query)\s*\n+/i
  );
  if (dissectionHeaderMatch) {
    const afterHeader = content.substring(dissectionHeaderMatch[0].length);
    const paragraphs = afterHeader.split(/\n\s*\n/);
    const retainedContent: string[] = [];

    thinkingChunks.push(dissectionHeaderMatch[0].trim());

    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;

      if (trimmedPara.startsWith('![') || trimmedPara.startsWith('<img')) {
        retainedContent.push(trimmedPara);
      } else if (
        /^(?:I'm currently dissecting|I've successfully dissected|I've taken the user's input|I'm examining|Contextually, I've noted|My focus is on understanding)/i.test(
          trimmedPara
        )
      ) {
        thinkingChunks.push(trimmedPara);
      } else {
        retainedContent.push(trimmedPara);
      }
    }

    content = retainedContent.join('\n\n').trim();
  } else if (/^I've started by dissecting the user's request/i.test(content)) {
    const paragraphs = content.split(/\n\s*\n/);
    const retainedContent: string[] = [];
    for (const para of paragraphs) {
      const trimmedPara = para.trim();
      if (!trimmedPara) continue;
      if (/^I(?:'ve started by dissecting|'m building a framework to process)/i.test(trimmedPara)) {
        thinkingChunks.push(trimmedPara);
      } else {
        retainedContent.push(trimmedPara);
      }
    }
    content = retainedContent.join('\n\n').trim();
  } else {
    const structuralPlanningMatch = content.match(
      /^((?:(?:\d+\.\s+[A-Z][^\n]+|\b(?:Defining the Project Scope|Project Planning|Analyze the Request)\b[^\n]*)\n[\s\S]*?))(?=(?:^|\n)#{1,3}\s+[A-Z0-9])/i
    );
    if (structuralPlanningMatch) {
      thinkingChunks.push(structuralPlanningMatch[1].trim());
      content = content.substring(structuralPlanningMatch[1].length).trim();
    }
  }

  const finalContent = stripResponsePreamble(content.trim());
  const finalReasoning = thinkingChunks.filter(Boolean).join('\n\n').trim();

  return {
    parsedReasoning: finalReasoning,
    parsedContent: finalContent,
  };
}
