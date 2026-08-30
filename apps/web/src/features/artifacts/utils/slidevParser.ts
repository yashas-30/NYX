/**
 * slidevParser.ts
 *
 * Official-compliant parser for Slidev presentation markdown (sli.dev/guide/syntax).
 * Extracts global headmatter, per-slide frontmatter, layouts, column slots (::left::, ::right::),
 * presenter notes, image attributes, and click-step animations.
 */

export interface SlidevHeadmatter {
  title?: string;
  theme?: string;
  background?: string;
  class?: string;
  highlighter?: string;
  lineNumbers?: boolean;
  transition?: string;
  info?: string;
  aspectRatio?: string;
  canvasWidth?: number;
  author?: string;
  keywords?: string;
  presenter?: boolean | string;
  download?: boolean | string;
  exportFilename?: string;
  [key: string]: any;
}

export interface SlidevSlide {
  index: number;
  layout:
    | 'cover'
    | 'intro'
    | 'default'
    | 'two-cols'
    | 'two-cols-header'
    | 'center'
    | 'image'
    | 'image-left'
    | 'image-right'
    | 'quote'
    | 'section'
    | 'fact'
    | 'statement'
    | 'iframe'
    | 'iframe-left'
    | 'iframe-right'
    | 'end'
    | 'none'
    | 'full'
    | string;
  title: string;
  rawContent: string;
  content: string;
  leftContent?: string;
  rightContent?: string;
  headerContent?: string;
  frontmatter: Record<string, any>;
  notes: string;
  clicksCount: number;
  background?: string;
  backgroundSize?: string;
  image?: string;
  url?: string;
  transition?: string;
  classNames?: string;
}

export interface ParsedSlidevDeck {
  headmatter: SlidevHeadmatter;
  slides: SlidevSlide[];
  totalSlides: number;
  raw: string;
}

/**
 * YAML frontmatter parser
 */
function parseYamlBlock(yamlStr: string): Record<string, any> {
  const result: Record<string, any> = {};
  if (!yamlStr) return result;

  const lines = yamlStr.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    const colonIdx = trimmed.indexOf(':');
    if (colonIdx !== -1) {
      const key = trimmed.slice(0, colonIdx).trim();
      let value = trimmed.slice(colonIdx + 1).trim();

      if (value.toLowerCase() === 'true') {
        result[key] = true;
      } else if (value.toLowerCase() === 'false') {
        result[key] = false;
      } else if (!isNaN(Number(value)) && value !== '') {
        result[key] = Number(value);
      } else {
        if (
          (value.startsWith('"') && value.endsWith('"')) ||
          (value.startsWith("'") && value.endsWith("'"))
        ) {
          value = value.slice(1, -1);
        }
        result[key] = value;
      }
    }
  }
  return result;
}

/**
 * Strips frontmatter from the beginning of a block and returns [frontmatterObj, cleanBody]
 */
function stripFrontmatter(block: string): [Record<string, any>, string] {
  const trimmed = block.trim();

  // Check for standard ---frontmatter--- at start
  const standardMatch = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (standardMatch) {
    const fm = parseYamlBlock(standardMatch[1]);
    return [fm, standardMatch[2].trim()];
  }

  // Check for naked key: value header lines before markdown (e.g. layout: cover\n# Title)
  const lines = trimmed.split('\n');
  const frontmatterLines: string[] = [];
  const bodyLines: string[] = [];
  let readingFrontmatter = true;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineTrim = line.trim();

    if (readingFrontmatter) {
      if (lineTrim === '---' || lineTrim === '___') {
        continue;
      }
      if (/^[a-zA-Z0-9_-]+:\s*[^\n]+/.test(lineTrim)) {
        frontmatterLines.push(lineTrim);
        continue;
      } else {
        readingFrontmatter = false;
      }
    }
    bodyLines.push(line);
  }

  const fm = parseYamlBlock(frontmatterLines.join('\n'));
  return [fm, bodyLines.join('\n').trim()];
}

/**
 * Extracts speaker notes from HTML comment blocks: <!-- note: ... --> or <!-- ... -->
 */
function extractNotes(rawText: string): { content: string; notes: string } {
  let content = rawText;
  let notes = '';

  const noteRegex = /<!--\s*(?:(?:presenter\s+)?notes?|speaker\s+notes?)?:?\s*([\s\S]*?)-->/gi;
  const matches = [...rawText.matchAll(noteRegex)];

  for (const match of matches) {
    const noteBody = match[1]?.trim();
    if (noteBody) {
      notes = notes ? `${notes}\n\n${noteBody}` : noteBody;
    }
    content = content.replace(match[0], '');
  }

  return {
    content: content.trim(),
    notes: notes.trim(),
  };
}

/**
 * Extracts the first heading as title
 */
