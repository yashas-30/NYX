/**
 * presentationPrompt.ts
 *
 * Specialized Slidev (Vue/Vite/UnoCSS) presentation studio prompt builder.
 * Enforces strict rhythm guidelines, spatial copy budgets, and full-deck compilation.
 */

import { ChatContext } from './types';
import { resolveModelDisplayName } from './generalPrompt';

export function extractRequestedSlideCount(prompt?: string): number | null {
  if (!prompt) return null;
  const match =
    prompt.match(/\b(\d{1,2})\s*(?:[- ]?slides?|[- ]?slide\s*deck|[- ]?ppt\s*slides?)\b/i) ||
    prompt.match(/(?:with|have|create|make|generate|give|show|produce)\s+(\d{1,2})\s+slides?\b/i);
  if (match && match[1]) {
    const count = parseInt(match[1], 10);
    if (count >= 2 && count <= 30) return count;
  }
  return null;
}

export function buildRhythmGuideline(count: number): string {
  if (count < 2) count = 2;

  const middleLayouts = [
    'two-cols',
    'default',
    'fact',
    'two-cols',
    'default',
    'quote',
    'section',
    'two-cols',
    'default',
  ];

  const slides: string[] = [];
  slides.push(
    `- Slide 1 of ${count} (layout: cover) — Executive title, subtitle (≤ 100 chars), presenter badge.`
  );

  let prevLayout = 'cover';
  let poolIndex = 0;

  for (let i = 2; i <= count - 1; i++) {
    let layout = middleLayouts[poolIndex % middleLayouts.length];
    while (layout === prevLayout) {
      poolIndex++;
      layout = middleLayouts[poolIndex % middleLayouts.length];
    }

    const factForced = count >= 5 && !slides.some((s) => s.includes('layout: fact'));
    const isLastMiddle = i === count - 1;
    if (factForced && isLastMiddle) layout = 'fact';

    if (
      count >= 8 &&
      i === Math.floor(count / 3) + 1 &&
      !slides.some((s) => s.includes('layout: section'))
    ) {
      layout = 'section';
    }

    let description = '';
    if (i === 3 && count >= 4) {
      description =
        'Visual Architecture / Pipeline Diagram Slide with a ```mermaid flowchart (flowchart LR or TD) illustrating system components or workflow.';
    } else if (i === 4 && count >= 5) {
      description =
        'Quantitative Data Analysis & Comparative Table Slide with a structured Markdown table comparing key metrics, benchmarks, or performance KPIs.';
    } else {
      const descriptions: Record<string, string> = {
        cover: 'Executive title, subtitle (≤ 100 chars), presenter badge.',
        'two-cols':
          'Two-column comparison or contrast. Each column: ≤ 4 bullets, each bullet ≤ 20 words with bold lead-in.',
        default:
          'Structured breakdown with ≤ 4 cards or bullets, each ≤ 20 words with bold lead-in, or visual diagram/data table.',
        fact: 'Single landmark metric as headline (e.g. `99.9%` or `$4.2T`). Body: ≤ 2 sentences, ≤ 35 words.',
        quote: 'Block quote ≤ 30 words. Attribution on its own line.',
        section: 'Chapter divider. Title ≤ 55 chars. Body ≤ 2 sentences, ≤ 30 words.',
        end: 'Synthesis & action plan. ≤ 4 bullets, each ≤ 20 words.',
      };
      description = descriptions[layout] ?? '';
    }

    slides.push(`- Slide ${i} of ${count} (layout: ${layout}) — ${description}`);
    prevLayout = layout;
    poolIndex++;
  }

  if (count >= 2) {
    slides.push(
      `- Slide ${count} of ${count} (layout: end) — Synthesis & action plan. ≤ 4 bullets, each ≤ 20 words.`
    );
  }

  return `You must generate a complete, full-length presentation containing ALL ${count} slides in sequential order:\n${slides.join('\n')}\n\nCRITICAL: You MUST write out each and every one of these ${count} slides sequentially. Do NOT stop after 2 slides or truncate the deck.`;
}

export function buildCopyConstraints(): string {
  return `
LAYOUT-SPECIFIC TEXT BUDGETS (strictly enforced per slide):

cover      — Title: ≤ 60 chars. Subtitle: ≤ 100 chars. Body: ≤ 2 sentences, ≤ 40 words total.
two-cols   — Each column: ≤ 4 bullets or card blocks. Each bullet: bold lead-in (≤ 4 words) + ≤ 20 words of body.
default    — ≤ 4 card blocks/bullets total, OR a single clean Mermaid diagram, OR a 3–5 row Markdown data table.
fact       — Headline: single metric token only (e.g. "99.9%" or "$4.2T"). Context body: ≤ 2 sentences, ≤ 35 words.
quote      — Quote text: ≤ 30 words. Attribution line: "— Name / Source" only.
section    — Title: ≤ 55 chars. Body: ≤ 2 sentences, ≤ 30 words.
end        — ≤ 4 action-item cards/bullets. Each item ≤ 20 words.
speaker notes (every slide) — ≤ 3 sentences, ≤ 60 words. Concrete cues only: no repetition of slide text.`.trim();
}

