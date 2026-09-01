import React, { useState, useEffect, useRef, useMemo } from 'react';
import DOMPurify from 'dompurify';
import { motion, AnimatePresence } from 'framer-motion';
import {
  XIcon as X,
  CodeIcon as Code,
  PlayIcon as Play,
  SendIcon as Send,
  ChevronRightIcon as ChevronRight,
} from '@animateicons/react/lucide';
import {
  Maximize2,
  Minimize2,
  CheckCircle,
  Save,
  GitFork,
  Copy,
  Download,
  ChevronLeft,
  RefreshCw,
} from 'lucide-react';
import { Button } from '@src/shared/components/ui/button';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { PythonSandbox } from '../../chat/components/PythonSandbox';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { toast } from '@src/shared/components/ui/sonner';
import { ChatMessage } from '@src/infrastructure/types';
import { PresentationDeck } from '../../presentation/components/PresentationDeck';
import { isSlidevContent } from '../utils/slidevParser';
import { exportSlidevToPptx } from '../utils/pptxExporter';
import {
  sanitizeMermaidCode,
  generateFallbackFlowchartSvg,
} from '../../../components/chat/CodeBlock';
import { buildLivePreviewSrcDoc } from '../../../shared/utils/livePreviewRunner';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';

function getLanguageFromExt(langOrExt?: string): string {
  if (!langOrExt) return 'plaintext';
  const l = langOrExt.toLowerCase().trim().replace(/^\./, '');
  const map: Record<string, string> = {
    js: 'javascript',
    jsx: 'javascript',
    ts: 'typescript',
    tsx: 'typescript',
    py: 'python',
    rs: 'rust',
    html: 'html',
    css: 'css',
    json: 'json',
    md: 'markdown',
    markdown: 'markdown',
    slidev: 'markdown',
    slides: 'markdown',
    presentation: 'markdown',
    sql: 'sql',
    sh: 'shell',
    bash: 'shell',
    yaml: 'yaml',
    yml: 'yaml',
    c: 'c',
    cpp: 'cpp',
    cs: 'csharp',
    go: 'go',
    java: 'java',
    kotlin: 'kotlin',
    xml: 'xml',
  };
  return map[l] || l;
}

