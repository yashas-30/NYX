/**
 * @file src/components/ui/CodeMirrorBlock.tsx
 * @description Premium, high-performance, read-only CodeMirror 6 editor block.
 */

import React, { useEffect, useRef } from 'react';
import { EditorState, Extension } from '@codemirror/state';
import { EditorView, lineNumbers } from '@codemirror/view';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';

interface CodeMirrorBlockProps {
  code: string;
  language: string;
}

const getLanguageExtension = (lang: string): Extension[] => {
  const normalized = lang.toLowerCase();
  switch (normalized) {
    case 'javascript':
    case 'js':
    case 'typescript':
    case 'ts':
    case 'jsx':
    case 'tsx':
    case 'json':
      return [javascript({ typescript: true, jsx: true })];
    case 'python':
    case 'py':
      return [python()];
    case 'html':
      return [html()];
    case 'css':
      return [css()];
    default:
      return [];
  }
};

export const CodeMirrorBlock: React.FC<CodeMirrorBlockProps> = ({ code, language }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);

  // Initialize/recreate editor when language changes
  useEffect(() => {
    if (!containerRef.current) return;

    const extensions: Extension[] = [
      lineNumbers(),
      oneDark,
      EditorState.readOnly.of(true),
      EditorView.editable.of(false),
      EditorView.theme({
        '&': {
          height: 'auto',
          maxHeight: 'none',
          fontSize: '12px',
          fontFamily: '"Geist Mono","Fira Code","Cascadia Code",ui-monospace,monospace',
          background: 'transparent !important',
        },
        '.cm-scroller': {
          overflow: 'auto',
          lineHeight: '1.65',
        },
        '.cm-gutters': {
          background: 'transparent !important',
          border: 'none',
          color: 'rgba(255,255,255,0.12)',
          userSelect: 'none',
          paddingRight: '10px',
        },
        '.cm-content': {
          padding: '16px 20px',
        },
      }),
      ...getLanguageExtension(language),
    ];

    const state = EditorState.create({
      doc: code,
      extensions,
    });

    const view = new EditorView({
      state,
      parent: containerRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [language]);

  // Update editor doc when code changes (in-place update, avoiding recreation/destroy flicker)
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;

    const currentDoc = view.state.doc.toString();
    if (currentDoc !== code) {
      view.dispatch({
        changes: {
          from: 0,
          to: currentDoc.length,
          insert: code,
        },
      });
    }
  }, [code]);

  return (
    <div
      ref={containerRef}
      className="w-full text-left overflow-x-auto bg-card rounded-none"
      style={{ fontFamily: '"Geist Mono","Fira Code","Cascadia Code",ui-monospace,monospace' }}
    />
  );
};