export function buildPresentationPrompt(
  _context: ChatContext,
  isoDateStr: string,
  rawPrompt?: string,
  modelId?: string,
  provider?: string
): string {
  const modelDisplayName = resolveModelDisplayName(modelId, provider);
  const requestedCount = extractRequestedSlideCount(rawPrompt);
  const targetSlideCount = requestedCount ?? 7;

  return `<system_identity>
You are ${modelDisplayName}, specialized in Slidev (Vue/Vite/UnoCSS) and PowerPoint presentation architecture, running within NYX. Today is ${isoDateStr}.
</system_identity>

<mission>
Generate a complete, production-ready ${targetSlideCount}-slide Slidev markdown deck (sli.dev syntax) enriched with real-world research data, quantitative analysis tables, and visual Mermaid architecture diagrams.
</mission>

<output_contract>
1. IMMEDIATE START: Start line 1 with '---' frontmatter. No conversational preamble, greetings, or postscripts.
2. ZERO SCRATCHPAD OR WORD COUNTING: Never output "Count: word1, word2...", "Check each bullet...", or validation self-talk. Begin byte 0 of your response directly with '---' headmatter.
3. RAW SLIDEV MARKDOWN: Do NOT wrap the output in outer markdown code fences (\`\`\`slidev ... \`\`\`). Output raw Slidev markdown only.
4. ZERO GENERIC PLACEHOLDERS: Never write <Insert Title>, [Your Name], <Key Metric>. Every data point, metric, and title must be domain-accurate, factual, and concrete.
5. FULL DECK ENFORCEMENT: You MUST generate ALL ${targetSlideCount} slides in full from Slide 1 to Slide ${targetSlideCount}. Never stop after only 1 or 2 slides. Separate every slide using '---' surrounded by blank lines.
6. SLIDE COUNT: Total slide count in your output MUST equal exactly ${targetSlideCount}.
</output_contract>

<spatial_copy_budgets>
${buildCopyConstraints()}
</spatial_copy_budgets>

<slidev_syntax_reference>
A. Global headmatter (Slide 1 only):
---
theme: seriph
title: <Compelling Presentation Title>
info: <1-sentence briefing summary>
transition: slide-left
mdc: true
layout: cover
---
# <Title>
### <Subtitle ≤ 100 chars>

Presented by ${modelDisplayName} • Strategic Analysis

<!-- note: Opening cue. State primary objectives in ≤ 2 sentences. -->

B. Slide delimiter: '---' surrounded by empty lines between every slide.

C. Two-column layout (layout: two-cols):
---
layout: two-cols
---
# <Slide Title>
- **Lead-In:** Key insight ≤ 20 words.
- **Lead-In:** Key insight ≤ 20 words.
::right::
# <Right Header>
- **Lead-In:** Key insight ≤ 20 words.
- **Lead-In:** Key insight ≤ 20 words.
<!-- note: Speaker cue ≤ 60 words. -->

D. Fact / metric layout (layout: fact):
---
layout: fact
---
# 99.999%
Context body explaining benchmark in ≤ 2 sentences, ≤ 35 words.
<!-- note: Speaker cue ≤ 60 words. -->

E. Visual Architecture & Pipeline Diagram (layout: default):
---
layout: default
---
# System Architecture & Processing Pipeline

\`\`\`mermaid
flowchart LR
  A["Client Request"] --> B["Router & Auth"]
  B --> C["Processing Core"]
  C --> D["Telemetry"]
\`\`\`
<!-- note: Walk through data flow and transformation across pipeline tiers. -->

F. Quantitative Data Analysis & Comparison Table (layout: default):
---
layout: default
---
# Benchmark Comparison & Performance Telemetry

| Parameter / KPI | Baseline Legacy | Neural Core | Performance Delta |
| :--- | :--- | :--- | :--- |
| **Inference Latency** | 450ms | 38ms | **11.8x Faster** |
| **Throughput (req/s)** | 180 | 2,400 | **13.3x Higher** |
| **Memory Footprint** | 16 GB | 3.8 GB | **-76% Reduction** |

<!-- note: Detail key quantitative gains across latency and throughput metrics. -->

G. Quote layout (layout: quote):
---
layout: quote
---
# "<Milestone thesis or quote ≤ 30 words>"
— Industry Authority / Research Citation
<!-- note: Speaker cue ≤ 60 words. -->

H. Section divider (layout: section):
---
layout: section
---
# <Chapter Title ≤ 55 chars>
Thematic overview in ≤ 2 sentences, ≤ 30 words.
<!-- note: Transition narrative ≤ 60 words. -->

I. Conclusion & Action Plan (layout: end):
---
layout: end
---
# Executive Synthesis & Action Plan
- **Immediate Action:** High-priority milestone ≤ 20 words.
- **Resource Allocation:** Core investment path ≤ 20 words.
- **Governance:** Telemetry and verification gate ≤ 20 words.
<!-- note: Closing cue ≤ 60 words. -->
</slidev_syntax_reference>

<mandatory_slide_sequence>
${buildRhythmGuideline(targetSlideCount)}
</mandatory_slide_sequence>

No two consecutive slides may share the same layout. Speaker notes are mandatory on every slide. Write out all ${targetSlideCount} slides from start to finish.`;
}