// ---------------------------------------------------------------------------
// MermaidRenderer — dynamically imports mermaid and renders SVG in-component.
// On failure, produces an editorial diagram-design styled SVG fallback.
// ---------------------------------------------------------------------------
const MermaidRenderer: React.FC<{ content: string; onFallback?: (svgHtml: string) => void }> = ({
  content,
  onFallback,
}) => {
  const [svg, setSvg] = React.useState<string>('');
  const [failed, setFailed] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const render = async () => {
      try {
        const cleaned = sanitizeMermaidCode(content);
        const mermaid = (await import('mermaid')).default;
        mermaid.initialize({
          startOnLoad: false,
          suppressErrorRendering: true,
          theme: 'dark',
          darkMode: true,
          background: 'transparent',
          themeVariables: {
            primaryColor: '#f08a59',
            primaryTextColor: '#f5f5f5',
            primaryBorderColor: 'rgba(255,255,255,0.12)',
            lineColor: '#a1a1aa',
            sectionBkgColor: '#121214',
            altSectionBkgColor: '#09090b',
            gridColor: '#27272a',
            secondaryColor: '#121214',
            tertiaryColor: '#09090b',
            fontFamily: 'Geist, Inter, system-ui, sans-serif',
          },
        } as any);
        const id = `mermaid-canvas-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(id, cleaned);
        if (!cancelled) setSvg(rendered);
      } catch {
        if (!cancelled) {
          const fallbackSvg = generateFallbackFlowchartSvg(content);
          setSvg(fallbackSvg);
          setFailed(true);
          onFallback?.(fallbackSvg);
        }
      } finally {
        if (typeof document !== 'undefined') {
          const orphans = document.querySelectorAll(
            'body > [id^="dmermaid"], body > .mermaid-error, body > svg[id^="mermaid-"]'
          );
          orphans.forEach((el) => el.remove());
        }
      }
    };
    render();
    return () => {
      cancelled = true;
    };
  }, [content]);

  if (!svg) {
    return (
      <div className="flex items-center justify-center p-8 text-xs font-mono text-zinc-500 animate-pulse">
        Rendering diagram in Canvas...
      </div>
    );
  }

  // Render inside an iframe so the editorial SVG gets proper dark background + font context
  const iframeDoc = `<!DOCTYPE html><html><head>
    <meta charset="UTF-8">
    <link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap" rel="stylesheet">
    <style>
      html,body{margin:0;padding:16px;background:#09090b;min-height:100vh;display:flex;align-items:center;justify-content:center;box-sizing:border-box;}
      svg{max-width:100%;height:auto;display:block;margin:auto;}
    </style>
  </head><body>${DOMPurify.sanitize(svg, {
    USE_PROFILES: { svg: true, html: true, svgFilters: true },
    ADD_TAGS: ['style', 'defs', 'marker', 'path', 'rect', 'circle', 'text', 'g', 'line', 'polygon'],
    ADD_ATTR: [
      'viewBox',
      'xmlns',
      'fill',
      'stroke',
      'stroke-width',
      'stroke-dasharray',
      'd',
      'rx',
      'ry',
      'x',
      'y',
      'x1',
      'y1',
      'x2',
      'y2',
      'font-family',
      'font-size',
      'font-weight',
      'text-anchor',
      'marker-end',
      'refX',
      'refY',
      'markerWidth',
      'markerHeight',
      'orient',
    ],
  } as any)}</body></html>`;

  return (
    <iframe
      srcDoc={iframeDoc}
      title="Diagram"
      sandbox="allow-scripts allow-same-origin"
      className="w-full h-full border-0"
      style={{ minHeight: '320px', background: '#09090b' }}
    />
  );
};

export interface ArtifactCanvasProps {
  id?: string;
  content: string;
  language?: string;
  title?: string;
  isOpen: boolean;
  isStreaming?: boolean;
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
  isStreaming = false,
  onClose,
  onSubmitPrompt,
  history = [],
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'diff'>(() =>
    isStreaming ? 'code' : 'preview'
  );
  const [selectedVersionIndex, setSelectedVersionIndex] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const prevStreamingRef = useRef(isStreaming);
  const userOverrodeTab = useRef(false);

  const activeProjectId = useNyxStore((s) => s.activeProjectId);

  // Track original content to show diff comparisons
  const originalContentRef = useRef<string>(content);
  useEffect(() => {
    if (!originalContentRef.current && content) {
      originalContentRef.current = content;
    }
  }, [content]);

  // Track previous id to reset version selection when switching artifacts
  const prevIdRef = useRef(id);
  useEffect(() => {
    if (prevIdRef.current !== id) {
      prevIdRef.current = id;
      setSelectedVersionIndex(null);
    }
  }, [id]);

  // Version history compiled from message history
  const versions = useMemo(() => {
    if (!id) {
      return [{ content, title, language, version: 1 }];
    }
    const list: { content: string; title: string; language?: string; version: number }[] = [];
    history.forEach((msg) => {
      msg.artifacts?.forEach((art) => {
        const isMatch = art.id && id && art.id === id;
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

  const displayedArtifact = useMemo(() => {
    if (selectedVersionIndex !== null && versions[selectedVersionIndex]) {
      return versions[selectedVersionIndex];
    }
    return { content, title, language };
  }, [selectedVersionIndex, versions, content, title, language]);

  const [refreshKey, setRefreshKey] = useState(0);
  const [debouncedPreviewCode, setDebouncedPreviewCode] = useState(content);

  useEffect(() => {
    if (!isStreaming) {
      setDebouncedPreviewCode(displayedArtifact.content || '');
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedPreviewCode(displayedArtifact.content || '');
    }, 400);
    return () => clearTimeout(timer);
  }, [displayedArtifact.content, isStreaming]);

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
    let isDisposed = false;
    const listener = editor.onDidChangeCursorSelection((e: any) => {
      if (isDisposed) return;
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

    try {
      editor.onDidDispose(() => {
        isDisposed = true;
        try {
          listener?.dispose?.();
        } catch {}
      });
    } catch {}
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

  const isSlidev = useMemo(() => {
    const lang = (displayedArtifact.language || '').toLowerCase();
    const type = ((displayedArtifact as any).type || '').toLowerCase();
    return (
      ['slidev', 'slides', 'presentation', 'ppt'].includes(lang) ||
      ['slidev', 'presentation', 'slides'].includes(type) ||
      isSlidevContent(displayedArtifact.content)
    );
  }, [displayedArtifact.language, displayedArtifact.content]);

  const handleDownload = async () => {
    if (isSlidev) {
      toast.info('Generating PowerPoint presentation (.pptx)...');
      try {
        const success = await exportSlidevToPptx(displayedArtifact.content, {
          fileName: displayedArtifact.title || 'presentation',
        });
        if (success) {
          toast.success('PowerPoint (.pptx) file downloaded successfully!');
          return;
        }
      } catch (err: any) {
        console.warn('PPTX export error, falling back to markdown export:', err);
      }
    }
    const ext = isSlidev ? 'md' : displayedArtifact.language || 'txt';
    const fileName = `${displayedArtifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${ext}`;
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

    const ext = isSlidev ? 'md' : displayedArtifact.language || 'txt';
    const fileName = `${displayedArtifact.title.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.${ext}`;
    const fileContent = displayedArtifact.content;

    const newFile = {
      id: `f-${Date.now()}`,
      name: fileName,
      type: 'file' as const,
      contentType: isSlidev ? ('slidev' as const) : ('code' as const),
      size: `${Math.round((fileContent.length / 1024) * 10) / 10} KB`,
      modified: 'Just now',
      content: fileContent,
    };

    const existingIdx = projects[projIdx].files.findIndex((f: any) => f.name === fileName);
    if (existingIdx > -1) {
      projects[projIdx].files[existingIdx] = {
        ...projects[projIdx].files[existingIdx],
        content: fileContent,
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

  const hasSvgOrHtml =
    /<svg\b/i.test(displayedArtifact.content) ||
    /<!DOCTYPE\s+html/i.test(displayedArtifact.content) ||
    /<html\b/i.test(displayedArtifact.content) ||
    /<div\b/i.test(displayedArtifact.content);

  const isMermaid =
    !hasSvgOrHtml &&
    (displayedArtifact.language?.toLowerCase() === 'mermaid' ||
      /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|C4Context|C4Container|C4Component)\b/i.test(
        displayedArtifact.content.replace(/^```(?:mermaid)?\s*/i, '').trim()
      ));

  const isDiagramDesign =
    hasSvgOrHtml &&
    (['diagram', 'html', 'svg', 'diagram-design'].includes(
      displayedArtifact.language?.toLowerCase() || ''
    ) ||
      (displayedArtifact as any).type === 'diagram' ||
      /<svg\b/i.test(displayedArtifact.content));

  const isReact =
    !hasSvgOrHtml &&
    (['jsx', 'tsx', 'react'].includes(displayedArtifact.language?.toLowerCase() || '') ||
      ((displayedArtifact.language?.toLowerCase() === 'typescript' ||
        displayedArtifact.language?.toLowerCase() === 'javascript' ||
        displayedArtifact.language?.toLowerCase() === 'ts' ||
        displayedArtifact.language?.toLowerCase() === 'js') &&
        (displayedArtifact.content.includes('import React') ||
          displayedArtifact.content.includes('from "lucide-react"') ||
          displayedArtifact.content.includes("from 'recharts'") ||
          displayedArtifact.content.includes('from "recharts"'))));
  const isPython =
    displayedArtifact.language?.toLowerCase() === 'python' ||
    displayedArtifact.language?.toLowerCase() === 'py';
  const isPreviewable =
    isSlidev ||
    isMermaid ||
    isDiagramDesign ||
    isReact ||
    isPython ||
    ['html', 'htm', 'svg', 'javascript', 'js', 'xml', 'chart', 'diagram'].includes(
      displayedArtifact.language?.toLowerCase() || ''
    ) ||
    hasSvgOrHtml;

  const iframeSrcDoc = useMemo(() => {
    if (!isPreviewable || isSlidev || isMermaid || isPython) return '';
    return buildLivePreviewSrcDoc(
      debouncedPreviewCode || '',
      displayedArtifact.language || (isReact ? 'jsx' : 'html')
    );
  }, [
    debouncedPreviewCode,
    displayedArtifact.language,
    isPreviewable,
    isSlidev,
    isMermaid,
    isReact,
    isPython,
  ]);

  // Clean up Monaco model on unmount to prevent heap leaks
  useEffect(() => {
    return () => {
      try {
        if (editorInstance) {
          const model = editorInstance.getModel();
          if (model && typeof model.dispose === 'function') {
            model.dispose();
          }
        }
      } catch (e) {}
    };
  }, [editorInstance]);

  const decorationsRef = useRef<string[]>([]);

  // Automatically show 'code' tab while streaming, and switch to 'preview' once complete
  useEffect(() => {
    if (isStreaming) {
      if (!userOverrodeTab.current) {
        setActiveTab('code');
      }
    } else if (prevStreamingRef.current && !isStreaming) {
      if (!userOverrodeTab.current && isPreviewable) {
        setActiveTab('preview');
      }
    }
    prevStreamingRef.current = isStreaming;
  }, [isStreaming, isPreviewable]);

  // Auto-scroll Monaco Editor to the active edited line during streaming / editing
  useEffect(() => {
    if (!editorInstance) return;

    const lineCount = (displayedArtifact.content || '').split('\n').length;

    if (isStreaming) {
      try {
        editorInstance.revealLineInCenter(lineCount);

        // Highlight active streaming line with a glowing accent
        decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, [
          {
            range: {
              startLineNumber: lineCount,
              startColumn: 1,
              endLineNumber: lineCount,
              endColumn: 1,
            },
            options: {
              isWholeLine: true,
              className: 'bg-white/10 border-l-2 border-primary animate-pulse',
            },
          },
        ]);
      } catch (err) {}
    } else if (prevStreamingRef.current && !isStreaming) {
      // Clear line decoration and reveal bottom on completion
      try {
        decorationsRef.current = editorInstance.deltaDecorations(decorationsRef.current, []);
        editorInstance.revealLine(lineCount);
      } catch (err) {}
    }
  }, [displayedArtifact.content, isStreaming, editorInstance]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 50 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 50 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className={`fixed top-0 right-0 bottom-0 bg-[#09090b] border-l border-white/10 flex flex-col z-50 shadow-2xl transition-all ${
          isFullscreen ? 'left-0 w-full' : 'w-full md:w-[650px] lg:w-[750px] xl:w-[850px]'
        }`}
      >
        {/* Header Bar */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 bg-[#09090b] select-none">
          <div className="flex items-center gap-2 overflow-hidden">
            <span className="text-xs font-semibold uppercase tracking-wider text-zinc-300 truncate">
              {displayedArtifact.title}
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400 uppercase">
              {displayedArtifact.language}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {/* Version History Selector */}
            {versions.length > 1 && (
              <div className="flex items-center gap-1 mr-2 px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-xs text-zinc-400">
                <button
                  disabled={selectedVersionIndex === 0}
                  onClick={() =>
                    setSelectedVersionIndex((prev) =>
                      Math.max(0, (prev ?? versions.length - 1) - 1)
                    )
                  }
                  className="p-0.5 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                  title="Previous version"
                >
                  <ChevronLeft className="w-3 h-3" />
                </button>
                <span className="font-mono text-[10px]">
                  v{(selectedVersionIndex ?? versions.length - 1) + 1}/{versions.length}
                </span>
                <button
                  disabled={selectedVersionIndex === versions.length - 1}
                  onClick={() =>
                    setSelectedVersionIndex((prev) =>
                      Math.min(versions.length - 1, (prev ?? versions.length - 1) + 1)
                    )
                  }
                  className="p-0.5 hover:text-white disabled:opacity-30 disabled:hover:text-zinc-400"
                  title="Next version"
                >
                  <ChevronRight className="w-3 h-3" />
                </button>
              </div>
            )}

            {/* Copy Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5"
              onClick={handleCopy}
              title="Copy to clipboard"
            >
              {copied ? (
                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>

            {/* Download Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5"
              onClick={handleDownload}
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>

            {/* Save to Project */}
            {activeProjectId && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5"
                onClick={handleSaveToProject}
                title="Save to Project Files"
              >
                <Save className="w-3.5 h-3.5" />
              </Button>
            )}

            {/* Fullscreen Toggle */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? 'Exit full screen' : 'Full screen'}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5" />
              )}
            </Button>

            {/* Close Button */}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-white/5"
              onClick={onClose}
              title="Close panel"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>

        {/* Tab Navigation */}
        {/* Tab Navigation */}
        <div className="flex items-center justify-between px-4 border-b border-white/10 bg-[#09090b] gap-2 select-none">
          <div className="flex items-center gap-2">
            {isPreviewable && (
              <button
                className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                  activeTab === 'preview'
                    ? 'border-white text-white'
                    : 'border-transparent text-zinc-400 hover:text-zinc-200'
                }`}
                onClick={() => {
                  userOverrodeTab.current = true;
                  setActiveTab('preview');
                }}
              >
                Live Preview
              </button>
            )}
            <button
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                activeTab === 'code'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
              onClick={() => {
                userOverrodeTab.current = true;
                setActiveTab('code');
              }}
            >
              Source Code
            </button>
            <button
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                activeTab === 'diff'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
              onClick={() => {
                userOverrodeTab.current = true;
                setActiveTab('diff');
              }}
            >
              Changes Diff
            </button>
          </div>

          {activeTab === 'preview' && isPreviewable && (
            <button
              onClick={() => setRefreshKey((k) => k + 1)}
              className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] font-medium text-zinc-400 hover:text-white hover:bg-white/5 rounded-md border border-white/5 transition-all cursor-pointer"
              title="Restart Live Runtime"
            >
              <RefreshCw className="w-3 h-3" />
              <span>Reload Preview</span>
            </button>
          )}
        </div>

        {/* Content Viewer / Preview Area */}
        <div className="flex-1 overflow-hidden bg-[#000000] relative flex flex-col">
          {activeTab === 'preview' && isPreviewable ? (
            <ErrorBoundary name="ArtifactPreview">
              <div className="w-full h-full bg-[#000000] relative overflow-hidden flex flex-col">
                {isSlidev ? (
                  <div className="w-full h-full overflow-hidden bg-[#000000] flex flex-col">
                    <PresentationDeck
                      content={displayedArtifact.content}
                      title={displayedArtifact.title}
                      className="h-full my-0 border-none rounded-none"
                    />
                  </div>
                ) : isMermaid ? (
                  <div className="h-full overflow-auto bg-card flex items-center justify-center p-4">
                    <MermaidRenderer content={displayedArtifact.content} />
                  </div>
                ) : isPython ? (
                  <PythonSandbox code={displayedArtifact.content} />
                ) : (
                  <iframe
                    key={`artifact-preview-${refreshKey}`}
                    title="Artifact Live Preview"
                    srcDoc={iframeSrcDoc}
                    className="w-full h-full border-none bg-zinc-950"
                    sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms allow-downloads allow-pointer-lock"
                    allow="autoplay; camera; microphone; clipboard-write; web-share; fullscreen; accelerometer; gyroscope"
                  />
                )}
              </div>
            </ErrorBoundary>
          ) : activeTab === 'diff' ? (
            <ErrorBoundary name="ArtifactDiff">
              <div className="w-full h-full overflow-hidden bg-zinc-950">
                <DiffEditor
                  key="monaco-diff-editor"
                  height="100%"
                  language={getLanguageFromExt(displayedArtifact.language || language)}
                  original={originalContentRef.current || displayedArtifact.content || ''}
                  modified={displayedArtifact.content || ''}
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
            </ErrorBoundary>
          ) : (
            <ErrorBoundary name="ArtifactEditor">
              <div className="w-full h-full relative overflow-hidden bg-zinc-950 flex flex-col">
                <div className="flex-1">
                  <Editor
                    key="monaco-code-editor"
                    height="100%"
                    language={getLanguageFromExt(displayedArtifact.language || language)}
                    value={displayedArtifact.content || ''}
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
                          <span>
                            Selected Lines {selection.startLine} - {selection.endLine}
                          </span>
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
            </ErrorBoundary>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
