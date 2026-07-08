import React, { useEffect, useState, useRef } from 'react';
import { motion } from 'framer-motion';
import { Editor, Monaco } from '@monaco-editor/react';
import type { editor } from 'monaco-editor';

interface ArtifactProps {
  content: string;
  language: string;
  diffs?: { line: number; type: 'add' | 'remove'; content: string }[];
}

/**
 * Interactive Differential Renderer for NYX Artifacts.
 * Uses Monaco Editor for high-performance syntax highlighting and diff applying.
 */
export const ArtifactViewer: React.FC<ArtifactProps> = ({ content, language, diffs }) => {
  const [renderedContent, setRenderedContent] = useState(content);
  const editorRef = useRef<editor.IStandaloneCodeEditor | null>(null);

  useEffect(() => {
    // If we have streaming diffs and the editor is ready, we could apply edits directly
    // to the monaco model. For now, we update the full content string.
    if (!diffs || diffs.length === 0) {
      setRenderedContent(content);
    }
  }, [content, diffs]);

  const handleEditorDidMount = (editor: editor.IStandaloneCodeEditor, monaco: Monaco) => {
    editorRef.current = editor;
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card overflow-hidden flex flex-col h-[600px] w-full"
    >
      <div className="flex items-center px-4 py-2 border-b border-border bg-muted/40 justify-between shrink-0">
        <span className="text-xs text-muted-foreground font-mono flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
          Artifact: {language}
        </span>
        <div className="flex items-center gap-2">
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Copy</button>
          <button className="text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer">Apply</button>
        </div>
      </div>
      <div className="flex-1 min-h-0 w-full relative">
        <Editor
          height="100%"
          language={language.toLowerCase()}
          theme="vs-dark"
          value={renderedContent}
          onMount={handleEditorDidMount}
          options={{
            readOnly: true,
            minimap: { enabled: false },
            fontSize: 13,
            fontFamily: 'var(--font-geist-mono)',
            padding: { top: 16, bottom: 16 },
            scrollBeyondLastLine: false,
            smoothScrolling: true,
            cursorBlinking: 'smooth',
            lineNumbers: 'on',
            renderLineHighlight: 'all',
            wordWrap: 'on'
          }}
        />
      </div>
    </motion.div>
  );
};
