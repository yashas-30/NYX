import React from 'react';
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CodeBlock } from '../features/chat/components/CodeBlock';

describe('Diagram Routing in CodeBlock', () => {
  it('routes language="diagram-design" with SVG markup to SvgDiagramCard', () => {
    const svg = `<svg viewBox="0 0 200 100"><rect width="200" height="100" fill="blue"/></svg>`;
    render(<CodeBlock code={svg} language="diagram-design" />);

    expect(screen.getByTitle('Double-click to expand')).toBeDefined();
  });

  it('routes language="diagram" with SVG markup to SvgDiagramCard', () => {
    const svg = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="red"/></svg>`;
    render(<CodeBlock code={svg} language="diagram" />);

    expect(screen.getByTitle('Double-click to expand')).toBeDefined();
  });

  it('routes language="svg" with SVG markup to SvgDiagramCard', () => {
    const svg = `<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40" fill="green"/></svg>`;
    render(<CodeBlock code={svg} language="svg" />);

    expect(screen.getByTitle('Double-click to expand')).toBeDefined();
  });

  it('renders standard code block for normal programming languages', () => {
    const tsCode = `function add(a: number, b: number) { return a + b; }`;
    render(<CodeBlock code={tsCode} language="typescript" filename="math.ts" />);

    expect(screen.queryByTitle('Double-click to expand')).toBeNull();
    expect(screen.getByText('math.ts')).toBeDefined();
  });
});
