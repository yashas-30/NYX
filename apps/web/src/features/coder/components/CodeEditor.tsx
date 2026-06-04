import React, { useEffect, useRef, useState } from 'react';
import { EditorState } from '@codemirror/state';
import {
  EditorView,
  lineNumbers,
  highlightActiveLineGutter,
  highlightSpecialChars,
  drawSelection,
  dropCursor,
  rectangularSelection,
  crosshairCursor,
  highlightActiveLine,
  keymap,
} from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import {
  syntaxHighlighting,
  defaultHighlightStyle,
  bracketMatching,
  foldGutter,
  foldKeymap,
} from '@codemirror/language';
import { oneDark } from '@codemirror/theme-one-dark';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { X, Play } from 'lucide-react';
import { useIdeStore } from '../store/useIdeStore';

export const CodeEditor: React.FC = () => {
  const editorRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const { openFiles, activeFilePath, closeFile, setActiveFile, updateFileContent } = useIdeStore();

  const activeFile = openFiles.find((f) => f.path === activeFilePath);

  useEffect(() => {
    if (!editorRef.current || !activeFile) return;

    const getLanguageExtension = (path: string) => {
      if (
        path.endsWith('.js') ||
        path.endsWith('.ts') ||
        path.endsWith('.tsx') ||
        path.endsWith('.jsx')
      )
        return javascript({ jsx: true, typescript: path.endsWith('.ts') || path.endsWith('.tsx') });
      if (path.endsWith('.py')) return python();
      if (path.endsWith('.html')) return html();
      if (path.endsWith('.css')) return css();
      return [];
    };

    const state = EditorState.create({
      doc: activeFile.content,
      extensions: [
        lineNumbers(),
        highlightActiveLineGutter(),
        highlightSpecialChars(),
        history(),
        foldGutter(),
        drawSelection(),
        dropCursor(),
        EditorState.allowMultipleSelections.of(true),
        rectangularSelection(),
        crosshairCursor(),
        highlightActiveLine(),
        bracketMatching(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        oneDark,
        getLanguageExtension(activeFile.path),
        keymap.of([...defaultKeymap, ...historyKeymap, ...foldKeymap]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            updateFileContent(activeFile.path, update.state.doc.toString());
          }
        }),
      ],
    });

    if (viewRef.current) {
      viewRef.current.destroy();
    }

    const view = new EditorView({
      state,
      parent: editorRef.current,
    });

    viewRef.current = view;

    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [activeFile?.path]); // Re-create editor state when active file changes, but not content changes (handled internally)

  if (!activeFilePath || !activeFile) {
    return (
      <div className="flex-1 bg-background flex flex-col items-center justify-center text-zinc-500">
        <Monitor size={48} className="mb-4 opacity-20" />
        <p className="text-sm">Select a file from the explorer to edit</p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-w-0 bg-[#282c34]">
      <div className="flex h-10 bg-card border-b border-white/5 overflow-x-auto custom-scrollbar">
        {openFiles.map((file) => (
          <div
            key={file.path}
            onClick={() => setActiveFile(file.path)}
            className={`flex items-center gap-2 px-4 py-2 border-r border-white/5 cursor-pointer min-w-max transition-colors
              ${activeFilePath === file.path ? 'bg-[#282c34] text-white border-t-2 border-t-cyan-400' : 'bg-card text-zinc-400 hover:bg-white/5'}`}
          >
            <span className="text-xs truncate max-w-[200px]">
              {file.path.split(/[/\\]/).pop()}
              {file.isDirty && <span className="ml-1 text-cyan-400">*</span>}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                closeFile(file.path);
              }}
              className="p-0.5 rounded hover:bg-white/10 text-zinc-500 hover:text-white"
            >
              <X size={12} />
            </button>
          </div>
        ))}
      </div>
      <div className="flex-1 relative overflow-hidden">
        <div
          ref={editorRef}
          className="absolute inset-0 overflow-auto text-sm [&>.cm-editor]:h-full"
        />
      </div>
    </div>
  );
};

// Temp mock for Monitor icon (imported above in final version, or just removed)
import { Monitor } from 'lucide-react';