function extractSlideTitle(content: string, fmTitle?: string): string {
  if (fmTitle) return fmTitle;
  const h1Match = content.match(/^#\s+(.+)$/m);
  if (h1Match) return h1Match[1].replace(/[*_`#]/g, '').trim();
  const h2Match = content.match(/^##\s+(.+)$/m);
  if (h2Match) return h2Match[1].replace(/[*_`#]/g, '').trim();
  const h3Match = content.match(/^###\s+(.+)$/m);
  if (h3Match) return h3Match[1].replace(/[*_`#]/g, '').trim();
  return '';
}

/**
 * Counts click animations in a slide
 */
function countSlideClicks(content: string): number {
  const vClickCount = (content.match(/v-click(?:s)?\b/gi) || []).length;
  const tagCount = (content.match(/<v-click\b/gi) || []).length;
  return Math.max(0, vClickCount + tagCount);
}

/**
 * Parses Slidev Markdown content according to official sli.dev syntax rules
 */
function cleanPromptEcho(text: string): string {
  if (!text) return '';
  let cleaned = text
    .replace(
      /<\/?(?:think|thought|thinking|reasoning|reflection|plan)(?:\s+[^>]*?)?>[\s\S]*?<\/(?:think|thought|thinking|reasoning|reflection|plan)>/gi,
      ''
    )
    .replace(/<\/?(?:think|thought|thinking|reasoning|reflection|plan)(?:\s+[^>]*?)?>/gi, '')
    .trim();

  // Find the true Slidev start: either a leading '---' or the first '---' that introduces YAML frontmatter
  const headmatterMatch = cleaned.match(/(?:^|\n)(---\s*\n\s*[a-zA-Z0-9_-]+:\s*[^\n]+[\s\S]*)/);
  if (headmatterMatch && headmatterMatch.index !== undefined && headmatterMatch.index > 0) {
    cleaned = headmatterMatch[1].trim();
  } else if (!cleaned.startsWith('---')) {
    const firstSep = cleaned.match(/(?:^|\n)(---\s*\n[\s\S]*)/);
    if (firstSep && firstSep.index !== undefined && firstSep.index > 0) {
      const preText = cleaned.substring(0, firstSep.index).trim();
      // If text before the first '---' does not contain any slide headings, it is pre-deck noise
      if (!preText.includes('#')) {
        cleaned = firstSep[1].trim();
      }
    }
  }

  return cleaned.trim();
}

export function parseSlidevMarkdown(rawMarkdown: string): ParsedSlidevDeck {
  if (!rawMarkdown || !rawMarkdown.trim()) {
    return {
      headmatter: {},
      slides: [],
      totalSlides: 0,
      raw: rawMarkdown || '',
    };
  }

  // Strip code block fences if passed raw ```slidev ... ```
  let text = cleanPromptEcho(rawMarkdown.trim());
  const codeBlockMatch = text.match(/^```(?:slidev|slides|presentation)?\s*\n([\s\S]*?)```$/i);
  if (codeBlockMatch) {
    text = cleanPromptEcho(codeBlockMatch[1].trim());
  }

  // If text starts with frontmatter without leading ---, add it
  if (
    /^(?:theme|title|layout|highlighter|transition):\s*[^\n]+/i.test(text) &&
    !text.startsWith('---')
  ) {
    text = `---\n${text}`;
  }

  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');

  // Split slides on `---` boundaries outside code fences
  const slideBlocks: string[] = [];
  let currentLines: string[] = [];
  let inCodeFence = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();

    if (trimmed.startsWith('```')) {
      inCodeFence = !inCodeFence;
    }

    if (!inCodeFence && (trimmed === '---' || trimmed === '___')) {
      if (currentLines.length > 0) {
        const blockText = currentLines.join('\n').trim();
        if (blockText.length > 0) {
          slideBlocks.push(blockText);
        }
        currentLines = [];
      }
      continue;
    }

    currentLines.push(line);
  }

  if (currentLines.length > 0) {
    const blockText = currentLines.join('\n').trim();
    if (blockText.length > 0) {
      slideBlocks.push(blockText);
    }
  }

  if (slideBlocks.length === 0) {
    return {
      headmatter: {},
      slides: [],
      totalSlides: 0,
      raw: rawMarkdown,
    };
  }

  let headmatter: SlidevHeadmatter = {};
  let slideRawBlocks: string[] = [];

  // Determine if block 0 is pure headmatter or if block 0 is leaked scratchpad before headmatter
  const [firstFm, firstBody] = stripFrontmatter(slideBlocks[0]);
  if (Object.keys(firstFm).length > 0 && firstBody.length === 0) {
    headmatter = firstFm;
    slideRawBlocks = slideBlocks.slice(1);
  } else if (
    Object.keys(firstFm).length > 0 &&
    (firstFm.theme || firstFm.highlighter || firstFm.transition || firstFm.layout)
  ) {
    headmatter = firstFm;
    slideRawBlocks = [firstBody, ...slideBlocks.slice(1)];
  } else if (slideBlocks.length > 1) {
    // Check if slideBlocks[1] has the real headmatter
    const [secondFm, secondBody] = stripFrontmatter(slideBlocks[1]);
    if (Object.keys(secondFm).length > 0 && (secondFm.theme || secondFm.title || secondFm.layout)) {
      headmatter = secondFm;
      slideRawBlocks = secondBody ? [secondBody, ...slideBlocks.slice(2)] : slideBlocks.slice(2);
    } else {
      slideRawBlocks = slideBlocks;
    }
  } else {
    slideRawBlocks = slideBlocks;
  }

  // Filter out empty blocks or blocks containing no substantive content
  slideRawBlocks = slideRawBlocks.filter((block) => {
    const trimmed = block.trim();
    if (!trimmed) return false;
    const [fm, body] = stripFrontmatter(trimmed);
    return Object.keys(fm).length > 0 || body.length > 0;
  });

  // Consolidate standalone frontmatter blocks (e.g. `layout: fact` followed by `# 85%`)
  const consolidatedBlocks: string[] = [];
  for (let i = 0; i < slideRawBlocks.length; i++) {
    const current = slideRawBlocks[i];
    const [fm, body] = stripFrontmatter(current);
    if (Object.keys(fm).length > 0 && body.length === 0 && i + 1 < slideRawBlocks.length) {
      const next = slideRawBlocks[i + 1];
      consolidatedBlocks.push(`${current}\n${next}`);
      i++; // skip next block as it was merged
    } else {
      consolidatedBlocks.push(current);
    }
  }

  // Parse each slide block
  const rawSlides = consolidatedBlocks.map((rawBlock, idx) => {
    const [slideFm, slideBody] = stripFrontmatter(rawBlock);
    const { content: cleanContent, notes } = extractNotes(slideBody);

    if (!cleanContent && !notes && !slideFm.image && !slideFm.url) return null;

    const layout = (slideFm.layout || (idx === 0 ? 'cover' : 'default')).toLowerCase();

    let leftContent: string | undefined;
    let rightContent: string | undefined;
    let headerContent: string | undefined;

    // Slot partitioning
    if (layout === 'two-cols-header') {
      const headerSplit = cleanContent.split(/::left::/i);
      headerContent = headerSplit[0]?.trim();
      const remaining = headerSplit[1] || '';
      const colSplit = remaining.split(/::right::/i);
      leftContent = colSplit[0]?.replace(/::left::/i, '').trim();
      rightContent = colSplit[1]?.replace(/::right::/i, '').trim();
    } else if (layout === 'two-cols' || cleanContent.includes('::right::')) {
      const parts = cleanContent.split(/::right::/i);
      leftContent = parts[0]?.replace(/::left::/i, '').trim();
      rightContent = parts[1]?.replace(/::right::/i, '').trim() || '';
    }

    // Sanitize default content to remove stray slot tags
    const sanitizedContent = cleanContent
      .replace(/::left::/gi, '')
      .replace(/::right::/gi, '')
      .replace(/^layout:\s*[^\n]+\n?/gim, '')
      .trim();

    const title = extractSlideTitle(sanitizedContent, slideFm.title) || `Slide ${idx + 1}`;
    const clicksCount = countSlideClicks(sanitizedContent);

    const slide: SlidevSlide = {
      index: idx + 1,
      layout,
      title,
      rawContent: rawBlock,
      content: sanitizedContent,
      leftContent,
      rightContent,
      headerContent,
      frontmatter: slideFm,
      notes,
      clicksCount,
      background: slideFm.background,
      backgroundSize: slideFm.backgroundSize,
      image: slideFm.image,
      url: slideFm.url,
      transition: slideFm.transition,
      classNames: slideFm.class,
    };
    return slide;
  });

  const slides: SlidevSlide[] = rawSlides.filter((s): s is SlidevSlide => s !== null);

  return {
    headmatter,
    slides,
    totalSlides: slides.length,
    raw: rawMarkdown,
  };
}

export function isSlidevContent(content: string, language?: string): boolean {
  if (!content) return false;
  const lang = (language || '').toLowerCase().trim();
  if (['slidev', 'slides', 'presentation', 'ppt'].includes(lang)) return true;

  const trimmed = content.trim();
  if (/^---\s*\n[\s\S]*?(?:theme|layout|highlighter|transition):\s*[^\n]+\n---/i.test(trimmed)) {
    return true;
  }
  if (
    /(?:^|\n)---\s*\nlayout:\s*(?:two-cols|two-cols-header|cover|center|intro|statement|fact|quote|image|end|default)/i.test(
      trimmed
    )
  ) {
    return true;
  }
  if (trimmed.split(/(?:^|\n)---\s*\n/).length >= 3 && /layout:/i.test(trimmed)) {
    return true;
  }
  if (/::(?:left|right)::/i.test(trimmed) && trimmed.includes('---')) {
    return true;
  }
  return false;
}

export function extractSlidevCodeBlock(content: string): string | null {
  if (!content) return null;
  const slidevMatch = content.match(/```(?:slidev|slides|presentation)\s*\n([\s\S]*?)```/i);
  if (slidevMatch && slidevMatch[1]?.trim()) {
    return slidevMatch[1].trim();
  }
  return null;
}
