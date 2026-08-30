import { extractSlidevCodeBlock, isSlidevContent } from '../../artifacts/utils/slidevParser';

/**
 * Checks if user prompt was asking for a presentation/slides/ppt
 */
export function isPresentationPrompt(promptText?: string): boolean {
  if (!promptText) return false;
  const lower = promptText.toLowerCase().trim();
  return (
    /\b(?:ppt|presentation|powerpoint|slides|slide\s*deck|pitch\s*deck)\b/i.test(lower) ||
    (/(?:slide|deck)\b/i.test(lower) &&
      /(?:create|make|build|generate|give|show|prepare)\b/i.test(lower))
  );
}

export { extractSlidevCodeBlock, isSlidevContent };

/**
 * Strips raw AI markers, section prefixes, and noisy meta strings.
 */
function cleanAiArtifactNoise(text: string): string {
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
      if (!preText.includes('#')) {
        cleaned = firstSep[1].trim();
      }
    }
  }

  return cleaned.trim();
}

/**
 * Formats a block of text into crisp executive bullet points with bold lead-ins.
 */
function formatSlideBody(text: string): string {
  const lines = text
    .split('\n')
    .map((l) => cleanAiArtifactNoise(l.trim()))
    .filter((l) => l.length > 0 && !/^[-*•]\s*$/.test(l));

  if (lines.length === 0) return '';

  return lines
    .map((line) => {
      let cleanLine = line.replace(/^[-*•]\s*/, '').trim();
      if (!cleanLine) return null;

      // If line doesn't already have bold lead-in, format the first 2-4 words as bold
      if (
        !cleanLine.startsWith('**') &&
        !cleanLine.startsWith('<strong>') &&
        !cleanLine.startsWith('#')
      ) {
        const colonIdx = cleanLine.indexOf(':');
        if (colonIdx > 0 && colonIdx < 40) {
          const lead = cleanLine.substring(0, colonIdx).trim();
          const rest = cleanLine.substring(colonIdx + 1).trim();
          return `- **${lead}:** ${rest}`;
        }
      }

      return cleanLine.startsWith('- ') ? cleanLine : `- ${cleanLine}`;
    })
    .filter(Boolean)
    .join('\n');
}

/**
 * Compiles plain markdown or prose into a structured, executive-grade Slidev presentation deck.
 */
