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
} from 'lucide-react';
import { Button } from '@src/shared/components/ui/button';
import Editor, { DiffEditor } from '@monaco-editor/react';
import { Sandpack } from '@codesandbox/sandpack-react';
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
        const isMatch = (art.id && id && art.id === id) || art.title === title;
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
    if (!isPreviewable || isSlidev || isMermaid || isReact || isPython) return '';
    const tailwindScript = '<script src="https://cdn.tailwindcss.com"></script>';
    const chartJsScript = '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>';
    const d3Script = '<script src="https://cdn.jsdelivr.net/npm/d3@7"></script>';
    const fontLinks =
      '<link href="https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&family=Geist:wght@400;500;600&family=Geist+Mono:wght@400;500;600&display=swap" rel="stylesheet">';

    let htmlContent = displayedArtifact.content || '';
    // Strip markdown code fences if content was stored with ```html ... ```
    htmlContent = htmlContent
      .replace(/^```(?:html|svg|diagram-design|diagram)?\s*\n?/i, '')
      .replace(/\n?```\s*$/i, '')
      .trim();

    if (!htmlContent.trim()) {
      htmlContent = generateFallbackFlowchartSvg(
        displayedArtifact.title || 'Architecture & Evolution Diagram'
      );
    }

    if (
      displayedArtifact.language?.toLowerCase() === 'svg' ||
      (/^<svg\b/i.test(htmlContent.trim()) && !htmlContent.includes('<html'))
    ) {
      htmlContent = `<div class="diagram-container flex items-center justify-center w-full my-auto">${htmlContent}</div>`;
    }

    if (!htmlContent.includes('<head>') && !htmlContent.includes('<html')) {
      return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    ${fontLinks}
    ${tailwindScript}
    ${chartJsScript}
    ${d3Script}
    <style>
      *, *::before, *::after { box-sizing: border-box; }
      html, body {
        margin: 0;
        padding: 24px;
        background: #09090b;
        color: #f5f5f5;
        font-family: "Geist", -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        min-height: 100vh;
        width: 100%;
        box-sizing: border-box;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
      }
      .diagram-container {
        width: 100%;
        max-width: 1080px;
        margin: auto;
        display: flex;
        justify-content: center;
        align-items: center;
      }
      svg {
        max-width: 100%;
        height: auto;
        display: block;
        margin: auto;
      }
    </style>
  </head>
  <body>
    ${htmlContent}
  </body>
</html>`;
    }

    return htmlContent.replace(
      '</head>',
      `${fontLinks}\n${tailwindScript}\n${chartJsScript}\n${d3Script}\n</head>`
    );
  }, [
    displayedArtifact.content,
    displayedArtifact.language,
    isPreviewable,
    isMermaid,
    isReact,
    isPython,
  ]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 300 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 300 }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className={`bg-[#000000] border-l border-white/10 flex flex-col z-30 shadow-2xl overflow-hidden ${
          isFullscreen
            ? 'fixed inset-0 w-full h-full'
            : 'w-[clamp(450px,50vw,800px)] h-full relative'
        }`}
      >
        {/* Header Toolbar */}
        <div className="flex items-center justify-between p-3 border-b border-white/10 bg-[#0a0a0a] shrink-0 select-none">
          <div className="font-semibold text-xs flex items-center gap-2 tracking-wide text-zinc-100 uppercase truncate max-w-[50%]">
            {isPreviewable ? (
              <Play className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
            ) : (
              <Code className="w-3.5 h-3.5 text-zinc-300 shrink-0" />
            )}
            <span className="truncate">{displayedArtifact.title}</span>
          </div>

          {/* Version Switcher */}
          {versions.length > 1 && selectedVersionIndex !== null && (
            <div className="flex items-center gap-1.5 bg-zinc-900 px-2 py-0.5 rounded-full border border-white/10 shadow-sm">
              <button
                disabled={selectedVersionIndex === 0}
                onClick={() => setSelectedVersionIndex((prev) => (prev !== null ? prev - 1 : null))}
                className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Previous Version"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <span className="text-[10px] font-mono font-medium text-zinc-400 select-none">
                v{selectedVersionIndex + 1} of {versions.length}
              </span>
              <button
                disabled={selectedVersionIndex === versions.length - 1}
                onClick={() => setSelectedVersionIndex((prev) => (prev !== null ? prev + 1 : null))}
                className="p-0.5 text-zinc-400 hover:text-white disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer"
                title="Next Version"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              title="Save to Project"
              onClick={handleSaveToProject}
            >
              <Save className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              title="Fork Code"
              onClick={handleFork}
            >
              <GitFork className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              title="Copy"
              onClick={handleCopy}
            >
              <Copy className="w-3.5 h-3.5" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              title="Export File"
              onClick={handleDownload}
            >
              <Download className="w-3.5 h-3.5" />
            </Button>
            <div className="h-4 w-px bg-white/10 mx-1" />
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? (
                <Minimize2 className="w-3.5 h-3.5 text-zinc-300" />
              ) : (
                <Maximize2 className="w-3.5 h-3.5 text-zinc-300" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-zinc-400 hover:text-white hover:bg-zinc-800 cursor-pointer"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Controls */}
        <div className="flex border-b border-white/10 px-3 pt-2 gap-2 bg-[#0a0a0a] shrink-0 select-none">
          {isPreviewable && (
            <button
              className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
                activeTab === 'preview'
                  ? 'border-white text-white'
                  : 'border-transparent text-zinc-400 hover:text-zinc-200'
              }`}
              onClick={() => setActiveTab('preview')}
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
            onClick={() => setActiveTab('code')}
          >
            Source Code
          </button>
          <button
            className={`px-3 py-1.5 text-xs font-medium border-b-2 transition-all cursor-pointer ${
              activeTab === 'diff'
                ? 'border-white text-white'
                : 'border-transparent text-zinc-400 hover:text-zinc-200'
            }`}
            onClick={() => setActiveTab('diff')}
          >
            Changes Diff
          </button>
        </div>

        {/* Content Viewer / Preview Area */}
        <div className="flex-1 overflow-hidden bg-[#000000] relative flex flex-col">
          {activeTab === 'preview' && isPreviewable ? (
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
                      recharts: '^2.7.2',
                      'chart.js': '^4.4.0',
                      'react-chartjs-2': '^5.2.0',
                      'framer-motion': '^10.12.16',
                      clsx: '^1.2.1',
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
                  sandbox="allow-scripts allow-same-origin allow-modals allow-popups"
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
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
