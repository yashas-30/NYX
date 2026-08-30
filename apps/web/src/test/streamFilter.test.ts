import { describe, it, expect } from 'vitest';
import {
  extractThinkingAndContent,
  stripResponsePreamble,
  sanitizeLeakedMediaUrls,
} from '../features/chat/utils/streamFilter';

describe('extractThinkingAndContent & StreamFluffFilter', () => {
  it('extracts standard <think> tags to reasoning', () => {
    const raw =
      '<think>I need to search for Avengers Secret Wars release date and comic origins.</think>## Executive Overview\n\nAvengers: Secret Wars is slated for release on December 17, 2027.';
    const result = extractThinkingAndContent(raw);
    expect(result.parsedReasoning).toBe(
      'I need to search for Avengers Secret Wars release date and comic origins.'
    );
    expect(result.parsedContent).toBe(
      '## Executive Overview\n\nAvengers: Secret Wars is slated for release on December 17, 2027.'
    );
  });

  it('extracts leaked numbered prompt analysis and outline steps to reasoning', () => {
    const raw = `1. Analyze the Request:
- User Prompt: "deep research about the topic avengers secret wars"
- Date Context: August 21, 2026.
- Active Tools: Search results and verified media library are provided.
- Directives:
  - Deep research / comprehensive synthesis required. Exhaustive multi-section research document.
  - Opening sentence must be direct answer/primary finding.

2. Information Retrieval & Fact-Checking (from Search Results):
- Avengers: Secret Wars is slated for release on December 17, 2027 (MCU Phase 6 finale).
- Comic roots span the original 1984/1985 Jim Shooter maxiseries.

3. Outline the Exhaustive Research Document:
- Opening Sentence: Direct definition/finding about Avengers: Secret Wars.
- Section 1: Executive Synthesis & Historical / Comic Foundations.
- Section 2: Structural Taxonomy, Major Pillars & Architectural Profiles.

# Avengers: Secret Wars — Exhaustive Cinematic & Multiversal Research Synthesis

## 1. Executive Synthesis & Comic Book Foundations
Avengers: Secret Wars represents the definitive culmination of Marvel Studios' Multiverse Saga, scheduled for theatrical release on December 17, 2027. Directed by Anthony and Joe Russo with screenplay by Stephen McFeely, the film adapts two landmark comic storylines: Jim Shooter's 1984 maxiseries and Jonathan Hickman's 2015 cosmic epic. [Source 1]`;

    const result = extractThinkingAndContent(raw);
    expect(result.parsedReasoning).toContain('Analyze the Request');
    expect(result.parsedReasoning).toContain('Information Retrieval & Fact-Checking');
    expect(result.parsedReasoning).toContain('Outline the Exhaustive Research Document');

    expect(result.parsedContent).not.toContain('1. Analyze the Request:');
    expect(result.parsedContent).not.toContain(
      'User Prompt: "deep research about the topic avengers secret wars"'
    );
    expect(result.parsedContent).not.toContain('3. Outline the Exhaustive Research Document:');
    expect(result.parsedContent).toContain(
      '# Avengers: Secret Wars — Exhaustive Cinematic & Multiversal Research Synthesis'
    );
    expect(result.parsedContent).toContain('## 1. Executive Synthesis & Comic Book Foundations');
    expect(result.parsedContent).toContain('[Source 1]');
  });

  it('extracts conversational planning monologues to reasoning', () => {
    const raw = `Defining the Project Scope
Okay, I'm working to fully grasp the objective here. The user wants an exhaustive breakdown of Post-Traumatic Stress Disorder.

# Post-Traumatic Stress Disorder (PTSD): Clinical and Neurobiological Profile

PTSD is a debilitating trauma- and stressor-related disorder.`;

    const result = extractThinkingAndContent(raw);
    expect(result.parsedReasoning).toContain('Defining the Project Scope');
    expect(result.parsedReasoning).toContain('grasp the objective here');
    expect(result.parsedContent.trim()).toBe(
      '# Post-Traumatic Stress Disorder (PTSD): Clinical and Neurobiological Profile\n\nPTSD is a debilitating trauma- and stressor-related disorder.'
    );
  });

  it('strips conversational preambles cleanly', () => {
    const raw =
      'Certainly! Here is the detailed breakdown of the topic:\n\n# Main Topic\n\nContent here.';
    expect(stripResponsePreamble(raw)).toBe('# Main Topic\n\nContent here.');
  });

  it('strips leaked broken image URLs in sentences outside markdown tags', () => {
    const text =
      'Symptoms include hyperarousal /v2/dyggnsmgmv7yzj3aphe6rdcsjx6jc3sachvcdoaizecfr3dnitcq_3_0.png) and flashbacks com/z/ptsd-posttraumatic-stress-disorder-mind-map-23145855.jpg) during sleep.';
    const sanitized = sanitizeLeakedMediaUrls(text);
    expect(sanitized).toBe('Symptoms include hyperarousal and flashbacks during sleep.');
  });
});
