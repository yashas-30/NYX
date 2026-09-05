/**
 * pptxExporter.ts
 *
 * Generates and downloads a genuine, fully-editable PowerPoint (.pptx) presentation
 * from a Slidev parsed deck using pptxgenjs.
 */

import { parseSlidevMarkdown, ParsedSlidevDeck, SlidevSlide } from './slidevParser';

export interface PptxExportOptions {
  fileName?: string;
  theme?: 'dark' | 'light' | 'midnight' | 'emerald';
  author?: string;
  company?: string;
}

interface ThemeConfig {
  background: string;
  titleColor: string;
  textColor: string;
  accentColor: string;
  cardBg: string;
  codeBg: string;
  cardBorder: string;
}

const THEMES: Record<string, ThemeConfig> = {
  dark: {
    background: '080808',
    titleColor: 'FFFFFF',
    textColor: 'D4D4D8',
    accentColor: 'FFFFFF',
    cardBg: '111111',
    codeBg: '000000',
    cardBorder: '262626',
  },
  midnight: {
    background: '000000',
    titleColor: 'FFFFFF',
    textColor: 'E2E8F0',
    accentColor: 'FFFFFF',
    cardBg: '0C0C0C',
    codeBg: '000000',
    cardBorder: '27272A',
  },
  emerald: {
    background: '05120D',
    titleColor: 'F0FDF4',
    textColor: 'A7F3D0',
    accentColor: '34D399',
    cardBg: '0B2118',
    codeBg: '020B07',
    cardBorder: '065F46',
  },
  light: {
    background: 'FFFFFF',
    titleColor: '09090B',
    textColor: '27272A',
    accentColor: '18181B',
    cardBg: 'F4F4F5',
    codeBg: 'E4E4E7',
    cardBorder: 'E4E4E7',
  },
};

/**
 * Strips markdown formatting (bold, italic, links, tags) to pure text
 */
