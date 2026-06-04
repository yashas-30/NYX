import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen } from '@testing-library/react';
import { MessageList } from '../src/features/coder/components/MessageList';

vi.mock('@tanstack/react-virtual', () => ({
  useVirtualizer: ({ count }: any) => ({
    getVirtualItems: () =>
      Array.from({ length: count }, (_, index) => ({
        index,
        key: index,
        start: index * 120,
        size: 120,
      })),
    getTotalSize: () => count * 120,
    measureElement: () => {},
    scrollToIndex: () => {},
  }),
}));



// Mock third-party components using relative paths to ensure Vitest matches the resolved alias paths
vi.mock('../src/shared/components/ui/CodeMirrorBlock', () => ({
  CodeMirrorBlock: ({ code, language }: any) => (
    <pre data-testid="codemirror-mock" data-lang={language}>
      {code}
    </pre>
  ),
}));

vi.mock('../src/shared/components/ui/UnifiedDiffViewer', () => ({
  UnifiedDiffViewer: ({ code }: any) => (
    <pre data-testid="diffviewer-mock">{code}</pre>
  ),
}));

vi.mock('../src/assets/icons/icons', () => ({
  Logo: () => <div data-testid="logo-mock" />,
  NyxLoader: () => <div data-testid="loader-mock" />,
}));

vi.mock('../src/features/coder/components/ToolCallCard', () => ({
  ToolCallCard: ({ toolName, args }: any) => (
    <div data-testid="toolcall-mock">
      {toolName}: {typeof args === 'string' ? args : JSON.stringify(args)}
    </div>
  ),
}));


vi.mock('react-markdown', () => ({
  default: ({ children }: any) => <div data-testid="markdown-mock">{children}</div>,
}));

vi.mock('remark-gfm', () => ({
  default: () => {},
}));

vi.mock('../src/shared/components/ui/sonner', () => ({
  toast: {
    success: () => {},
    error: () => {},
  },
}));

vi.mock('../src/infrastructure/api/authFetch', () => ({
  fetchWithAuth: () => {},
}));

// Mock lucide-react icons explicitly to satisfy Vitest export resolution checks
vi.mock('lucide-react', () => {
  const React = require('react');
  const makeIcon = (name: string) => {
    const Component = (props: any) => React.createElement('span', { 'data-testid': `icon-${name.toLowerCase()}`, ...props });
    Component.displayName = name;
    return Component;
  };
  return {
    Copy: makeIcon('Copy'),
    Check: makeIcon('Check'),
    ArrowDown: makeIcon('ArrowDown'),
    Terminal: makeIcon('Terminal'),
    Play: makeIcon('Play'),
    Save: makeIcon('Save'),
    FileText: makeIcon('FileText'),
    CheckCircle2: makeIcon('CheckCircle2'),
    AlertCircle: makeIcon('AlertCircle'),
    X: makeIcon('X'),
    ThumbsUp: makeIcon('ThumbsUp'),
    ThumbsDown: makeIcon('ThumbsDown'),
    Eye: makeIcon('Eye'),
    Pin: makeIcon('Pin'),
    Globe: makeIcon('Globe'),
    Search: makeIcon('Search'),
    Pencil: makeIcon('Pencil'),
    RefreshCw: makeIcon('RefreshCw'),
    GitBranch: makeIcon('GitBranch'),
    Wrench: makeIcon('Wrench'),
    ChevronDown: makeIcon('ChevronDown'),
    ChevronRight: makeIcon('ChevronRight'),
  };
});


// Mock framer-motion to render plain elements dynamically for any HTML tag
vi.mock('framer-motion', () => {
  const React = require('react');
  const dummyComponent = (type: string) => {
    const Component = ({ children, className, ...props }: any) => {
      const cleanedProps = { ...props };
      delete cleanedProps.animate;
      delete cleanedProps.initial;
      delete cleanedProps.exit;
      delete cleanedProps.transition;
      delete cleanedProps.variants;
      delete cleanedProps.whileHover;
      delete cleanedProps.whileTap;
      return React.createElement(type, { className, ...cleanedProps }, children);
    };
    Component.displayName = `motion.${type}`;
    return Component;
  };

  const motion = new Proxy(
    {},
    {
      get: (_target, type: string) => {
        return dummyComponent(type);
      },
    }
  );

  return {
    motion,
    AnimatePresence: ({ children }: any) => React.createElement(React.Fragment, null, children),
  };
});


describe('MessageList component', () => {
  it('renders EmptyState when history is empty', () => {
    render(
      <MessageList
        history={[]}
        activeAgent="nyx"
        isLoading={false}
        onCopy={vi.fn()}
        copiedId={null}
        suggestedPrompts={['Prompt 1', 'Prompt 2']}
      />
    );

    expect(screen.getByTestId('logo-mock')).toBeDefined();
    expect(screen.getByText('How can assist your project today?')).toBeDefined();
    expect(screen.getByText('Prompt 1')).toBeDefined();
    expect(screen.getByText('Prompt 2')).toBeDefined();
  });

  it('renders messages from history correctly', () => {
    const history = [
      { role: 'user', content: 'What is 2+2?', timestamp: Date.now() },
      { role: 'assistant', content: 'It is 4.', timestamp: Date.now(), status: 'success' },
    ];

    render(
      <MessageList
        history={history as any}
        activeAgent="nyx"
        isLoading={false}
        onCopy={vi.fn()}
        copiedId={null}
      />
    );

    expect(screen.getByText('What is 2+2?')).toBeDefined();
    expect(screen.getByText('It is 4.')).toBeDefined();
  });

  it('renders tool calls in assistant messages', () => {
    const history = [
      {
        role: 'assistant',
        content: 'I will run this tool.',
        timestamp: Date.now(),
        status: 'success',
        toolCalls: [
          { id: '1', name: 'search_web', args: { query: 'test' }, status: 'success' },
        ],
      },
    ];

    render(
      <MessageList
        history={history as any}
        activeAgent="nyx"
        isLoading={false}
        onCopy={vi.fn()}
        copiedId={null}
      />
    );

    expect(screen.getByTestId('toolcall-mock')).toBeDefined();
    expect(screen.getByText('search_web: {"query":"test"}')).toBeDefined();
  });
});
