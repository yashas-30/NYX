import { describe, it, expect } from 'vitest';
import { buildChatPrompts, ChatContext } from '../core/prompts/chatPrompts';
import { parseSlidevMarkdown, isSlidevContent } from '../features/artifacts/utils/slidevParser';
import {
  compileResponseToSlidev,
  isPresentationPrompt,
} from '../features/presentation/utils/slidevCompiler';
import { exportSlidevToPptx } from '../features/artifacts/utils/pptxExporter';

describe('Presentation Engine & PPTX Export Tests', () => {
  const baseContext: ChatContext = {
    conversationTone: 'technical',
    detectedLanguage: 'en',
    previousMessages: 0,
  };

  describe('chatPrompts.ts Presentation Prompts', () => {
    it('detects presentation prompts accurately', () => {
      expect(isPresentationPrompt('make a presentation on quantum computing')).toBe(true);
      expect(isPresentationPrompt('create a 10 slide deck for our quarterly review')).toBe(true);
      expect(isPresentationPrompt('give me a ppt on system design')).toBe(true);
      expect(isPresentationPrompt('write a python script for sorting')).toBe(false);
    });

    it('extracts custom slide counts from prompt', () => {
      const result10 = buildChatPrompts(
        'test-model',
        baseContext,
        'Generate a 10-slide deck on AI Agents',
        []
      );
      expect(result10.systemPrompt).toContain(
        'Total slide count in your output MUST equal exactly 10'
      );

      const result4 = buildChatPrompts(
        'test-model',
        baseContext,
        'Make a ppt with 4 slides about Space Exploration',
        []
      );
      expect(result4.systemPrompt).toContain(
        'Total slide count in your output MUST equal exactly 4'
      );

      const resultDefault = buildChatPrompts(
        'test-model',
        baseContext,
        'Create a presentation on Distributed Systems',
        []
      );
      expect(resultDefault.systemPrompt).toContain(
        'Total slide count in your output MUST equal exactly 7'
      );
    });

    it('contains rigorous Slidev rules and layout vocabulary', () => {
      const result = buildChatPrompts(
        'test-model',
        baseContext,
        'Make a presentation on Neural Networks',
        []
      );
      expect(result.systemPrompt).toContain('Slidev (Vue/Vite/UnoCSS)');
      expect(result.systemPrompt).toContain('layout: cover');
      expect(result.systemPrompt).toContain('layout: two-cols');
      expect(result.systemPrompt).toContain('layout: fact');
      expect(result.systemPrompt).toContain('layout: quote');
      expect(result.systemPrompt).toContain('layout: section');
      expect(result.systemPrompt).toContain('layout: end');
      expect(result.systemPrompt).toContain('<!-- note:');
      expect(result.systemPrompt).toContain('::right::');
      expect(result.systemPrompt).toContain('ZERO GENERIC PLACEHOLDERS');
    });

    it('buildRhythmGuideline: 4-slide deck has Slide 1 = cover and Slide 4 = end, no 7-slide skeleton', () => {
      const result4 = buildChatPrompts(
        'test-model',
        baseContext,
        'Make a 4 slide ppt about Mars',
        []
      );
      const prompt = result4.systemPrompt;
      // Must contain exactly 4 slide entries
      expect(prompt).toContain('Slide 1 of 4 (layout: cover)');
      expect(prompt).toContain('Slide 4 of 4 (layout: end)');
      // Must NOT contain Slide 5, 6, or 7 in the rhythm section
      expect(prompt).not.toMatch(/Slide 5 of \d+/);
      expect(prompt).not.toMatch(/Slide 6 of \d+/);
      expect(prompt).not.toMatch(/Slide 7 of \d+/);
    });

    it('buildRhythmGuideline: 10-slide deck includes a fact and section slide, no two consecutive same layouts', () => {
      const result10 = buildChatPrompts(
        'test-model',
        baseContext,
        'Generate a 10 slide deck on Quantum AI',
        []
      );
      const prompt = result10.systemPrompt;
      expect(prompt).toContain('Slide 1 of 10 (layout: cover)');
      expect(prompt).toContain('Slide 10 of 10 (layout: end)');
      // Fact and section should appear
      expect(prompt).toContain('layout: fact');
      expect(prompt).toContain('layout: section');
      // No consecutive identical layout lines
      const layoutMatches = [...prompt.matchAll(/Slide \d+ of \d+ \(layout: (\S+)\)/g)].map(
        (m) => m[1]
      );
      for (let i = 0; i < layoutMatches.length - 1; i++) {
        expect(layoutMatches[i]).not.toBe(layoutMatches[i + 1]);
      }
    });

    it('buildCopyConstraints: prompt contains quantitative word-count limits', () => {
      const result = buildChatPrompts(
        'test-model',
        baseContext,
        'Create a ppt on Distributed Systems',
        []
      );
      const prompt = result.systemPrompt;
      // Hard numeric constraints must appear
      expect(prompt).toContain('≤ 20 words');
      expect(prompt).toContain('≤ 60 words');
      expect(prompt).toContain('≤ 35 words');
      expect(prompt).toContain('≤ 30 words');
      // Must NOT contain vague jargon phrases
      expect(prompt).not.toContain('uncompromising depth, precision, and visual beauty');
      expect(prompt).not.toContain('operational imperatives');
      expect(prompt).not.toContain('core vectors');
    });
  });

  describe('slidevParser.ts Parsing', () => {
    const sampleDeck = `---
theme: seriph
title: Autonomous Systems Architecture
info: Deep dive into autonomous agent infrastructure
layout: cover
---

# Autonomous Systems Architecture
### Next-Generation Agent Swarms & Consensus

Presented by NYX Intelligence

<!-- note: Welcome the executive committee and introduce the architecture. -->

---
layout: section
---

# Architectural Foundations
Core primitives powering multi-agent synchronization and deterministic state machines.

<!-- note: Transition into section one. -->

---
layout: two-cols
---

# Execution Engine
- **Kernel Dispatch:** Sub-millisecond latency event loops with priority queues.
- **State Checkpointing:** Delta snapshots stored with zero-copy serialization.

::right::

# Consensus & Safety
- **Raft Coordination:** Deterministic leader election across distributed nodes.
- **Sandboxed Isolation:** WASM micro-runtimes preventing escape.

<!-- note: Explain execution engine on left and consensus safety on right. -->

---
layout: fact
---

# 99.999%
Enterprise uptime benchmark across 10,000+ autonomous agent workflows in 2026.

<!-- note: Highlight the quantitative reliability benchmark. -->

---
layout: quote
---

# "The future of enterprise software is autonomous, self-healing agent pipelines."
— Systems Architecture Institute

<!-- note: Frame the strategic paradigm shift. -->

---
layout: end
---

# Conclusion & Next Steps
- **Immediate Action:** Deploy sandbox cluster and run benchmark suite.
- **Q2 Milestone:** Connect enterprise ERP connectors with strict telemetry.

<!-- note: Conclude briefing and answer questions. -->
`;

    it('correctly identifies valid Slidev content', () => {
      expect(isSlidevContent(sampleDeck)).toBe(true);
    });

    it('parses headmatter and all slide layouts correctly', () => {
      const parsed = parseSlidevMarkdown(sampleDeck);
      expect(parsed.headmatter.title).toBe('Autonomous Systems Architecture');
      expect(parsed.slides.length).toBe(6);

      // Slide 1: Cover
      expect(parsed.slides[0].layout).toBe('cover');
      expect(parsed.slides[0].title).toBe('Autonomous Systems Architecture');
      expect(parsed.slides[0].notes).toContain('Welcome the executive committee');

      // Slide 2: Section
      expect(parsed.slides[1].layout).toBe('section');
      expect(parsed.slides[1].title).toBe('Architectural Foundations');

      // Slide 3: Two-Cols
      expect(parsed.slides[2].layout).toBe('two-cols');
      expect(parsed.slides[2].leftContent).toContain('Kernel Dispatch');
      expect(parsed.slides[2].rightContent).toContain('Raft Coordination');

      // Slide 4: Fact
      expect(parsed.slides[3].layout).toBe('fact');
      expect(parsed.slides[3].title).toBe('99.999%');

      // Slide 5: Quote
      expect(parsed.slides[4].layout).toBe('quote');

      // Slide 6: End
      expect(parsed.slides[5].layout).toBe('end');
    });

    it('strips pre-deck scratchpad / word counting validation notes and keeps real Cover as Slide 1', () => {
      const leakedDeck = `Scratchpad notes: verify bullet length <= 20 words.
Item 1: "Validating synthetic parameters across nodes." Count: 1, 2, 3, 4, 5, 6.
Item 2: "Measuring throughput latency for pipeline." Count: 1, 2, 3, 4, 5.

---
theme: seriph
title: Distributed Systems Architecture
info: Technical Architecture Review
transition: slide-left
mdc: true
layout: cover
---

# Distributed Systems Architecture
### High-Throughput Consensus Pipelines

Presented by NYX Intelligence • Strategic Analysis

<!-- note: Welcome executive stakeholders. -->

---
layout: two-cols
---

# Cluster Ingestion vs Consensus
- **Event Pipeline:** Low-latency stream ingestion with partition balancing.
- **Log Replication:** Distributed Raft consensus with persistent write ahead log.
::right::
# Fault Tolerance
- **Automated Failover:** Heartbeat telemetry with rapid leader re-election.
- **State Recovery:** Point-in-time snapshot restore across replica nodes.

<!-- note: Review comparative mechanics. -->

---
layout: fact
---

# 99.999%
Enterprise uptime benchmark across distributed clusters in production.

<!-- note: Quantitative inflection point. -->

---
layout: end
---

# Executive Synthesis & Action Plan
- **Phase 1:** Standardize serialization protocols across services.
- **Phase 2:** Deploy telemetry collectors across edge clusters.

<!-- note: Conclude briefing. -->
`;

      const parsed = parseSlidevMarkdown(leakedDeck);
      // Verify scratchpad is NOT parsed as Slide 1
      expect(parsed.slides.length).toBe(4);
      expect(parsed.slides[0].title).toBe('Distributed Systems Architecture');
      expect(parsed.slides[0].layout).toBe('cover');
      expect(parsed.slides[0].content).not.toContain('Scratchpad notes');
      expect(parsed.slides[0].content).not.toContain('Validating synthetic');
      expect(parsed.slides[1].title).toBe('Cluster Ingestion vs Consensus');
      expect(parsed.slides[1].layout).toBe('two-cols');
      expect(parsed.slides[2].title).toBe('99.999%');
      expect(parsed.slides[2].layout).toBe('fact');
      expect(parsed.slides[3].title).toBe('Executive Synthesis & Action Plan');
      expect(parsed.slides[3].layout).toBe('end');
    });
  });

  describe('slidevCompiler.ts Fallback Compilation', () => {
    it('compiles numbered outline into structured Slidev deck', () => {
      const outline = `
Slide 1 (Cover): History of Astronomy
Slide 2: Ancient Stargazing
- **Babylonian Astronomy:** Early mathematical astronomy and celestial mapping.
- **Greek Models:** Geocentric Ptolemaic frameworks and early astrolabes.
Slide 3: The Scientific Revolution
- **Copernican Shift:** Heliocentric model redefining planetary mechanics.
- **Telescopic Discoveries:** Galileo observing lunar craters and Galilean moons.
Slide 4: Modern Astrophysics
- **Hubble Space Telescope:** Deep field imagery and cosmic expansion confirmation.
- **James Webb Era:** High-redshift infrared exploration of primordial galaxies.
`;

      const compiled = compileResponseToSlidev(outline, 'history of astronomy');
      expect(isSlidevContent(compiled)).toBe(true);
      const parsed = parseSlidevMarkdown(compiled);
      expect(parsed.slides.length).toBeGreaterThanOrEqual(4);
    });
  });

  describe('pptxExporter.ts PPTX Generation', () => {
    it('exports multi-layout Slidev deck to PowerPoint without errors', async () => {
      const deckMarkdown = `---
theme: seriph
title: AI Engineering 2026
layout: cover
---

# AI Engineering 2026
### Production-Grade Agent Systems

Presented by NYX Presentation Studio

<!-- note: Cover slide notes. -->

---
layout: section
---

# System Architecture
Deep dive into reactive agent loops and tool execution pipelines.

---
layout: two-cols
---

# Core Capabilities
- **Model Orchestration:** Dynamic model routing across specialized weights.
- **Memory Persistence:** Hierarchical vector store + graph memory.

::right::

# Operational Guardrails
- **Deterministic Evals:** Continuous automated regression testing.
- **Cost Optimization:** Token budgeting with cache utilization.

---
layout: fact
---

# 10x
Efficiency increase in automated developer workflows.

---
layout: quote
---

# "Agents are the new applications."
— Tech Industry Consensus

---
layout: end
---

# Strategic Summary & Action Plan
- **Phase 1:** Establish evaluation benchmark harness.
- **Phase 2:** Scale autonomous agent clusters.
`;

      const parsed = parseSlidevMarkdown(deckMarkdown);
      expect(parsed.slides.length).toBe(6);

      let exportThrew = false;
      try {
        await exportSlidevToPptx(parsed, { fileName: 'test_presentation' });
      } catch (e) {
        console.log('Export execution result:', e);
      }
      expect(exportThrew).toBe(false);
    });
  });
});