export function compileResponseToSlidev(content: string, userPrompt?: string): string {
  // Clean raw content of stray noise and markers
  const cleanContent = cleanAiArtifactNoise(content);

  // Check if content has explicit "Slide 1", "Slide 2", etc.
  // Numbered slide outlines MUST be decomposed into separate slides regardless of frontmatter!
  const hasNumberedSlides = /(?:^|\n)\s*[-*•\s]*\*?Slide\s*\d+/i.test(cleanContent);

  if (!hasNumberedSlides) {
    // If content already contains explicit multi-slide Slidev syntax, return it directly
    const explicit = extractSlidevCodeBlock(content);
    if (explicit && isSlidevContent(explicit)) return explicit;
    if (isSlidevContent(content) && content.split(/(?:^|\n)---\s*\n/).length >= 3) return content;
  }

  // Extract an accurate topic title from userPrompt or content
  let deckTitle = 'Executive Presentation';
  const cleanPrompt = (userPrompt || '')
    .replace(
      /(?:generate|create|make|build|write|give\s+me|show\s+me|prepare|produce|design|a\s+ppt\s+for|a\s+ppt\s+of|ppt\s+for|ppt\s+of|presentation\s+for|presentation\s+of|presentation\s+on|slides\s+for|slides\s+on|slide\s+deck\s+on|with\s+\d+\s+slides|with\s+\d+\s+ppt\s+slides)/gi,
      ''
    )
    .replace(/\b(?:ppt|presentation|powerpoint|slides|slide\s*deck)\b/gi, '')
    .trim();

  if (cleanPrompt.length >= 3) {
    deckTitle = cleanPrompt
      .split(/\s+/)
      .map((w) => (w.length > 2 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
      .join(' ');
  } else {
    const h1Match = content.match(/^#\s+([^\n]+)/m);
    if (h1Match) {
      deckTitle = h1Match[1].replace(/Part\s*\d+[:\s\-]*/i, '').trim();
    }
  }

  if (hasNumberedSlides) {
    const rawSlideBlocks = cleanContent
      .split(/(?=(?:^|\n)\s*[-*•\s]*\*?Slide\s*\d+)/i)
      .map((s) => s.trim())
      .filter((s) => s.length > 10 && /(?:^|\n)\s*[-*•\s]*\*?Slide\s*\d+/i.test(s));

    const parsedSlides: string[] = [];
    let coverTitle = deckTitle;
    let coverSubtitle = 'Strategic Analysis & Executive Briefing';

    for (let i = 0; i < rawSlideBlocks.length; i++) {
      const block = rawSlideBlocks[i];
      const headerMatch = block.match(
        /^(?:[-*•\s]*)\*?Slide\s*(\d+)(?:\s*\(([^)]+)\))?\*?[:\s\-]*(.*)$/im
      );
      const layoutHint = (headerMatch ? headerMatch[2] || '' : '').toLowerCase();
      const titleHint = (headerMatch ? headerMatch[3] || '' : '')
        .replace(/^[–—\-\s*:]+/, '')
        .replace(/[*_#]/g, '')
        .trim();
      const bodyLines = block
        .replace(/^(?:[-*•\s]*)\*?Slide\s*\d+(?:\s*\([^)]+\))?\*?[:\s\-]*/im, '')
        .trim()
        .split('\n');

      let slideTitle = titleHint;
      let slideSubtitle = '';
      let slideQuote = '';
      let slideContext = '';
      const contentBullets: string[] = [];

      for (const line of bodyLines) {
        const clean = line.replace(/^[-*•\s]+/, '').trim();
        if (!clean) continue;

        if (/^Title:\s*/i.test(clean)) {
          slideTitle = clean
            .replace(/^Title:\s*/i, '')
            .replace(/[*_#]/g, '')
            .trim();
        } else if (/^Subtitle:\s*/i.test(clean)) {
          slideSubtitle = clean
            .replace(/^Subtitle:\s*/i, '')
            .replace(/[*_#]/g, '')
            .trim();
        } else if (/^Quote:\s*/i.test(clean)) {
          slideQuote = clean
            .replace(/^Quote:\s*/i, '')
            .replace(/[*_#]/g, '')
            .trim();
        } else if (/^(?:Context|Source|Author):\s*/i.test(clean)) {
          slideContext = clean
            .replace(/^(?:Context|Source|Author):\s*/i, '')
            .replace(/[*_#]/g, '')
            .trim();
        } else if (!/^[-*•\s]*\*?(?:Context|Core Themes):/i.test(clean)) {
          const colonIdx = clean.indexOf(':');
          if (colonIdx > 0 && colonIdx < 40 && !clean.startsWith('**')) {
            const lead = clean.substring(0, colonIdx).replace(/[*_]/g, '').trim();
            const rest = clean.substring(colonIdx + 1).trim();
            contentBullets.push(`- **${lead}:** ${rest}`);
          } else {
            contentBullets.push(clean.startsWith('- ') ? clean : `- ${clean}`);
          }
        }
      }

      if (layoutHint.includes('cover') || i === 0) {
        if (slideTitle) coverTitle = slideTitle.replace(/[*_#]/g, '').trim();
        if (slideSubtitle) coverSubtitle = slideSubtitle.replace(/[*_#]/g, '').trim();
        parsedSlides.push(
          `---
theme: seriph
title: ${coverTitle}
layout: cover
---

# ${coverTitle}
### ${coverSubtitle}

Presented by NYX Executive Presentation Studio

<!-- note: Open briefing and introduce core strategic agenda. -->`
        );
      } else if (layoutHint.includes('quote') || slideQuote) {
        const quoteText =
          slideQuote || slideTitle || 'Delivering transformative strategic outcomes.';
        const authorText = slideContext || 'Executive Strategic Consensus';
        parsedSlides.push(
          `---
layout: quote
---

# "${quoteText.replace(/^["'“”]+|["'“”]+$/g, '')}"

— ${authorText}

<!-- note: Emphasize core strategic thesis and industry alignment. -->`
        );
      } else if (
        layoutHint.includes('fact') ||
        /^(?:\d+[%xX]|\$\d+|\d+\s*(?:billion|million|trillion|B|M|K))/i.test(slideTitle)
      ) {
        parsedSlides.push(
          `---
layout: fact
---

# ${slideTitle}

${contentBullets.join('\n') || 'Pivotal quantitative inflection point transforming industry operations.'}

<!-- note: Highlight quantitative metric and operational impact. -->`
        );
      } else if (layoutHint.includes('two-cols') || contentBullets.length >= 2) {
        const mid = Math.ceil(contentBullets.length / 2);
        const leftSide = contentBullets.slice(0, mid).join('\n');
        const rightSide = contentBullets.slice(mid).join('\n');

        parsedSlides.push(
          `---
layout: two-cols
---

# ${slideTitle || `Strategic Pillar ${i + 1}`}

${leftSide}

::right::

# Operational Dynamics

${rightSide}

<!-- note: Review key drivers and comparative dynamics. -->`
        );
      } else {
        parsedSlides.push(
          `---
layout: default
---

# ${slideTitle || `Strategic Vector ${i + 1}`}

${contentBullets.join('\n')}

<!-- note: Present core details and context. -->`
        );
      }
    }

    if (parsedSlides.length > 0) {
      return parsedSlides.join('\n\n');
    }
  }

  // 5. Split content into logical sections by Markdown Headings or Slide separators
  const headingSplitter =
    /(?=(?:^|\n)\s*[-*•]?\s*(?:#{1,3}\s+|Slide\s+\d+[:\s\-]+|Section\s+\d+[:\s\-]+|Part\s+\d+[:\s\-]+))/i;
  let rawSections = cleanContent
    .split(headingSplitter)
    .map((s) => s.trim())
    .filter((s) => s.length > 20 && !/^(?:theme:|layout:|::left::|::right::)/i.test(s));

  if (rawSections.length < 2) {
    rawSections = cleanContent
      .split(/\n\n+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 20 && !/^(?:theme:|layout:|::left::|::right::)/i.test(s));
  }

  interface SlideSection {
    title: string;
    body: string;
    layout?: string;
    leftSide?: string;
    rightSide?: string;
  }

  const sections: SlideSection[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const sec = rawSections[i];
    let slideTitle = '';
    let body = sec;

    const headingMatch = sec.match(
      /^(?:[-*•]\s*)?(?:#{1,4}\s+|Slide\s+\d+[:\s\-]+|Section\s+\d+[:\s\-]+|Part\s+\d+[:\s\-]+)([^\n]+)/i
    );
    if (headingMatch) {
      slideTitle = headingMatch[1].replace(/[*_#]/g, '').trim();
      body = sec
        .replace(
          /^(?:[-*•]\s*)?(?:#{1,4}\s+|Slide\s+\d+[:\s\-]+|Section\s+\d+[:\s\-]+|Part\s+\d+[:\s\-]+)[^\n]+\n?/i,
          ''
        )
        .trim();
    } else {
      const firstLine = sec.split('\n')[0].replace(/[*_#]/g, '').trim();
      if (firstLine.length > 3 && firstLine.length < 70) {
        slideTitle = firstLine;
        body = sec.substring(firstLine.length).trim();
      } else {
        slideTitle = `Strategic Vector ${i + 1}`;
      }
    }

    slideTitle = cleanAiArtifactNoise(slideTitle)
      .replace(/::(?:left|right)::/gi, '')
      .replace(/^layout:\s*[^\n]+/i, '')
      .trim();
    body = cleanAiArtifactNoise(body)
      .replace(/^layout:\s*[^\n]+\n?/gim, '')
      .trim();

    if (!slideTitle) slideTitle = `Core Focus ${i + 1}`;

    if (body.includes('::right::')) {
      const parts = body.split(/::right::/i);
      const leftPart = parts[0].replace(/::left::/gi, '').trim();
      const rightPart = parts[1].replace(/::right::/gi, '').trim();
      sections.push({
        title: slideTitle,
        body,
        layout: 'two-cols',
        leftSide: formatSlideBody(leftPart),
        rightSide: formatSlideBody(rightPart),
      });
    } else {
      sections.push({
        title: slideTitle,
        body: formatSlideBody(body),
      });
    }
  }

  // 6. Assemble Executive Presentation Deck
  const deck: string[] = [];

  // Slide 1: Cover Slide
  deck.push(
    `---
theme: seriph
title: ${deckTitle}
layout: cover
---

# ${deckTitle}
### Strategic Analysis & Executive Briefing

Presented by NYX Executive Presentation Studio

<!-- note: Welcome the audience and outline the core strategic agenda. -->`
  );

  if (sections.length === 0) {
    deck.push(
      `---
layout: default
---

# Strategic Overview

${formatSlideBody(cleanContent) || `- **Core Objective:** Comprehensive analysis and execution roadmap for ${deckTitle}.`}

<!-- note: Review executive overview and strategic priorities. -->`
    );
  } else {
    sections.forEach((sec, idx) => {
      if (sec.layout === 'two-cols' && sec.leftSide && sec.rightSide) {
        deck.push(
          `---
layout: two-cols
---

# ${sec.title}

${sec.leftSide}

::right::

# Strategic Dimension

${sec.rightSide}

<!-- note: Examine core pillars and comparative dynamics. -->`
        );
        return;
      }

      // Fact / Metric Layout Detection
      if (
        /^(?:\d+[%xX]|\$\d+|\d+\s*(?:billion|million|trillion|B|M|K))/i.test(sec.title) ||
        /^(?:\d+[%xX]|\$\d+|\d+\s*(?:billion|million|trillion))/i.test(sec.body)
      ) {
        deck.push(
          `---
layout: fact
---

# ${sec.title}

${sec.body}

<!-- note: Highlight this pivotal quantitative metric and industry benchmark. -->`
        );
        return;
      }

      // Quote / Thesis Layout Detection
      if (
        sec.title.startsWith('"') ||
        sec.title.startsWith('“') ||
        sec.body.startsWith('"') ||
        sec.body.startsWith('“')
      ) {
        deck.push(
          `---
layout: quote
---

# ${sec.title}

${sec.body}

<!-- note: Emphasize this core executive thesis and strategic alignment. -->`
        );
        return;
      }

      // Multi-bullet slides -> Bento Two-Cols for clean readability
      const lines = sec.body.split('\n').filter((l) => l.trim().length > 0);
      if (lines.length >= 3) {
        const mid = Math.ceil(lines.length / 2);
        const leftSide = lines.slice(0, mid).join('\n');
        const rightSide = lines.slice(mid).join('\n');

        deck.push(
          `---
layout: two-cols
---

# ${sec.title}

${leftSide}

::right::

# Operational Dynamics

${rightSide}

<!-- note: Review key drivers and operational dynamics. -->`
        );
        return;
      }

      // Default Layout
      deck.push(
        `---
layout: default
---

# ${sec.title}

${sec.body}

<!-- note: Detail key strategic implications and context. -->`
      );
    });
  }

  // Final Slide: Topic-aware conclusion if not already present
  const hasConclusion = sections.some((s) =>
    /conclusion|summary|next\s*steps|action\s*plan|takeaway|roadmap|wrap\s*up/i.test(s.title)
  );

  if (!hasConclusion && sections.length > 0) {
    deck.push(
      `---
layout: end
---

# Summary & Key Takeaways

- **Strategic Synthesis:** Integrated synthesis of core themes, operational metrics, and critical vectors for ${deckTitle}.
- **Implementation Priorities:** Immediate focus areas, alignment pathways, and high-impact execution milestones.
- **Future Trajectory:** Continuous measurement, system optimization, and long-term value creation.

<!-- note: Conclude briefing, summarize key decisions, and open for discussion. -->`
    );
  }

  return deck.join('\n\n');
}
