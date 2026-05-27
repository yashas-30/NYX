/**
 * @file src/lib/api/streamParser.ts
 * @description Shared SSE stream parsing utilities for AI providers.
 * Handles multiple provider formats with robust error handling.
 */

/**
 * Options for parsing SSE streams
 */
export interface StreamParserOptions {
  onChunk?: (text: string, fullText: string) => void;
  onError?: (error: string) => void;
  onDone?: () => void;
  signal?: AbortSignal;
}

/**
 * Parses SSE stream and calls callbacks for chunks and completion.
 * Returns the full accumulated text.
 * 
 * Supports multiple SSE formats:
 * - Unified format: { chunk: "text" }
 * - OpenAI format: { choices: [{ delta: { content: "text" } }] }
 * - Ollama format: { message: { content: "text" } } or { response: "text" }
 * - Gemini SSE format: { chunk: "text" }
 */
export async function parseSSEStream(
   response: Response,
   options: StreamParserOptions & { timeoutMs?: number }
): Promise<string> {
   const { onChunk, onError, onDone, signal, timeoutMs = 120000 } = options;
   
   if (!response.body) {
     throw new Error("No response body");
   }

   const reader = response.body.getReader();
   const decoder = new TextDecoder();
   let buffer = "";
   let resultText = "";

   // Set up timeout controller
   const timeoutController = new AbortController();
   const timeoutId = setTimeout(() => timeoutController.abort(), timeoutMs);

   try {
     while (true) {
       // Check for abort from either the original signal or our timeout
       if (signal?.aborted || timeoutController.signal.aborted) {
         throw new DOMException('Aborted', 'AbortError');
       }
       
       const { done, value } = await reader.read();
       
       if (done) break;

       const chunk = decoder.decode(value, { stream: true });
       buffer += chunk;
       
       // Process complete lines
       const lines = buffer.split("\n");
       buffer = lines.pop() || "";

       for (const line of lines) {
         if (!processLine(line, resultText, options, (text) => { resultText = text; })) {
           // Stream was terminated
           return resultText;
         }
       }
     }
   } finally {
     try {
       reader.releaseLock();
     } catch {
       // Lock may already been released
     }
     clearTimeout(timeoutId);
   }
 
   // Process remaining buffer
   if (buffer.trim()) {
     processLine(buffer.trim(), resultText, options, (text) => { resultText = text; });
   }
   onDone?.();
   return resultText;
 }

/**
 * Process a single SSE line with robust error handling
 */
function processLine(
  line: string,
  currentText: string,
  options: StreamParserOptions,
  updateText: (text: string) => void
): boolean {
  const { onChunk, onError, onDone } = options;
  
  const trimmed = line.trim();
  
  // Skip empty lines and comments
  if (!trimmed || trimmed.startsWith(":")) return true;
  
  // Handle data: prefix
  if (!trimmed.startsWith("data: ")) {
    // Maybe it's raw JSON without "data: " prefix
    return processRawJson(trimmed, currentText, options, updateText);
  }
  
  const data = trimmed.slice(6).trim();
  
  // Handle [DONE] sentinel
  if (data === "[DONE]" || data === "[done]") {
    onDone?.();
    return false;
  }
  
  // Handle empty data
  if (!data) return true;
  
  return processRawJson(data, currentText, options, updateText);
}

/**
 * Process raw JSON data from SSE line
 */
function processRawJson(
  data: string,
  currentText: string,
  options: StreamParserOptions,
  updateText: (text: string) => void
): boolean {
  const { onChunk, onError, onDone } = options;
  
  try {
    const parsed = JSON.parse(data);
    return processParsedData(parsed, currentText, options, updateText);
  } catch (e: any) {
    // JSON parse failed - this is not necessarily an error
    // Many SSE streams have partial lines that can't be parsed
    // We silently skip these rather than failing the entire stream
    return true;
  }
}

/**
 * Process parsed JSON data and extract content
 */
function processParsedData(
  parsed: any,
  currentText: string,
  options: StreamParserOptions,
  updateText: (text: string) => void
): boolean {
  const { onChunk, onError, onDone } = options;
  
  // Handle error payloads
  if (parsed.error) {
    const msg = typeof parsed.error === 'object' 
      ? (parsed.error.message || parsed.error.code || JSON.stringify(parsed.error))
      : String(parsed.error);
    onError?.(msg);
    throw new Error(msg);
  }
  
  // Handle done signals
  if (parsed.done === true || parsed.finish_reason === 'stop') {
    onDone?.();
    return false;
  }
  
  // Try to extract content from various formats
  let content: string | null = null;
  
  // Format 1: Unified format { chunk: "text" }
  if (typeof parsed.chunk === 'string') {
    content = parsed.chunk;
  }
  
  // Format 2: OpenAI/OpenRouter/NVIDIA format
  // { choices: [{ delta: { content: "text" } }] }
  if (!content && parsed.choices && Array.isArray(parsed.choices)) {
    const choice = parsed.choices[0];
    if (choice?.delta?.content) {
      content = choice.delta.content;
    } else if (choice?.message?.content) {
      content = choice.message.content;
    }
  }
  
  // Format 3: Ollama /api/chat format
  // { message: { content: "text" } }
  if (!content && parsed.message?.content) {
    content = parsed.message.content;
  }
  
  // Format 4: Ollama /api/generate format
  // { response: "text" }
  if (!content && typeof parsed.response === 'string') {
    content = parsed.response;
  }
  
  // Format 5: Gemini SSE format in client responses
  // { text: "text" }
  if (!content && typeof parsed.text === 'string') {
    content = parsed.text;
  }
  
  // Format 6: Raw content in data field (some providers)
  if (!content && typeof parsed.data === 'string') {
    content = parsed.data;
  }
  
  // If we found content, emit it
  if (content && content.length > 0) {
    const newText = currentText + content;
    updateText(newText);
    onChunk?.(content, newText);
  }
  
  return true;
}

/**
 * Creates an AbortController with timeout
 */
export function createTimeoutController(timeoutMs: number): AbortController {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller;
}

/**
 * Checks if an error is transient (retryable)
 */
export function isTransientError(message: string): boolean {
  const transientPatterns = [
    '429', '503', 'RESOURCE_EXHAUSTED', 'UNAVAILABLE',
    'rate_limit', 'quota', 'overloaded', 'high demand'
  ];
  return transientPatterns.some(p => message.includes(p));
}

/**
 * Formats error message based on type
 */
export function formatProviderError(message: string): string {
  if (message.includes("RESOURCE_EXHAUSTED") || message.includes("429") || message.includes("quota")) {
    return "API quota exceeded. Check your provider dashboard.";
  }
  if (message.includes("503") || message.includes("UNAVAILABLE") || message.includes("overloaded")) {
    return "Model is currently unavailable. Please try again.";
  }
  if (message.includes("No response") || message.includes("PROTOCOL HALT")) {
    return "No response from API. The service may be down.";
  }
  if (message.includes("Invalid API key") || message.includes("401") || message.includes("unauthorized")) {
    return "Invalid API key. Please check your Settings.";
  }
  return message;
}