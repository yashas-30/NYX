/**
 * @file apps/web/src/features/chat/utils/searchReplace.ts
 * In-place SEARCH/REPLACE block parser and patch applicator.
 * Enables AI models to surgically edit code without rewriting files from scratch.
 */

export interface SearchReplaceBlock {
  search: string;
  replace: string;
  isComplete: boolean;
  hasDelimiter: boolean;
}

export interface SearchReplaceResult {
  updatedCode: string;
  code: string;
  appliedCount: number;
  activeEditLine?: number;
  activeEditRange?: { startLine: number; endLine: number };
  isStreamingEdit?: boolean;
}

/**
 * Extracts SEARCH/REPLACE blocks from AI stream or message content.
 * Standard format:
 * <<<<<<< SEARCH
 * [original lines]
 * =======
 * [replacement lines]
 * >>>>>>>
 */
export function parseSearchReplaceBlocks(content: string): SearchReplaceBlock[] {
  if (!content || typeof content !== 'string') return [];

  const blocks: SearchReplaceBlock[] = [];
  const regex = /<{5,9}\s*SEARCH\s*\r?\n([\s\S]*?)\r?\n={5,9}\s*\r?\n([\s\S]*?)(?:\r?\n>{5,9}|$)/g;

  let match: RegExpExecArray | null;
  let lastIndex = 0;

  while ((match = regex.exec(content)) !== null) {
    const fullMatch = match[0];
    const isComplete = />{5,9}/.test(fullMatch);
    blocks.push({
      search: match[1],
      replace: match[2],
      isComplete,
      hasDelimiter: true,
    });
    lastIndex = regex.lastIndex;
  }

  // Check if there is an in-progress SEARCH block at the end that has not reached ======= yet
  const tail = content.slice(lastIndex);
  const searchOnlyMatch = tail.match(/<{5,9}\s*SEARCH\s*\r?\n([\s\S]*?)$/);
  if (searchOnlyMatch && !/={5,9}/.test(searchOnlyMatch[1])) {
    blocks.push({
      search: searchOnlyMatch[1],
      replace: '',
      isComplete: false,
      hasDelimiter: false,
    });
  }

  return blocks;
}

/**
 * Normalizes newlines and trailing whitespace per line for fuzzy matching.
 */
function normalizeLine(line: string): string {
  return line.trimEnd();
}

/**
 * Finds the start index of targetText inside sourceText, with whitespace tolerance.
 */
function findMatchIndex(
  source: string,
  target: string
): { index: number; matchLength: number } | null {
  if (!target) return null;

  // 1. Exact match
  const exactIdx = source.indexOf(target);
  if (exactIdx !== -1) {
    return { index: exactIdx, matchLength: target.length };
  }

  // 2. Line-by-line whitespace-tolerant match
  const sourceLines = source.split(/\r?\n/);
  const targetLines = target.split(/\r?\n/);

  if (targetLines.length > sourceLines.length) return null;

  for (let i = 0; i <= sourceLines.length - targetLines.length; i++) {
    let matched = true;
    for (let j = 0; j < targetLines.length; j++) {
      if (normalizeLine(sourceLines[i + j]) !== normalizeLine(targetLines[j])) {
        matched = false;
        break;
      }
    }

    if (matched) {
      const preLines = sourceLines.slice(0, i);
      const matchedLines = sourceLines.slice(i, i + targetLines.length);

      const hasCrlf = source.includes('\r\n');
      const nlLen = hasCrlf ? 2 : 1;

      const charOffset = preLines.reduce((acc, l) => acc + l.length + nlLen, 0);
      const matchLen = matchedLines.reduce((acc, l) => acc + l.length + nlLen, 0) - nlLen;

      return { index: charOffset, matchLength: matchLen };
    }
  }

  return null;
}

/**
 * Applies all parsed SEARCH/REPLACE blocks sequentially to the original code.
 * Preserves all untouched code completely.
 * Computes active line number and range for live editor scrolling and highlighting.
 */
export function applySearchReplace(
  originalCode: string,
  streamOrMessageContent: string
): SearchReplaceResult {
  if (!originalCode || !streamOrMessageContent) {
    return { updatedCode: originalCode, code: originalCode, appliedCount: 0 };
  }

  const blocks = parseSearchReplaceBlocks(streamOrMessageContent);
  if (blocks.length === 0) {
    return { updatedCode: originalCode, code: originalCode, appliedCount: 0 };
  }

  let result = originalCode;
  let appliedCount = 0;
  let activeEditLine: number | undefined = undefined;
  let activeEditRange: { startLine: number; endLine: number } | undefined = undefined;
  let isStreamingEdit = false;

  for (const block of blocks) {
    if (!block.search.trim()) continue;

    const matchInfo = findMatchIndex(result, block.search);
    if (matchInfo) {
      const before = result.substring(0, matchInfo.index);
      const after = result.substring(matchInfo.index + matchInfo.matchLength);
      const startLine = before.split(/\r?\n/).length;

      if (block.hasDelimiter) {
        result = before + block.replace + after;
        appliedCount++;
        const replaceLines = block.replace.split(/\r?\n/).length;
        activeEditLine = startLine + Math.max(0, replaceLines - 1);
        activeEditRange = { startLine, endLine: startLine + Math.max(0, replaceLines - 1) };
      } else {
        const searchLines = block.search.split(/\r?\n/).length;
        activeEditLine = startLine;
        activeEditRange = { startLine, endLine: startLine + Math.max(0, searchLines - 1) };
      }

      if (!block.isComplete) {
        isStreamingEdit = true;
      }
    }
  }

  return {
    updatedCode: result,
    code: result,
    appliedCount,
    activeEditLine,
    activeEditRange,
    isStreamingEdit,
  };
}
