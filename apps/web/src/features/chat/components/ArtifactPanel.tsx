import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState, useMemo, useRef } from 'react';
import { Code, CornersOut as Maximize, CornersIn as Minimize, Play, Copy, DownloadSimple as Download, X } from '@phosphor-icons/react';
import { Sandpack } from '@codesandbox/sandpack-react';
import { PythonSandbox } from './PythonSandbox';

interface ArtifactPanelProps {
  artifact: {
    id: string;
    title: string;
    type: string;
    content: string;
    language?: string;
  };
  onClose: () => void;
}

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
        const id = `mermaid-${Date.now()}`;
        const { svg: rendered } = await mermaid.render(id, content);
        if (!cancelled) setSvg(rendered);
      } catch (e: any) {
        if (!cancelled) setError(e.message || 'Diagram error');
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

// ---------------------------------------------------------------------------
// ArtifactPanel
// ---------------------------------------------------------------------------
export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifact, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const isMermaid =
    artifact.type === 'mermaid' || artifact.language?.toLowerCase() === 'mermaid';
  const isReact =
    ['jsx', 'tsx', 'react'].includes(artifact.language?.toLowerCase() || '') ||
    ((artifact.language?.toLowerCase() === 'typescript' || artifact.language?.toLowerCase() === 'javascript' || artifact.language?.toLowerCase() === 'ts' || artifact.language?.toLowerCase() === 'js') &&
     artifact.content.includes('import React'));
  const isPython =
    artifact.type === 'python' || artifact.language?.toLowerCase() === 'python';
  const isRenderable =
    isMermaid ||
    ['html', 'svg', 'javascript'].includes(artifact.language?.toLowerCase() || '') ||
    isReact ||
    isPython;

  const [activeTab, setActiveTab] = useState<'code' | 'preview'>(
    isRenderable ? 'preview' : 'code',
  );

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${artifact.title.replace(/\s+/g, '_')}.${artifact.language || 'txt'}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const iframeSrcDoc = useMemo(() => {
    if (!isRenderable || isMermaid) return '';
    // Inject Tailwind for Claude-like generative UI
    const tailwindScript = '<script src="https://cdn.tailwindcss.com"></script>';

    // (Removed legacy Babel path for React)
    let htmlContent = artifact.content;
    if (artifact.language?.toLowerCase() === 'svg') {
      htmlContent = `<div class="flex items-center justify-center min-h-screen">${artifact.content}</div>`;
    }

    if (!htmlContent.includes('<head>')) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${tailwindScript}
            <style>              body { font-family: "SF Pro Display", "Geist Sans", -apple-system, BlinkMacSystemFont, sans-serif; color: #faf9f5; background: #181715; }
            </style>
            ${tailwindScript}
          </head>
          <body class="p-6">
            ${htmlContent}
          </body>
        </html>
      `;
    }

    // If it already has a head, just inject Tailwind before the closing head tag
    return htmlContent.replace('</head>', `${tailwindScript}</head>`);
  }, [artifact.content, artifact.language, isRenderable, isReact, isMermaid]);

  return (
    <div
      className={`
      flex flex-col bg-card border-l border-border transition-all duration-300 z-50
      ${isFullscreen ? 'fixed inset-0 w-full h-full' : 'absolute top-0 right-0 w-1/3 h-full min-w-[400px] max-w-[600px] shadow-md border border-border'}
    `}
    >
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-input border border-border/50 rounded text-primary">
            <AnimatedIcon icon={Code} className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-medium text-foreground">{artifact.title}</h3>
            <span className="text-[11px] font-mono text-muted-foreground">
              {artifact.type} {artifact.language ? `• ${artifact.language}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {isRenderable && (
            <div className="flex bg-input border border-border rounded p-1 mr-2">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${activeTab === 'preview' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <div className="flex items-center gap-1">
                  <Play className="w-3 h-3" /> Preview
                </div>
              </button>
              <button
                onClick={() => setActiveTab('code')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors cursor-pointer ${activeTab === 'code' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <div className="flex items-center gap-1">
                  <AnimatedIcon icon={Code} className="w-3 h-3" /> Code
                </div>
              </button>
            </div>
          )}

          <button
            onClick={handleCopy}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-input border border-transparent hover:border-border rounded transition-colors cursor-pointer"
            title="Copy Content"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-input border border-transparent hover:border-border rounded transition-colors cursor-pointer"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-input border border-transparent hover:border-border rounded transition-colors cursor-pointer"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <AnimatedIcon icon={Minimize} className="w-4 h-4" /> : <AnimatedIcon icon={Maximize} className="w-4 h-4" />}
          </button>
          <div className="w-px h-4 bg-border mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 border border-transparent hover:border-red-500/20 rounded transition-colors cursor-pointer"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-hidden bg-card relative">
        {activeTab === 'code' ? (
          <div className="h-full overflow-auto p-4 bg-background/30">
            <pre className="font-mono text-[13px] text-foreground/80 leading-relaxed whitespace-pre-wrap bg-background/50 p-4 rounded-md border border-border">
              {artifact.content}
            </pre>
          </div>
        ) : isMermaid ? (
          <div className="h-full overflow-auto bg-card">
            <MermaidRenderer content={artifact.content} />
          </div>
        ) : isReact ? (
          <div className="w-full h-full bg-card relative overflow-hidden flex flex-col">
            <Sandpack
              template="react-ts"
              theme="dark"
              files={{
                '/App.tsx': artifact.content,
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
                  'framer-motion': '^10.12.16',
                  'clsx': '^1.2.1',
                  'tailwind-merge': '^1.13.2',
                },
              }}
            />
          </div>
        ) : isPython ? (
          <div className="w-full h-full bg-zinc-950 relative overflow-hidden flex flex-col">
            <PythonSandbox code={artifact.content} />
          </div>
        ) : (
          <iframe
            title="Artifact Preview Sandbox"
            srcDoc={iframeSrcDoc}
            className="w-full h-full bg-white border-0"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
          />
        )}
      </div>
    </div>
  );
};
