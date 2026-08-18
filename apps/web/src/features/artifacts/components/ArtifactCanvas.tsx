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

// ---------------------------------------------------------------------------
// MermaidRenderer — dynamically imports mermaid and renders SVG in-component
// ---------------------------------------------------------------------------
const MermaidRenderer: React.FC<{ content: string }> = ({ content }) => {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = React.useState<string>('');
  const [error, setError] = React.useState<string>('');

  React.useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: 'dark',
          darkMode: true,
          background: 'transparent',
          themeVariables: {
            primaryColor: '#6366f1',
            primaryTextColor: '#e2e8f0',
            primaryBorderColor: '#4f46e5',
            lineColor: '#6366f1',
            sectionBkgColor: '#1e293b',
            altSectionBkgColor: '#0f172a',
            gridColor: '#334155',
            secondaryColor: '#1e293b',
            tertiaryColor: '#0f172a',
          },
        } as any);
        const id = `mermaid-canvas-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(id, content);
        if (!cancelled) setSvg(rendered);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Diagram error');
      } finally {
        if (typeof document !== 'undefined') {
          const orphans = document.querySelectorAll('body > [id^="dmermaid"], body > .mermaid-error, body > svg[id^="mermaid-"]');
          orphans.forEach(el => el.remove());
        }
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (error)
    return (
      <div className="p-4 text-red-400 text-xs font-mono">
        <p className="font-bold mb-1">Diagram parse error:</p>
        <p>{error}</p>
      </div>
    );

  if (!svg)
    return (
      <div className="flex items-center justify-center h-full text-white/20 text-sm">
        Rendering diagram...
      </div>
    );

  return (
    <div
      ref={ref}
      className="flex items-center justify-center p-4 min-h-full"
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};

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

  const isMermaid =
    ['mermaid'].includes(displayedArtifact.language?.toLowerCase() || '') ||
    /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph)\b/i.test(displayedArtifact.content);
  const isReact =
    ['jsx', 'tsx', 'react'].includes(displayedArtifact.language?.toLowerCase() || '') ||
    ((displayedArtifact.language?.toLowerCase() === 'typescript' || displayedArtifact.language?.toLowerCase() === 'javascript' || displayedArtifact.language?.toLowerCase() === 'ts' || displayedArtifact.language?.toLowerCase() === 'js') &&
      (displayedArtifact.content.includes('import React') || displayedArtifact.content.includes('from "lucide-react"') || displayedArtifact.content.includes('from \'recharts\'') || displayedArtifact.content.includes('from "recharts"')));
  const isPython =
    displayedArtifact.language?.toLowerCase() === 'python' || displayedArtifact.language?.toLowerCase() === 'py';
  const isPreviewable =
    isMermaid ||
    isReact ||
    isPython ||
    ['html', 'htm', 'svg', 'javascript', 'js', 'xml', 'chart'].includes(displayedArtifact.language?.toLowerCase() || '');

  const iframeSrcDoc = useMemo(() => {
    if (!isPreviewable || isMermaid || isReact || isPython) return '';
    const tailwindScript = '<script src="https://cdn.tailwindcss.com"></script>';
    const chartJsScript = '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>';
    const d3Script = '<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>';

    let htmlContent = displayedArtifact.content;
    if (displayedArtifact.language?.toLowerCase() === 'svg') {
      htmlContent = `<div class="flex items-center justify-center min-h-screen p-4">${displayedArtifact.content}</div>`;
    }

    if (!htmlContent.includes('<head>')) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${tailwindScript}
            ${chartJsScript}
            ${d3Script}
            <style>
              body { font-family: "SF Pro Display", "Geist Sans", -apple-system, BlinkMacSystemFont, sans-serif; color: #faf9f5; background: #121214; }
            </style>
          </head>
          <body class="p-6">
            ${htmlContent}
          </body>
        </html>
      `;
    }

    return htmlContent.replace('</head>', `${tailwindScript}\n${chartJsScript}\n${d3Script}\n</head>`);
  }, [displayedArtifact.content, displayedArtifact.language, isPreviewable, isMermaid, isReact, isPython]);

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
            <div className="w-full h-full bg-zinc-950 relative overflow-hidden flex flex-col">
              {isMermaid ? (
                <div className="h-full overflow-auto bg-card flex items-center justify-center p-4">
                  <MermaidRenderer content={displayedArtifact.content} />
                </div>
              ) : isReact ? (
                <Sandpack
                  template="react-ts"
                  theme="dark"
                  files={{
                    '/App.tsx': displayedArtifact.content,
                  }}
                  options={{
                    showNavigator: false,
                    showTabs: false,
                    externalResources: ['https://cdn.tailwindcss.com'],
                  }}
                  customSetup={{
                    dependencies: {
                      'lucide-react': '^0.263.1',
                      'recharts': '^2.7.2',
                      'chart.js': '^4.4.0',
                      'react-chartjs-2': '^5.2.0',
                      'framer-motion': '^10.12.16',
                      'clsx': '^1.2.1',
                      'tailwind-merge': '^1.13.2',
                    },
                  }}
                />
              ) : isPython ? (
                <PythonSandbox code={displayedArtifact.content} />
              ) : (
                <iframe
                  title="Artifact HTML Preview"
                  srcDoc={iframeSrcDoc}
                  className="w-full h-full border-none bg-zinc-950"
                  sandbox="allow-scripts allow-modals allow-popups"
                />
              )}
            </div>
          ) : activeTab === 'diff' ? (
            <div className="w-full h-full overflow-hidden bg-zinc-950">
              <DiffEditor
                height="100%"
                language={getLanguageFromExt(displayedArtifact.language || language)}
                original={originalContentRef.current || ''}
                modified={displayedArtifact.content}
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
