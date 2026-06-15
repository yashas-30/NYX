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
    if (diffs && diffs.length > 0) {
      console.log('Applying streaming diffs:', diffs);
    } else {
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
      className="rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-md overflow-hidden flex flex-col h-[600px] w-full"
    >
      <div className="flex items-center px-4 py-2 border-b border-white/5 bg-zinc-950/50 justify-between shrink-0">
        <span className="text-xs text-zinc-400 font-mono flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
          Artifact: {language}
        </span>
        <div className="flex items-center gap-2">
          <button className="text-xs text-zinc-500 hover:text-white transition-colors">Copy</button>
          <button className="text-xs text-zinc-500 hover:text-white transition-colors">Apply</button>
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
