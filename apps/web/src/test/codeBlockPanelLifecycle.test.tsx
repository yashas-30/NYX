import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { CodeBlockPanel } from '../features/chat/components/CodeBlockPanel';

// Mock shiki
vi.mock('shiki', () => ({
  codeToHtml: vi.fn().mockResolvedValue('<pre><code>mocked code</code></pre>'),
}));

// Mock theme context
vi.mock('@src/shared/context/ThemeContext', () => ({
  useTheme: () => ({ theme: 'dark' }),
}));

// Mock sonner
vi.mock('@src/shared/components/ui/sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('CodeBlockPanel Lifecycle & Memory Protection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders nothing when isOpen is false, ensuring zero background iframe execution', () => {
    const { container } = render(
      <CodeBlockPanel
        isOpen={false}
        codeBlock={{
          code: '<html><body><h1>Test</h1><script>window.leakedInterval = setInterval(()=>{}, 100);</script></body></html>',
          language: 'html',
          filename: 'index.html',
        }}
        onClose={vi.fn()}
      />
    );

    // Absolutely no iframe or container should be present in the DOM
    expect(container.querySelector('iframe')).toBeNull();
    expect(container.querySelector('aside')).toBeNull();
  });

  it('mounts preview iframe only when isOpen is true and tab is preview', () => {
    const { container } = render(
      <CodeBlockPanel
        isOpen={true}
        codeBlock={{
          code: '<div class="preview">Hello World</div>',
          language: 'html',
          filename: 'test.html',
          initialTab: 'preview',
        }}
        onClose={vi.fn()}
      />
    );

    const iframe = container.querySelector('iframe');
    expect(iframe).not.toBeNull();
    expect(iframe?.getAttribute('title')).toBe('Live Preview');
    expect(iframe?.getAttribute('sandbox')).toBe('allow-scripts');
  });

  it('immediately dismantles preview and stops execution when panel is closed', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <CodeBlockPanel
        isOpen={true}
        codeBlock={{
          code: '<p>Interactive App</p>',
          language: 'html',
          filename: 'app.html',
          initialTab: 'preview',
        }}
        onClose={onClose}
      />
    );

    expect(container.querySelector('iframe')).not.toBeNull();

    // Click close button
    const closeBtn = screen.getByTitle('Close');
    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalled();

    // Rerender with isOpen = false
    rerender(<CodeBlockPanel isOpen={false} codeBlock={null} onClose={onClose} />);

    // Verify iframe is completely removed from DOM
    expect(container.querySelector('iframe')).toBeNull();
  });

  it('suspends live preview iframe during active streaming to prevent RAM thrashing and mounts once finished', () => {
    const onClose = vi.fn();
    const { container, rerender } = render(
      <CodeBlockPanel
        isOpen={true}
        codeBlock={{
          code: '<div>Loading 1...</div>',
          language: 'html',
          filename: 'stream.html',
          isStreaming: true,
          initialTab: 'preview',
        }}
        onClose={onClose}
      />
    );

    // During active stream, preview is suspended to protect memory
    expect(container.querySelector('iframe')).toBeNull();
    expect(screen.getByText(/Preparing live preview…/i)).toBeDefined();

    // When streaming finishes (isStreaming: false), preview mounts cleanly
    rerender(
      <CodeBlockPanel
        isOpen={true}
        codeBlock={{
          code: '<div>Finalized code</div>',
          language: 'html',
          filename: 'stream.html',
          isStreaming: false,
          initialTab: 'preview',
        }}
        onClose={onClose}
      />
    );

    // Now iframe should be mounted with the finalized code
    expect(container.querySelector('iframe')).not.toBeNull();
  });
});
