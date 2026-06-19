import React, { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon as X, CodeIcon as Code, PlayIcon as Play, SendIcon as Send, ChevronRightIcon as ChevronRight } from '@animateicons/react/lucide';
import { Maximize2, Minimize2, CheckCircle, Save, GitFork, Copy, Download, ChevronLeft } from 'lucide-react';
import { Button } from '@src/shared/components/ui/button';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Sandpack } from '@codesandbox/sandpack-react';
import { PythonSandbox } from '../../chat/components/PythonSandbox';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { toast } from '@src/shared/components/ui/sonner';
import { ChatMessage } from '@src/infrastructure/types';

export interface ArtifactCanvasProps {
  id?: string;
  content: string;
  language?: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
  onSubmitPrompt?: (prompt: string) => void;
  history?: ChatMessage[];
}

export const ArtifactCanvas: React.FC<ArtifactCanvasProps> = ({
  id,
  content,
  language = 'html',
  title = 'Artifact',
  isOpen,
  onClose,
  onSubmitPrompt,
  history = [],
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diff'>('preview');
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const activeProjectId = useNyxStore((s) => s.activeProjectId);

  // Track original content to show diff comparisons
  const originalContentRef = useRef<string>(content);
  useEffect(() => {
    if (!originalContentRef.current && content) {
      originalContentRef.current = content;
    }
  }, [content]);

  // Version history compiled from message history
  const versions = useMemo(() => {
    const list: { content: string; title: string; language?: string; version: number }[] = [];
    history.forEach((msg) => {
      msg.artifacts?.forEach((art) => {
        const isMatch = (art.id && id && art.id === id) || (art.title === title);
        if (isMatch) {
          list.push({
            content: art.content,
            title: art.title,
            language: art.language || language,
            version: list.length + 1,
          });
        }
      });
    });

    if (list.length === 0) {
      return [{ content, title, language, version: 1 }];
    }
    return list;
  }, [history, id, title, content, language]);

  // Auto-switch to latest version when a new version arrives
  useEffect(() => {
    setSelectedVersionIndex(versions.length - 1);
  }, [versions.length]);

  const displayedArtifact = useMemo(() => {
    if (selectedVersionIndex !== null && versions[selectedVersionIndex]) {
      return versions[selectedVersionIndex];
    }
    return { content, title, language };
  }, [selectedVersionIndex, versions, content, title, language]);

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
        // safely ignore
      }
    });

    editor.onDidDispose(() => {
      listener.dispose();
    });
  };

  const handleDiffEditorDidMount = (editor: any) => {
    const originalDispose = editor.dispose;
    editor.dispose = () => {
      try {
        editor.setModel({
          original: null,
          modified: null,
        });
      } catch (err) {
        // safely ignore
      }
      try {
        originalDispose.call(editor);
      } catch (err) {
        // safely ignore
      }
    };
  };

  const handleRequestEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editInstruction.trim() || !selection || !onSubmitPrompt) return;

    const promptText = `Please edit the selected lines in the active artifact "${displayedArtifact.title}":
Lines ${selection.startLine}-${selection.endLine}:
\`\`\`
${selection.text}
\`\`\`

User instructions to modify this selection: ${editInstruction}`;

    onSubmitPrompt(promptText);
    setEditInstruction('');
    setSelection(null);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(displayedArtifact.content);
    setCopied(true);
    toast.success('Code copied to clipboard!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const fileName = `${displayedArtifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${displayedArtifact.language || 'txt'}`;
    const blob = new Blob([displayedArtifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported: ${fileName}`);
  };

  const handleSaveToProject = () => {
    if (!activeProjectId) {
      handleDownload();
      return;
    }
    const saved = localStorage.getItem('nyx_projects');
    if (!saved) return;

    const projects = JSON.parse(saved);
    const projIdx = projects.findIndex((p: any) => p.id === activeProjectId);
    if (projIdx === -1) return;

    const fileName = `${displayedArtifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${displayedArtifact.language || 'txt'}`;
    const fileContent = displayedArtifact.content;

    const newFile = {
      id: `f-${Date.now()}`,
      name: fileName,
      type: 'file' as const,
      contentType: 'code' as const,
      size: `${Math.round((fileContent.length / 1024) * 10) / 10} KB`,
      modified: 'Just now',
      content: fileContent,
    };

    const existingIdx = projects[projIdx].files.findIndex((f: any) => f.name === fileName);
    if (existingIdx > -1) {
      projects[projIdx].files[existingIdx] = {
        ...projects[projIdx].files[existingIdx],
        content: fileContent,
        size: newFile.size,
        modified: 'Just now',
      };
      toast.success(`Updated "${fileName}" in project workspace.`);
    } else {
      projects[projIdx].files.push(newFile);
      toast.success(`Saved "${fileName}" to project workspace.`);
    }

    localStorage.setItem('nyx_projects', JSON.stringify(projects));
    window.dispatchEvent(new Event('nyx:projects-updated'));
  };

  const handleFork = () => {
    if (!onSubmitPrompt) return;
    onSubmitPrompt(
      `Forking artifact "${displayedArtifact.title}". Let's start building off this code:\n\n\`\`\`${displayedArtifact.language || ''}\n${displayedArtifact.content}\n\`\`\``
    );
    toast.info('Forked code into a new prompt branch.');
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

  const isPreviewable = ['html', 'react', 'javascript', 'js', 'jsx', 'tsx', 'typescript', 'ts', 'svg', 'python', 'py'].includes(displayedArtifact.language?.toLowerCase() || '');

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
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/40 shrink-0">
          <div className="font-semibold text-xs flex items-center gap-2 tracking-wide text-foreground uppercase truncate max-w-[50%]">
            {isPreviewable ? <Play className="w-3.5 h-3.5 text-emerald-500 shrink-0" /> : <Code className="w-3.5 h-3.5 text-blue-500 shrink-0" />}
            <span className="truncate">{displayedArtifact.title}</span>
          </div>

          {/* Version Switcher */}
          {versions.length > 1 && selectedVersionIndex !== null && (
            <div className="flex items-center gap-1.5 bg-[#18181b]/50 px-2 py-0.5 rounded-full border border-border/60 shadow-sm">
              <button
                disabled={selectedVersionIndex === 0}
                onClick={() => setSelectedVersionIndex((prev) => (prev !== null ? prev - 1 : null))}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Previous Version"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono font-medium text-muted-foreground select-none">
                v{selectedVersionIndex + 1} of {versions.length}
              </span>
              <button
                disabled={selectedVersionIndex === versions.length - 1}
                onClick={() => setSelectedVersionIndex((prev) => (prev !== null ? prev + 1 : null))}
                className="p-0.5 text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Next Version"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1.5">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Save to Project"
              onClick={handleSaveToProject}
            >
              <Save className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Fork Code"
              onClick={handleFork}
            >
              <GitFork className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Copy"
              onClick={handleCopy}
            >
              <Copy className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-foreground cursor-pointer"
              title="Export File"
              onClick={handleDownload}
            >
              <Download className="w-4 h-4" />
            </Button>
            <div className="h-4 w-px bg-border mx-1" />
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <Minimize2 className="w-4 h-4 text-muted-foreground" /> : <Maximize2 className="w-4 h-4 text-muted-foreground" />}
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 hover:bg-destructive/10 hover:text-destructive" onClick={onClose}>
              <X className="w-4.5 h-4.5" />
            </Button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-border px-3 pt-2 gap-2 bg-muted/20 shrink-0">
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
              {['react', 'jsx', 'tsx', 'typescript', 'ts', 'javascript', 'js'].includes((displayedArtifact.language || '').toLowerCase()) ? (
                <Sandpack
                  template="react"
                  theme="dark"
                  files={{
                    '/App.js': displayedArtifact.content,
                  }}
                  options={{
                    showNavigator: false,
                    showTabs: false,
                    externalResources: ['https://cdn.tailwindcss.com'],
                  }}
                />
              ) : ['python', 'py'].includes((displayedArtifact.language || '').toLowerCase()) ? (
                <PythonSandbox code={displayedArtifact.content} />
              ) : (
                <iframe
                  title="Artifact HTML Preview"
                  srcDoc={displayedArtifact.content}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-modals allow-popups"
                />
              )}
            </div>
          ) : activeTab === 'diff' ? (
            <div className="w-full h-full overflow-hidden bg-zinc-950">
              <DiffEditor
                key={`diff-${id || title}`}
                height="100%"
                language={getLanguageFromExt(displayedArtifact.language || language)}
                original={originalContentRef.current || ''}
                modified={displayedArtifact.content}
                onMount={handleDiffEditorDidMount}
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
                  language={getLanguageFromExt(displayedArtifact.language || language)}
                  value={displayedArtifact.content}
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