function cleanMarkdownText(md: string): string {
  if (!md) return '';
  return md
    .replace(/^#+\s+/gm, '') // Remove heading hashes
    .replace(/\*\*([^*]+)\*\*/g, '$1') // Bold
    .replace(/\*([^*]+)\*/g, '$1') // Italic
    .replace(/__([^_]+)__/g, '$1') // Bold
    .replace(/_([^_]+)_/g, '$1') // Italic
    .replace(/`([^`]+)`/g, '$1') // Inline code
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1') // Links
    .replace(/<[^>]+>/g, '') // HTML tags
    .replace(/v-click(?:s)?/gi, '') // Slidev tags
    .trim();
}

/**
 * Tokenizes an inline markdown string into styled PPTX text runs
 */
function parseMarkdownInlineToRuns(
  rawText: string,
  titleColor: string,
  textColor: string,
  defaultFontSize: number = 13
): any[] {
  if (!rawText) return [];

  const regex = /(`[^`]+`|\*\*[^*]+\*\*|__[^_]+__|\*[^*]+\*|_[^_]+_|[^\`*_]+)/g;
  const matches = rawText.match(regex) || [rawText];
  const runs: any[] = [];

  for (const part of matches) {
    if (part.startsWith('`') && part.endsWith('`') && part.length > 2) {
      runs.push({
        text: part.slice(1, -1),
        options: {
          fontFace: 'Consolas',
          color: 'A1A1AA',
          fontSize: Math.max(10, defaultFontSize - 1),
        },
      });
    } else if (
      (part.startsWith('**') && part.endsWith('**') && part.length > 4) ||
      (part.startsWith('__') && part.endsWith('__') && part.length > 4)
    ) {
      runs.push({
        text: part.slice(2, -2),
        options: { bold: true, color: titleColor, fontSize: defaultFontSize },
      });
    } else if (
      (part.startsWith('*') && part.endsWith('*') && part.length > 2) ||
      (part.startsWith('_') && part.endsWith('_') && part.length > 2)
    ) {
      runs.push({
        text: part.slice(1, -1),
        options: { italic: true, color: textColor, fontSize: defaultFontSize },
      });
    } else {
      runs.push({
        text: cleanMarkdownText(part),
        options: { bold: false, color: textColor, fontSize: defaultFontSize },
      });
    }
  }

  return runs;
}

/**
 * Parses bold lead-in tags like "**Concept:** Detailed description" into multi-styled PPTX text runs
 */
function parseFormattedRuns(
  rawText: string,
  titleColor: string,
  textColor: string,
  defaultFontSize: number = 13
): any[] {
  const leadInMatch = rawText.match(/^[*_]{2}([^*_]+)[*_]{2}[:\s\-]*(.*)$/);
  if (leadInMatch) {
    const leadTitle = leadInMatch[1].trim();
    const restText = leadInMatch[2].trim();
    const runs: any[] = [
      {
        text: `${leadTitle}: `,
        options: { bold: true, color: titleColor, fontSize: defaultFontSize },
      },
    ];
    if (restText) {
      const restRuns = parseMarkdownInlineToRuns(restText, titleColor, textColor, defaultFontSize);
      runs.push(...restRuns);
    }
    if (runs.length > 0) {
      runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true };
      runs[runs.length - 1].text += '\n';
    }
    return runs;
  }

  const runs = parseMarkdownInlineToRuns(rawText, titleColor, textColor, defaultFontSize);
  if (runs.length > 0) {
    runs[runs.length - 1].options = { ...runs[runs.length - 1].options, breakLine: true };
    runs[runs.length - 1].text += '\n';
  }
  return runs;
}

/**
 * Parses markdown lines into text blocks and bullet points
 */
function parseContentBlocks(content: string): {
  type: 'heading' | 'bullet' | 'text' | 'code';
  rawText: string;
  text: string;
  level?: number;
}[] {
  const lines = (content || '').split('\n');
  const blocks: {
    type: 'heading' | 'bullet' | 'text' | 'code';
    rawText: string;
    text: string;
    level?: number;
  }[] = [];
  let inCode = false;
  let codeBuffer: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed.startsWith('```')) {
      if (inCode) {
        blocks.push({ type: 'code', rawText: codeBuffer.join('\n'), text: codeBuffer.join('\n') });
        codeBuffer = [];
        inCode = false;
      } else {
        inCode = true;
      }
      continue;
    }

    if (inCode) {
      codeBuffer.push(line);
      continue;
    }

    if (trimmed.startsWith('### ')) {
      blocks.push({
        type: 'heading',
        rawText: trimmed,
        text: cleanMarkdownText(trimmed),
        level: 3,
      });
    } else if (trimmed.startsWith('## ')) {
      blocks.push({
        type: 'heading',
        rawText: trimmed,
        text: cleanMarkdownText(trimmed),
        level: 2,
      });
    } else if (trimmed.startsWith('# ')) {
      blocks.push({
        type: 'heading',
        rawText: trimmed,
        text: cleanMarkdownText(trimmed),
        level: 1,
      });
    } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || /^\d+\.\s/.test(trimmed)) {
      const stripped = trimmed.replace(/^[-*]|\d+\./, '').trim();
      blocks.push({ type: 'bullet', rawText: stripped, text: cleanMarkdownText(stripped) });
    } else {
      blocks.push({ type: 'text', rawText: trimmed, text: cleanMarkdownText(trimmed) });
    }
  }

  if (codeBuffer.length > 0) {
    blocks.push({ type: 'code', rawText: codeBuffer.join('\n'), text: codeBuffer.join('\n') });
  }

  return blocks;
}

/**
 * Exports a parsed Slidev deck to a PowerPoint (.pptx) file
 */
