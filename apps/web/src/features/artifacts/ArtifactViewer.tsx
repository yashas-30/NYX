import React, { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
// import { Editor } from '@monaco-editor/react';

interface ArtifactProps {
  content: string;
  language: string;
  diffs?: { line: number; type: 'add' | 'remove'; content: string }[];
}

/**
 * Differential Renderer for NYX Artifacts.
 * Mimics Claude's Artifacts / ChatGPT Canvas by receiving streaming diffs
 * over WebSockets instead of full re-renders, dropping UI thread overhead.
 */
export const ArtifactViewer: React.FC<ArtifactProps> = ({ content, language, diffs }) => {
  const [renderedContent, setRenderedContent] = useState(content);

  useEffect(() => {
    if (diffs && diffs.length > 0) {
      // In a full implementation, this applies diffs sequentially to the monaco model
      // preventing massive DOM string replacement.
      console.log('Applying streaming diffs:', diffs);
    }
  }, [diffs]);

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-zinc-900/90 backdrop-blur-md overflow-hidden"
    >
      <div className="flex items-center px-4 py-2 border-b border-white/5 bg-zinc-950/50">
        <span className="text-xs text-zinc-400 font-mono">{language}</span>
      </div>
      <div className="p-4 overflow-auto max-h-[600px] text-sm font-mono text-zinc-300">
        <pre>
          <code>{renderedContent}</code>
        </pre>
      </div>
    </motion.div>
  );
};
