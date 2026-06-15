import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, X, Code, Play, Send, ChevronRight, CheckCircle } from 'lucide-react';
import { Button } from '@src/shared/components/ui/button';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Sandpack } from '@codesandbox/sandpack-react';
import { PythonSandbox } from '../../chat/components/PythonSandbox';

export interface ArtifactCanvasProps {
  content: string;
  language?: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt?: (prompt: string) => void;
}

export const ArtifactCanvas: React.FC<ArtifactCanvasProps> = ({
  content,
  language = 'html',
  title = 'Artifact',
  isOpen,
  onClose,
  onSubmitPrompt,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diff'>('preview');
  
  // Track original content to show diff comparisons
  const originalContentRef = useRef<string>(content);
  useEffect(() => {
    if (!originalContentRef.current && content) {
      originalContentRef.current = content;
    }
  }, [content]);

  // Code selections for target AI edits
  const [selection, setSelection] = useState<{
    text: string;
    startLine: number;
    endLine: number;
    startColumn: number;
    endColumn: number;
  } | null>(null);
  const [editInstruction, setEditInstruction] = useState('');
  const [editorInstance, setEditorInstance] = useState<any>(null);

  const handleEditorDidMount = (editor: any) => {
    setEditorInstance(editor);
    const listener = editor.onDidChangeCursorSelection((e: any) => {
      try {
        const model = editor.getModel();
        if (!model || typeof model.isDisposed !== 'function' || model.isDisposed()) return;
        const selectionText = model.getValueInRange(e.selection);
        if (selectionText && selectionText.trim().length > 0) {
          setSelection({
            text: selectionText,
            startLine: e.selection.startLineNumber,
            endLine: e.selection.endLineNumber,
            startColumn: e.selection.startColumn,
            endColumn: e.selection.endColumn,
          });
        } else {
          setSelection(null);
        }
      } catch (err) {
        // safely ignore or log
      }
    });

    editor.onDidDispose(() => {
      listener.dispose();
    });
  };

  const handleRequestEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInstruction.trim() || !selection || !onSubmitPrompt) return;

    const promptText = `Please edit the selected lines in the active artifact "${title}":
Lines ${selection.startLine}-${selection.endLine}:
\`\`\`
${selection.text}
\`\`\`

User instructions to modify this selection: ${editInstruction}`;

    onSubmitPrompt(promptText);
    setEditInstruction('');
    setSelection(null);
  };

  if (!isOpen) return null;

  const getLanguageFromExt = (lang: string) => {
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      py: 'python',
      html: 'html',
      css: 'css',
      json: 'json',
      svg: 'xml',
    };
    return map[lang.toLowerCase()] || lang;
  };

  const isPreviewable = ['html', 'react', 'javascript', 'js', 'jsx', 'tsx', 'typescript', 'ts', 'svg', 'python', 'py'].includes(language.toLowerCase());

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`bg-card border-l border-border flex flex-col z-30 shadow-2xl overflow-hidden ${
          isFullscreen ? 'fixed inset-0 w-full h-full' : 'w-[clamp(450px,50vw,800px)] h-full relative'
        }`}
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/40">
          <div className="font-semibold text-xs flex items-center gap-2 tracking-wide text-foreground uppercase">
            {isPreviewable ? <Play className="w-3.5 h-3.5 text-emerald-500" /> : <Code className="w-3.5 h-3.5 text-blue-500" />}
            <span>{title}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-muted-foreground" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" onClick={onClose}>
              <X className="w-4.5 h-4.5" />
            </Button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-border px-3 pt-2 gap-2 bg-muted/20">
          {isPreviewable && (
            <button
              className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
                activeTab === 'preview' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
              onClick={() => setActiveTab('preview')}
            >
              Live Preview
            </button>
          )}
          <button
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'code' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('code')}
          >
            Source Code
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-semibold border-b-2 transition-all cursor-pointer ${
              activeTab === 'diff' ? 'border-primary text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setActiveTab('diff')}
          >
            Changes Diff
          </button>
        </div>

        {/* Content Viewer / Preview Area */}
        <div className="flex-1 overflow-hidden bg-background relative flex flex-col">
          {activeTab === 'preview' && isPreviewable ? (
            <div className="w-full h-full bg-white relative overflow-hidden flex flex-col">
              {['react', 'jsx', 'tsx', 'typescript', 'ts', 'javascript', 'js'].includes(language.toLowerCase()) ? (
                <Sandpack
                  template="react"
                  theme="dark"
                  files={{
                    '/App.js': content,
                  }}
                  options={{
                    showNavigator: false,
                    showTabs: false,
                    externalResources: ['https://cdn.tailwindcss.com'],
                  }}
                />
              ) : ['python', 'py'].includes(language.toLowerCase()) ? (
                <PythonSandbox code={content} />
              ) : (
                <iframe
                  title="Artifact HTML Preview"
                  srcDoc={content}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-modals allow-popups"
                />
              )}
            </div>
          ) : activeTab === 'diff' ? (
            <div className="w-full h-full overflow-hidden bg-zinc-950">
              <DiffEditor
                height="100%"
                language={getLanguageFromExt(language)}
                original={originalContentRef.current || ''}
                modified={content}
                theme="vs-dark"
                options={{
                  readOnly: true,
                  minimap: { enabled: false },
                  fontSize: 13,
                  fontFamily: 'JetBrains Mono, monospace',
                  wordWrap: 'on',
                }}
              />
            </div>
          ) : (
            <div className="w-full h-full relative overflow-hidden bg-zinc-950 flex flex-col">
              <div className="flex-1">
                <Editor
                  height="100%"
                  language={getLanguageFromExt(language)}
                  value={content}
                  onMount={handleEditorDidMount}
                  theme="vs-dark"
                  options={{
                    minimap: { enabled: true },
                    fontSize: 13,
                    fontFamily: 'JetBrains Mono, monospace',
                    wordWrap: 'on',
                    lineNumbers: 'on',
                    automaticLayout: true,
                  }}
                />
              </div>

              {/* Floating Selection AI Edit prompt-chip (OpenAI Canvas style) */}
              <AnimatePresence>
                {selection && onSubmitPrompt && (
                  <motion.div
                    initial={{ opacity: 0, y: 30 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 30 }}
                    className="absolute bottom-4 left-4 right-4 bg-popover border border-border shadow-xl rounded-lg p-3 z-40"
                  >
                    <form onSubmit={handleRequestEdit} className="flex flex-col gap-2">
                      <div className="text-[10px] text-muted-foreground font-semibold flex items-center gap-1.5 uppercase">
                        <CheckCircle className="w-3.5 h-3.5 text-primary" />
                        <span>Selected Lines {selection.startLine} - {selection.endLine}</span>
                      </div>
                      <div className="flex gap-2 items-center">
                        <input
                          type="text"
                          value={editInstruction}
                          onChange={(e) => setEditInstruction(e.target.value)}
                          placeholder={`Ask AI to edit this selected block...`}
                          className="flex-1 text-xs px-3 py-2 bg-muted/60 border border-border rounded-md focus:outline-none focus:ring-1 focus:ring-primary text-foreground"
                          autoFocus
                        />
                        <Button type="submit" size="icon" className="h-8 w-8 shrink-0">
                          <Send className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    </form>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
