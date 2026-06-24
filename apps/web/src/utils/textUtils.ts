/**
 * Utilities for processing text from reasoning LLMs.
 */

/**
 * Strips reasoning tags (e.g. <think>...</think>, <|channel|>thought...</channel|>)
 * from a text block. Used to sanitize history and prevent context bloat.
 */
export function stripThinkingContent(text: string): string {
  if (!text) return text;
  
  // Strip standard <think> tags
  let cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  
  // Strip alternative <|channel|>thought tags
  cleaned = cleaned.replace(/<\|channel\|>thought[\s\S]*?<channel\|>/g, '');
  
  // If the model left an unclosed tag, strip from the tag to the end of the text
  // This is a safety measure for streaming artifacts or cut-off outputs
  const unclosedThinkIndex = cleaned.indexOf('<think>');
  if (unclosedThinkIndex !== -1) {
    cleaned = cleaned.substring(0, unclosedThinkIndex);
  }

  const unclosedChannelIndex = cleaned.indexOf('<|channel|>thought');
  if (unclosedChannelIndex !== -1) {
    cleaned = cleaned.substring(0, unclosedChannelIndex);
  }

  cleaned = cleaned.trim();
  
  // If the content was entirely reasoning, return a placeholder instead of an empty string
  // which might crash some APIs (like OpenAI's history requirements)
  if (text.trim().length > 0 && cleaned.length === 0) {
    return '[Internal reasoning redacted]';
  }
  
  return cleaned;
}

/**
 * Extracts JSON from a model's response, handling markdown blocks and reasoning tags.
 * It first strips any reasoning to ensure no JSON inside the thought process is accidentally parsed.
 */
export function extractCleanJson(rawResponse: string): any {
  if (!rawResponse) return null;

  const cleanText = stripThinkingContent(rawResponse);
  
  // Look for JSON markdown block
  const jsonBlockRegex = /```(?:json)?\s*([\s\S]*?)\s*```/i;
  const match = cleanText.match(jsonBlockRegex);
  
  let jsonString = cleanText;
  if (match && match[1]) {
    jsonString = match[1];
  } else {
    // Fallback: try to find the first { and last }
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      jsonString = cleanText.substring(firstBrace, lastBrace + 1);
    }
  }

  try {
    return JSON.parse(jsonString.trim());
  } catch (e) {
    console.error('Failed to parse clean JSON:', e, 'Raw string:', jsonString);
    return null;
  }
}
