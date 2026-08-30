import { describe, it, expect } from 'vitest';

/**
 * Tests for the query-optimization regex ordering fix.
 *
 * The rule: strip markdown code blocks FIRST, then quotes/backticks.
 * If done in reverse order, the backtick-fence characters would be removed
 * before the block-level regex can match, corrupting the content.
 */
function optimizeQueryText(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, '')
    .replace(/["'`]/g, '')
    .trim();
}

describe('optimizeQueryText — regex ordering', () => {
  it('strips a fenced code block entirely', () => {
    const input = 'search for ```const x = 1;``` patterns';
    expect(optimizeQueryText(input)).toBe('search for  patterns');
  });

  it('strips standalone quotes after code blocks are removed', () => {
    const input = `"quoted term" with \`backtick\``;
    expect(optimizeQueryText(input)).toBe('quoted term with backtick');
  });

  it('does not corrupt text when backtick fence spans multiple lines', () => {
    const input = 'find:\n```\nsome code\n``` thanks';
    expect(optimizeQueryText(input)).toBe('find:\n thanks');
  });

  it('returns trimmed empty string for all-whitespace input after strip', () => {
    const input = '``` ```';
    expect(optimizeQueryText(input)).toBe('');
  });

  it('leaves plain text unchanged', () => {
    const input = 'how to implement binary search';
    expect(optimizeQueryText(input)).toBe(input);
  });
});

import { extractThinkingAndContent } from '../features/chat/utils/streamFilter';

describe('extractThinkingAndContent — thinking separation', () => {
  it('separates Begin Dissecting User Input, images, and reflection paragraphs', () => {
    const raw = `Begin Dissecting User Input

![Droupadi Murmu](https://images.mid-day.com/droupadi.jpg)

I'm currently dissecting the user's simple question: "who is the president of India?". I've noted the user input and the context from the web search and image. My focus is on understanding the core intent, which is to identify the current President. I'm examining the best path to extract the answer.

Droupadi Murmu is the President of India, serving as the head of state and the first citizen of the country.`;

    const res = extractThinkingAndContent(raw);
    expect(res.parsedReasoning).toContain('Begin Dissecting User Input');
    expect(res.parsedReasoning).toContain("I'm currently dissecting the user's simple question");
    expect(res.parsedContent).not.toContain('Begin Dissecting User Input');
    expect(res.parsedContent).not.toContain("I'm currently dissecting");
    expect(res.parsedContent).toContain(
      '![Droupadi Murmu](https://images.mid-day.com/droupadi.jpg)'
    );
    expect(res.parsedContent).toContain('Droupadi Murmu is the President of India');
  });

  it('separates Interpreting the Query and question dissection monologue', () => {
    const raw = `Interpreting the Query

I've successfully dissected the user's question, "who is the president of the us." I've incorporated context from web search results, and this reveals Donald J. Trump is the current president, given the date, and I now intend to offer this as an answer.

Donald J. Trump is the 47th President of the United States.`;

    const res = extractThinkingAndContent(raw);
    expect(res.parsedReasoning).toContain('Interpreting the Query');
    expect(res.parsedReasoning).toContain("I've successfully dissected the user's question");
    expect(res.parsedContent).toBe('Donald J. Trump is the 47th President of the United States.');
  });

  it('separates Defining the Query and contextually noted monologue', () => {
    const raw = `Defining the Query

I've taken the user's input, "who is the president of India," and defined the core of the query. Contextually, I've noted that the user's request came today, August 20, 2026. The initial web search indicates Droupadi Murmu as the current president, and she was elected.

Droupadi Murmu is the President of India, serving as the head of state and the supreme commander of the Indian Armed Forces .`;

    const res = extractThinkingAndContent(raw);
    expect(res.parsedReasoning).toContain('Defining the Query');
    expect(res.parsedReasoning).toContain("I've taken the user's input");
    expect(res.parsedContent).toBe(
      'Droupadi Murmu is the President of India, serving as the head of state and the supreme commander of the Indian Armed Forces .'
    );
  });

  it('separates Greek mythology prompt dissection preamble from content', () => {
    const raw = `I've started by dissecting the user's request: "research about the greek mythology." I've considered the provided context, focusing on the available web resources, including History.com, Ancient-Greece.org, and various encyclopedic sources. I'm building a framework to process these disparate sources effectively.

Greek mythology is a vast, evolving corpus of oral and written traditions from the ancient Mediterranean that synthesized religion, historical memory, and moral philosophy to explain natural phenomena, civic identity, and the psychological complexities of the human condition .`;

    const res = extractThinkingAndContent(raw);
    expect(res.parsedReasoning).toContain("I've started by dissecting the user's request");
    expect(res.parsedReasoning).toContain(
      "I'm building a framework to process these disparate sources"
    );
    expect(res.parsedContent).not.toContain("I've started by dissecting");
    expect(res.parsedContent).toBe(
      'Greek mythology is a vast, evolving corpus of oral and written traditions from the ancient Mediterranean that synthesized religion, historical memory, and moral philosophy to explain natural phenomena, civic identity, and the psychological complexities of the human condition .'
    );
  });
});

import {
  extractCoreSubject,
  planVisualPhotoQuery,
  planWebSearchQuery,
} from '../core/services/intelligentQueryEngine';

describe('intelligentQueryEngine — faithful entity extraction', () => {
  it('preserves full entity phrase for "who is called iron man of india"', () => {
    const prompt = 'who is called iron man of india';
    const photoQuery = planVisualPhotoQuery(prompt);
    const webQuery = planWebSearchQuery(prompt);

    expect(photoQuery).toContain('iron man');
    expect(photoQuery).toContain('india');
    expect(photoQuery).not.toBe('called iron man');

    expect(webQuery).toContain('iron man of india');
  });

  it('preserves full entity phrase for historical and scientific figures', () => {
    const prompt = 'who is the father of quantum computing';
    const photoQuery = planVisualPhotoQuery(prompt);
    expect(photoQuery).toContain('father');
    expect(photoQuery).toContain('quantum computing');
  });
});