export async function exportSlidevToPptx(
  deckOrMarkdown: ParsedSlidevDeck | string,
  options: PptxExportOptions = {}
): Promise<boolean> {
  const deck: ParsedSlidevDeck =
    typeof deckOrMarkdown === 'string' ? parseSlidevMarkdown(deckOrMarkdown) : deckOrMarkdown;
  const pptxModule = await import('pptxgenjs');
  const PptxGen = (pptxModule as any).default || pptxModule;
  const pptx = new (PptxGen as any)();

  // Set widescreen 16:9 format
  pptx.layout = 'LAYOUT_16x9';
  pptx.title = deck.headmatter.title || 'Presentation';
  pptx.author = options.author || 'NYX AI Studio';
  pptx.company = options.company || 'NYX';

  const themeName = options.theme || (deck.headmatter.theme?.includes('light') ? 'light' : 'dark');
  const t = THEMES[themeName] || THEMES.dark;

  // Render each slide
  for (const slide of deck.slides) {
    const s = pptx.addSlide();
    s.background = { color: t.background };

    // Presenter Notes
    if (slide.notes?.trim()) {
      s.addNotes(slide.notes.trim());
    }

    const layout = (slide.layout || '').toLowerCase();

    // 1. Cover / Intro Slide
    if (layout === 'cover' || layout === 'intro' || slide.index === 1) {
      // Classification pill
      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: 1.1,
        w: 2.2,
        h: 0.35,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });
      s.addText('EXECUTIVE BRIEFING', {
        x: 0.8,
        y: 1.15,
        w: 2.2,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: 'A1A1AA',
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Main title
      s.addText(slide.title || deck.headmatter.title || 'Presentation', {
        x: 0.8,
        y: 1.7,
        w: 11.5,
        h: 2.2,
        fontSize: 36,
        bold: true,
        color: t.titleColor,
        fontFace: 'Helvetica',
        valign: 'top',
        breakLine: true,
      });

      // Subtitle / body text
      const blocks = parseContentBlocks(slide.content);
      const subText = blocks
        .filter((b) => b.type !== 'heading' || b.text !== slide.title)
        .map((b) => b.text)
        .join('\n\n');

      if (subText) {
        s.addText(subText, {
          x: 0.8,
          y: 4.1,
          w: 10.5,
          h: 1.8,
          fontSize: 16,
          color: t.textColor,
          fontFace: 'Helvetica',
          valign: 'top',
        });
      }

      // Footer badge
      s.addText(`NYX Slidev Studio • ${deck.slides.length} Slides`, {
        x: 0.8,
        y: 6.6,
        w: 8.0,
        h: 0.4,
        fontSize: 10,
        color: '71717A',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 2. Section / Chapter Divider Slide
    if (layout === 'section' || layout === 'chapter') {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.5,
        y: 1.5,
        w: 10.3,
        h: 4.4,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      // Section Pill
      s.addShape(pptx.ShapeType.roundRect, {
        x: 5.15,
        y: 2.0,
        w: 3.0,
        h: 0.35,
        fill: { color: '18181B' },
        line: { color: t.cardBorder, width: 1 },
      });
      s.addText(`SECTION ${slide.index.toString().padStart(2, '0')}`, {
        x: 5.15,
        y: 2.05,
        w: 3.0,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: 'A1A1AA',
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Section Title
      s.addText(slide.title, {
        x: 2.0,
        y: 2.7,
        w: 9.3,
        h: 1.5,
        fontSize: 34,
        bold: true,
        color: t.titleColor,
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Section Overview
      const blocks = parseContentBlocks(slide.content);
      const secBody = blocks
        .filter((b) => b.type !== 'heading' || b.text !== slide.title)
        .map((b) => b.text)
        .join(' ');

      if (secBody) {
        s.addText(secBody, {
          x: 2.5,
          y: 4.3,
          w: 8.3,
          h: 1.0,
          fontSize: 15,
          color: t.textColor,
          align: 'center',
          fontFace: 'Helvetica',
        });
      }

      // Slide Number
      s.addText(`${slide.index} / ${deck.slides.length}`, {
        x: 11.5,
        y: 6.8,
        w: 1.2,
        h: 0.3,
        fontSize: 10,
        color: '71717A',
        align: 'right',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 3. End / Conclusion Slide
    if (layout === 'end' || layout === 'conclusion') {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.5,
        y: 1.2,
        w: 10.3,
        h: 5.0,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      // Category Pill
      s.addShape(pptx.ShapeType.roundRect, {
        x: 4.8,
        y: 1.7,
        w: 3.7,
        h: 0.35,
        fill: { color: '18181B' },
        line: { color: t.cardBorder, width: 1 },
      });
      s.addText('CONCLUSION & ACTION PLAN', {
        x: 4.8,
        y: 1.75,
        w: 3.7,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: 'A1A1AA',
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Closing Title
      s.addText(slide.title || 'Summary & Next Steps', {
        x: 2.0,
        y: 2.3,
        w: 9.3,
        h: 1.2,
        fontSize: 28,
        bold: true,
        color: t.titleColor,
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Takeaway bullet points
      const blocks = parseContentBlocks(slide.content);
      const endRuns: any[] = [];
      for (const b of blocks) {
        if (b.type === 'heading' && b.text === slide.title) continue;
        endRuns.push(...parseFormattedRuns(b.rawText, t.titleColor, t.textColor, 13));
      }

      if (endRuns.length > 0) {
        s.addText(endRuns, {
          x: 2.2,
          y: 3.6,
          w: 8.9,
          h: 2.2,
          fontFace: 'Helvetica',
          valign: 'top',
        });
      }

      // Slide Number
      s.addText(`${slide.index} / ${deck.slides.length}`, {
        x: 11.5,
        y: 6.8,
        w: 1.2,
        h: 0.3,
        fontSize: 10,
        color: '71717A',
        align: 'right',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 4. Center Layout
    if (layout === 'center') {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.5,
        y: 1.2,
        w: 10.3,
        h: 5.0,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      s.addText(slide.title, {
        x: 2.0,
        y: 1.8,
        w: 9.3,
        h: 1.2,
        fontSize: 28,
        bold: true,
        color: t.titleColor,
        align: 'center',
        fontFace: 'Helvetica',
      });

      const blocks = parseContentBlocks(slide.content);
      const centerBody = blocks
        .filter((b) => b.type !== 'heading' || b.text !== slide.title)
        .map((b) => b.text)
        .join('\n\n');

      if (centerBody) {
        s.addText(centerBody, {
          x: 2.2,
          y: 3.2,
          w: 8.9,
          h: 2.6,
          fontSize: 15,
          color: t.textColor,
          align: 'center',
          fontFace: 'Helvetica',
          valign: 'middle',
        });
      }

      // Slide number
      s.addText(`${slide.index} / ${deck.slides.length}`, {
        x: 11.5,
        y: 6.8,
        w: 1.2,
        h: 0.3,
        fontSize: 10,
        color: '71717A',
        align: 'right',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 5. Two-Column (or Two-Column with Header) Bento Slide
    if (
      layout === 'two-cols' ||
      layout === 'two-cols-header' ||
      (slide.leftContent && slide.rightContent)
    ) {
      const hasHeaderContent = !!slide.headerContent;
      const cardY = hasHeaderContent ? 2.4 : 1.55;
      const cardH = hasHeaderContent ? 4.15 : 5.0;

      // Slide Header Title
      s.addText(slide.title, {
        x: 0.8,
        y: 0.6,
        w: 11.5,
        h: 0.7,
        fontSize: 24,
        bold: true,
        color: t.titleColor,
        fontFace: 'Helvetica',
      });

      s.addShape(pptx.ShapeType.rect, {
        x: 0.8,
        y: 1.3,
        w: 11.7,
        h: 0.02,
        fill: { color: t.cardBorder },
      });

      // Optional Header overview text
      if (hasHeaderContent && slide.headerContent) {
        s.addText(cleanMarkdownText(slide.headerContent), {
          x: 0.8,
          y: 1.45,
          w: 11.7,
          h: 0.75,
          fontSize: 14,
          color: t.textColor,
          fontFace: 'Helvetica',
          valign: 'top',
        });
      }

      // Left Bento Container
      s.addShape(pptx.ShapeType.roundRect, {
        x: 0.8,
        y: cardY,
        w: 5.65,
        h: cardH,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      // Left Index Pill
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.1,
        y: cardY + 0.25,
        w: 0.6,
        h: 0.3,
        fill: { color: '18181B' },
        line: { color: t.cardBorder, width: 1 },
      });
      s.addText('01', {
        x: 1.1,
        y: cardY + 0.28,
        w: 0.6,
        h: 0.25,
        fontSize: 9,
        bold: true,
        color: 'A1A1AA',
        align: 'center',
        fontFace: 'Helvetica',
      });

      const leftBlocks = parseContentBlocks(slide.leftContent || slide.content);
      const leftRuns: any[] = [];
      for (const b of leftBlocks) {
        if (b.type === 'heading') {
          leftRuns.push({
            text: `${b.text}\n`,
            options: { bold: true, fontSize: 15, color: t.titleColor, breakLine: true },
          });
        } else {
          leftRuns.push(...parseFormattedRuns(b.rawText, t.titleColor, t.textColor, 12.5));
        }
      }

      if (leftRuns.length > 0) {
        s.addText(leftRuns, {
          x: 1.1,
          y: cardY + 0.7,
          w: 5.0,
          h: cardH - 0.9,
          fontFace: 'Helvetica',
          valign: 'top',
        });
      }

      // Right Bento Container
      s.addShape(pptx.ShapeType.roundRect, {
        x: 6.85,
        y: cardY,
        w: 5.65,
        h: cardH,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      // Right Index Pill
      s.addShape(pptx.ShapeType.roundRect, {
        x: 7.15,
        y: cardY + 0.25,
        w: 0.6,
        h: 0.3,
        fill: { color: '18181B' },
        line: { color: t.cardBorder, width: 1 },
      });
      s.addText('02', {
        x: 7.15,
        y: cardY + 0.28,
        w: 0.6,
        h: 0.25,
        fontSize: 9,
        bold: true,
        color: 'A1A1AA',
        align: 'center',
        fontFace: 'Helvetica',
      });

      const rightBlocks = parseContentBlocks(slide.rightContent || '');
      const rightRuns: any[] = [];
      for (const b of rightBlocks) {
        if (b.type === 'heading') {
          rightRuns.push({
            text: `${b.text}\n`,
            options: { bold: true, fontSize: 15, color: t.titleColor, breakLine: true },
          });
        } else {
          rightRuns.push(...parseFormattedRuns(b.rawText, t.titleColor, t.textColor, 12.5));
        }
      }

      if (rightRuns.length > 0) {
        s.addText(rightRuns, {
          x: 7.15,
          y: cardY + 0.7,
          w: 5.0,
          h: cardH - 0.9,
          fontFace: 'Helvetica',
          valign: 'top',
        });
      }

      // Slide number
      s.addText(`${slide.index} / ${deck.slides.length}`, {
        x: 11.5,
        y: 6.8,
        w: 1.2,
        h: 0.3,
        fontSize: 10,
        color: '71717A',
        align: 'right',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 6. Fact / Big Metric Slide
    if (layout === 'fact') {
      // Large Bento Stat Card
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.5,
        y: 1.2,
        w: 10.3,
        h: 5.0,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      // Category Pill
      s.addShape(pptx.ShapeType.roundRect, {
        x: 4.9,
        y: 1.7,
        w: 3.5,
        h: 0.35,
        fill: { color: '18181B' },
        line: { color: t.cardBorder, width: 1 },
      });
      s.addText('KEY PERFORMANCE INDICATOR', {
        x: 4.9,
        y: 1.75,
        w: 3.5,
        h: 0.3,
        fontSize: 9,
        bold: true,
        color: 'A1A1AA',
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Big Number / Metric
      s.addText(slide.title || '10x', {
        x: 2.0,
        y: 2.3,
        w: 9.3,
        h: 1.6,
        fontSize: 54,
        bold: true,
        color: t.titleColor,
        align: 'center',
        fontFace: 'Helvetica',
      });

      // Explanatory Takeaway
      const blocks = parseContentBlocks(slide.content);
      const factBody = blocks
        .filter((b) => b.type !== 'heading' || b.text !== slide.title)
        .map((b) => b.text)
        .join(' ');

      if (factBody) {
        s.addText(factBody, {
          x: 2.5,
          y: 4.1,
          w: 8.3,
          h: 1.6,
          fontSize: 16,
          color: t.textColor,
          align: 'center',
          fontFace: 'Helvetica',
        });
      }

      // Slide number
      s.addText(`${slide.index} / ${deck.slides.length}`, {
        x: 11.5,
        y: 6.8,
        w: 1.2,
        h: 0.3,
        fontSize: 10,
        color: '71717A',
        align: 'right',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 7. Quote / Thesis Slide
    if (layout === 'quote' || layout === 'statement') {
      s.addShape(pptx.ShapeType.roundRect, {
        x: 1.5,
        y: 1.2,
        w: 10.3,
        h: 5.0,
        fill: { color: t.cardBg },
        line: { color: t.cardBorder, width: 1 },
      });

      // Big decorative quotation mark
      s.addText('“', {
        x: 2.0,
        y: 1.5,
        w: 1.5,
        h: 1.0,
        fontSize: 60,
        color: '3F3F46',
        fontFace: 'Georgia',
      });

      // Quote Title / Statement
      s.addText(slide.title, {
        x: 2.0,
        y: 2.4,
        w: 9.3,
        h: 2.2,
        fontSize: 22,
        italic: true,
        bold: true,
        color: t.titleColor,
        align: 'center',
        fontFace: 'Georgia',
      });

      // Attribution
      const blocks = parseContentBlocks(slide.content);
      const attribution = blocks
        .filter((b) => b.type !== 'heading' || b.text !== slide.title)
        .map((b) => b.text)
        .join(' ');

      if (attribution) {
        s.addText(attribution.startsWith('—') ? attribution : `— ${attribution}`, {
          x: 2.0,
          y: 4.8,
          w: 9.3,
          h: 0.6,
          fontSize: 13,
          color: 'A1A1AA',
          align: 'center',
          fontFace: 'Helvetica',
        });
      }

      // Slide number
      s.addText(`${slide.index} / ${deck.slides.length}`, {
        x: 11.5,
        y: 6.8,
        w: 1.2,
        h: 0.3,
        fontSize: 10,
        color: '71717A',
        align: 'right',
        fontFace: 'Helvetica',
      });

      continue;
    }

    // 8. Default / Standard Structured Slide Layout
    s.addText(slide.title, {
      x: 0.8,
      y: 0.6,
      w: 11.5,
      h: 0.7,
      fontSize: 24,
      bold: true,
      color: t.titleColor,
      fontFace: 'Helvetica',
    });

    s.addShape(pptx.ShapeType.rect, {
      x: 0.8,
      y: 1.3,
      w: 11.7,
      h: 0.02,
      fill: { color: t.cardBorder },
    });

    // Main Bento Content Card
    s.addShape(pptx.ShapeType.roundRect, {
      x: 0.8,
      y: 1.55,
      w: 11.7,
      h: 5.0,
      fill: { color: t.cardBg },
      line: { color: t.cardBorder, width: 1 },
    });

    const blocks = parseContentBlocks(slide.content);
    const bodyRuns: any[] = [];

    for (const b of blocks) {
      if (b.type === 'heading' && b.text === slide.title) continue;
      if (b.type === 'code') {
        bodyRuns.push({
          text: `${b.text}\n`,
          options: { fontSize: 11, fontFace: 'Consolas', color: 'A1A1AA', breakLine: true },
        });
      } else if (b.type === 'heading') {
        bodyRuns.push({
          text: `${b.text}\n`,
          options: { bold: true, fontSize: 15, color: t.titleColor, breakLine: true },
        });
      } else {
        bodyRuns.push(...parseFormattedRuns(b.rawText, t.titleColor, t.textColor, 13));
      }
    }

    if (bodyRuns.length > 0) {
      s.addText(bodyRuns, {
        x: 1.2,
        y: 1.9,
        w: 10.9,
        h: 4.3,
        fontFace: 'Helvetica',
        valign: 'top',
      });
    }

    // Page Number
    s.addText(`${slide.index} / ${deck.slides.length}`, {
      x: 11.5,
      y: 6.8,
      w: 1.2,
      h: 0.3,
      fontSize: 10,
      color: '71717A',
      align: 'right',
      fontFace: 'Helvetica',
    });
  }

  const cleanFileName = (options.fileName || deck.headmatter.title || 'presentation')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');

  await pptx.writeFile({ fileName: `${cleanFileName || 'presentation'}.pptx` });
  return true;
}
