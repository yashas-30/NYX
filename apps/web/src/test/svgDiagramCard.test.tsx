import React from 'react';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { SvgDiagramCard } from '../features/chat/components/SvgDiagramCard';

const SAMPLE_SVG = `
<svg viewBox="0 0 1000 600" xmlns="http://www.w3.org/2000/svg">
  <rect x="0" y="0" width="1000" height="600" fill="#000000"/>
  <text x="50" y="50" fill="#ffffff" font-size="20">Global Religious Demographics</text>
  <circle cx="300" cy="300" r="150" fill="#e74c3c"/>
</svg>
`;

describe('SvgDiagramCard Component', () => {
  it('renders inline SVG diagram card in normal chat mode', () => {
    const { container } = render(<SvgDiagramCard svgCode={SAMPLE_SVG} />);

    const card = screen.getByTitle('Double-click to expand');
    expect(card).toBeDefined();
    expect(card.className).toContain('cursor-pointer');
    expect(card.querySelector('svg')).toBeDefined();

    // Verify ZERO extra buttons are rendered
    expect(container.querySelectorAll('button')).toHaveLength(0);
  });

  it('expands to full screen on double-click', () => {
    render(<SvgDiagramCard svgCode={SAMPLE_SVG} />);

    const card = screen.getByTitle('Double-click to expand');
    fireEvent.doubleClick(card);

    // Fullscreen overlay should now be mounted in document.body
    const expandedOverlay = screen.getByTitle('Double-click to minimize');
    expect(expandedOverlay).toBeDefined();
    expect(expandedOverlay.className).toContain('fixed');
    expect(expandedOverlay.className).toContain('inset-0');

    // Verify the expanded SVG is fitted to screen with uniform aspect ratio
    const expandedSvg = expandedOverlay.querySelector('svg');
    expect(expandedSvg).toBeDefined();
    expect(expandedSvg?.getAttribute('width')).toBe('100%');
    expect(expandedSvg?.getAttribute('height')).toBe('100%');
    expect(expandedSvg?.getAttribute('preserveAspectRatio')).toBe('xMidYMid meet');

    // Verify ZERO extra buttons are added to the expanded overlay
    expect(document.body.querySelectorAll('button')).toHaveLength(0);
  });

  it('minimizes back to normal size when double-clicked again', () => {
    render(<SvgDiagramCard svgCode={SAMPLE_SVG} />);

    const card = screen.getByTitle('Double-click to expand');
    // First double click -> Expand
    fireEvent.doubleClick(card);
    expect(screen.queryByTitle('Double-click to minimize')).not.toBeNull();

    // Second double click on the expanded view -> Minimize
    const expandedOverlay = screen.getByTitle('Double-click to minimize');
    fireEvent.doubleClick(expandedOverlay);

    // Overlay is now unmounted
    expect(screen.queryByTitle('Double-click to minimize')).toBeNull();
    // Normal card remains
    expect(screen.queryByTitle('Double-click to expand')).not.toBeNull();
  });

  it('minimizes on Escape key press when expanded', () => {
    render(<SvgDiagramCard svgCode={SAMPLE_SVG} />);

    const card = screen.getByTitle('Double-click to expand');
    fireEvent.doubleClick(card);
    expect(screen.queryByTitle('Double-click to minimize')).not.toBeNull();

    // Press Escape
    fireEvent.keyDown(window, { key: 'Escape' });

    // Overlay is closed
    expect(screen.queryByTitle('Double-click to minimize')).toBeNull();
  });

  it('returns null when svgCode is empty', () => {
    const { container } = render(<SvgDiagramCard svgCode="" />);
    expect(container.firstChild).toBeNull();
  });
});
