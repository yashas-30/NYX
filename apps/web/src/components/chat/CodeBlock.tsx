import { useEffect, useState, useRef } from 'react';
import { codeToHtml } from 'shiki';
import mermaid from 'mermaid';
import { useTheme } from '../../shared/context/ThemeContext';
import { CopyIcon as Copy } from '@animateicons/react/lucide';
import { Eye, Code as CodeIcon, Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Download, Move } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

export function sanitizeMermaidCode(rawCode: string): string {
  if (!rawCode) return '';
  let cleaned = rawCode.trim();
  cleaned = cleaned.replace(/^```mermaid\s*/i, '').replace(/```\s*$/, '').trim();

  // Convert narrow vertical flowcharts (flowchart TD/TB or graph TD/TB) to horizontal (LR) for wide container fitting
  if (/^\s*(flowchart|graph)\s+(TD|TB)\b/i.test(cleaned)) {
    cleaned = cleaned.replace(/^\s*(flowchart|graph)\s+(TD|TB)\b/i, '$1 LR');
  }

  // Auto-fix mindmap diagrams by converting to robust flowchart LR layout
  if (/^\s*mindmap\b/i.test(cleaned)) {
    const lines = cleaned.split('\n');
    let rootName = '';
    const childNodes: string[] = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const cleanLabel = line
        .replace(/^root\s*(\(\(|\(|\{|\[)?/i, '')
        .replace(/(\)\)|\)|\}|\])?$/g, '')
        .replace(/"/g, '')
        .trim();

      if (cleanLabel) {
        if (!rootName) {
          rootName = cleanLabel;
        } else {
          childNodes.push(cleanLabel);
        }
      }
    }

    if (rootName) {
      const flowchartLines = [
        'flowchart LR',
        `  Root["${rootName.replace(/"/g, "'")}"]`,
      ];
      childNodes.forEach((child, idx) => {
        flowchartLines.push(`  Root --> N${idx + 1}["${child.replace(/"/g, "'")}"]`);
      });
      return flowchartLines.join('\n');
    }
  }

  // Process line by line to prevent cross-line regex matching or corrupting statement boundaries
  const lines = cleaned.split('\n');
  const sanitizedLines = lines.map(line => {
    let l = line.trim();
    if (!l) return l;

    // If node definitions on this line have unquoted labels with special characters, wrap in double quotes
    l = l.replace(/(\b\w+)\s*(\[|\(|\{\{|\(\()([^\n"\]\)\}]+)(\]|\)\}|\)\))/g, (match, nodeId, openBracket, content, closeBracket) => {
      const trimmed = content.trim();
      if (/[()%&/:\-$,#]/.test(trimmed) && !trimmed.startsWith('"')) {
        const escaped = trimmed.replace(/"/g, "'");
        return `${nodeId}${openBracket}"${escaped}"${closeBracket}`;
      }
      return match;
    });

    return l;
  });

  return sanitizedLines.join('\n');
}

export function makeSvgResponsive(rawSvg: string): string {
  if (!rawSvg) return '';
  return rawSvg
    .replace(/max-width:\s*[^;"]+;?/gi, '')
    .replace(/<svg\s+([^>]*)\bstyle="([^"]*)"/gi, (_, attrs, style) => {
      const cleanStyle = style.replace(/max-width:\s*[^;"]+;?/gi, '').trim();
      return `<svg ${attrs} style="${cleanStyle}; max-width: 100%; max-height: 460px; width: auto; height: auto;"`;
    });
}

export function makeExpandedSvgResponsive(rawSvg: string): string {
  if (!rawSvg) return '';
  return rawSvg
    .replace(/max-width:\s*[^;"]+;?/gi, '')
    .replace(/<svg\s+([^>]*)\bstyle="([^"]*)"/gi, (_, attrs, style) => {
      const cleanStyle = style
        .replace(/max-width:\s*[^;"]+;?/gi, '')
        .replace(/max-height:\s*[^;"]+;?/gi, '')
        .replace(/height:\s*[^;"]+;?/gi, '')
        .replace(/width:\s*[^;"]+;?/gi, '')
        .trim();
      return `<svg ${attrs} style="${cleanStyle}; width: 100%; height: 100%; min-height: 420px;"`;
    });
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [html, setHtml] = useState('');
  const [mermaidSvg, setMermaidSvg] = useState('');
  const [mermaidError, setMermaidError] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const { theme } = useTheme();

  const isMermaid = language === 'mermaid' || /^\s*(flowchart|graph|gantt|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph)\b/i.test(code);
  // Pure SVG files or explicit svg language tag only — normal code (HTML, JSX, TS, etc.) is never hidden
  const isSvg = language === 'svg' || (language === 'xml' && /^\s*<svg\b/i.test(code.trim()));
  const isVisualDiagram = isMermaid || isSvg;

  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    mermaid.initialize({
      startOnLoad: false,
      theme: 'dark',
      themeVariables: {
        darkMode: true,
        background: 'transparent',
        primaryColor: '#312e81',
        primaryTextColor: '#f8fafc',
        primaryBorderColor: '#6366f1',
        lineColor: '#818cf8',
        secondaryColor: '#1e1b4b',
        tertiaryColor: '#0f172a',
        clusterBkg: 'rgba(30, 41, 59, 0.5)',
        clusterBorder: '#6366f1',
        titleColor: '#f1f5f9',
        nodeBorder: '#818cf8',
        fontFamily: 'Inter, system-ui, sans-serif',
        fontSize: '14px',
      },
      securityLevel: 'loose',
      flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 24 },
    });
  }, [theme]);

  useEffect(() => {
    let isCancelled = false;

    if (isMermaid) {
      const renderMermaid = async () => {
        const sanitized = sanitizeMermaidCode(code);
        try {
          const id = `mermaid-${Math.random().toString(36).substring(2, 9)}`;
          const { svg } = await mermaid.render(id, sanitized);
          if (!isCancelled) {
            setMermaidSvg(makeSvgResponsive(svg));
            setMermaidError(null);
          }
        } catch (err: any) {
          // Fallback attempt: strip parens from unquoted labels if primary render fails
          try {
            const fallbackSanitized = sanitized.replace(/\(([^)]+)\)/g, " - $1");
            const fallbackId = `mermaid-fb-${Math.random().toString(36).substring(2, 9)}`;
            const { svg: fallbackSvg } = await mermaid.render(fallbackId, fallbackSanitized);
            if (!isCancelled) {
              setMermaidSvg(makeSvgResponsive(fallbackSvg));
              setMermaidError(null);
            }
          } catch {
            if (!isCancelled) setMermaidError(err.message || 'Failed to render Mermaid diagram');
          }
        }
      };
      renderMermaid();
    }

    const highlight = async () => {
      if (isMermaid || isSvg) return;
      try {
        const highlighted = await codeToHtml(code, {
          lang: language && language !== 'mermaid' ? language : 'text',
          theme: theme === 'dark' ? 'github-dark' : 'github-light',
        });
        if (!isCancelled) setHtml(highlighted);
      } catch {
        if (!isCancelled) setHtml(`<pre><code>${code}</code></pre>`);
      }
    };
    highlight();

    return () => {
      isCancelled = true;
    };
  }, [code, language, theme, isMermaid]);

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      // Mouse position relative to center of the canvas viewport
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;

      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

      setScale((prevScale) => {
        const newScale = Math.min(Math.max(prevScale * zoomFactor, 0.4), 5.0);
        if (newScale === prevScale) return prevScale;

        setPan((prevPan) => {
          // Exact point under cursor in unscaled diagram coordinate space
          const pointX = (mouseX - prevPan.x) / prevScale;
          const pointY = (mouseY - prevPan.y) / prevScale;

          // Adjust pan offset so the point under cursor remains pinned at mouseX, mouseY
          return {
            x: mouseX - pointX * newScale,
            y: mouseY - pointY * newScale,
          };
        });

        return newScale;
      });
    };

    el.addEventListener('wheel', handleNativeWheel, { passive: false });
    return () => {
      el.removeEventListener('wheel', handleNativeWheel);
    };
  }, [isExpanded]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || !isExpanded) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !isExpanded) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  const resetView = () => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  };

  const zoomIn = () => setScale((prev) => Math.min(prev * 1.25, 4.5));
  const zoomOut = () => setScale((prev) => Math.max(prev * 0.8, 0.4));

  const downloadSvg = () => {
    const svgContent = isMermaid ? mermaidSvg : makeSvgResponsive(code);
    if (!svgContent) return;
    const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `diagram-${Date.now()}.svg`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Inline Expanded Diagram Window (Fits 100% inside Chatpage column, scrolls with page)
  if (isVisualDiagram && isExpanded) {
    return (
      <div className="w-[calc(100%+2rem)] -ml-4 sm:w-[calc(100%+6rem)] sm:-ml-12 md:w-[calc(100%+12rem)] md:-ml-24 lg:w-[calc(100%+20rem)] lg:-ml-40 max-w-[94vw] rounded-2xl border-2 border-indigo-500/50 bg-card/95 shadow-2xl transition-all duration-300 my-6 overflow-hidden select-none relative z-10">
        {/* Expanded Window Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/60 border-b border-border/60 gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground truncate">
              {filename || (isMermaid ? 'Visual Diagram — Expanded View' : 'SVG Graphic')}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
              {Math.round(scale * 100)}%
            </span>
          </div>

          {/* Zoom Controls */}
          <div className="flex items-center gap-1 bg-background/80 p-1 rounded-xl border border-border/50 shadow-xs">
            <button
              onClick={zoomOut}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={resetView}
              className="px-2 py-0.5 text-[10px] font-mono font-medium rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
              title="Reset Zoom & Pan (0)"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Reset</span>
            </button>
            <button
              onClick={zoomIn}
              className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1.5">
            <button
              onClick={downloadSvg}
              className="p-1.5 px-2.5 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 transition-colors flex items-center gap-1.5 text-xs font-medium"
              title="Download SVG"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={copyToClipboard}
              className="p-1.5 px-2 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs font-medium"
              title="Copy Code"
            >
              <Copy className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => { setIsExpanded(false); resetView(); }}
              className="p-1.5 rounded-lg bg-muted/80 hover:bg-muted text-foreground transition-colors"
              title="Minimize Diagram"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Pan/Zoom Canvas Spanning Full Chatpage Width */}
        <div
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          className={`h-[560px] sm:h-[620px] w-full relative overflow-hidden flex items-center justify-center bg-card/40 p-4 sm:p-6 ${
            isDragging ? 'cursor-grabbing' : 'cursor-grab'
          }`}
        >
          <div className="absolute top-3 left-3 flex items-center gap-1.5 text-[10px] font-mono text-muted-foreground bg-background/80 backdrop-blur-md px-2.5 py-1 rounded-full border border-border/40 pointer-events-none shadow-xs z-10">
            <Move className="w-3 h-3 text-indigo-400" />
            <span>Click & Drag to Pan • Scroll Wheel to Zoom</span>
          </div>

          <div
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
              transformOrigin: 'center center',
              transition: isDragging ? 'none' : 'transform 0.12s ease-out',
            }}
            className="w-full h-full flex items-center justify-center pointer-events-auto [&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-[98%] [&_svg]:max-h-[96%] [&_svg]:mx-auto [&_svg]:my-auto"
            dangerouslySetInnerHTML={{ __html: isMermaid ? makeExpandedSvgResponsive(mermaidSvg) : makeExpandedSvgResponsive(code) }}
          />
        </div>
      </div>
    );
  }

  // Standard Compact View
  return (
    <div className="rounded-lg overflow-hidden border border-border/80 bg-background/50 my-3 shadow-xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-muted/40 border-b border-border/60 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground uppercase text-[10px] font-semibold tracking-wider">
            {filename || (isMermaid ? 'Visual Diagram' : isSvg ? 'SVG Graphic' : language) || 'code'}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {isVisualDiagram && (
            <button
              onClick={() => setIsExpanded(true)}
              title="Expand Window Inside Chatpage"
              className="p-1 text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-[11px]"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={copyToClipboard} title="Copy Content" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isVisualDiagram ? (
        <div ref={containerRef} className="p-3 flex flex-col items-center justify-center bg-card/40 rounded-b-lg border-t border-border/30 overflow-x-auto min-h-[160px]">
          {isMermaid ? (
            mermaidError ? (
              <div className="text-[11px] text-destructive bg-destructive/10 p-2.5 rounded font-mono w-full overflow-x-auto">
                ⚠️ Diagram Rendering Error: {mermaidError}
              </div>
            ) : (
              <div
                className="w-full flex items-center justify-center overflow-auto p-2 max-h-[480px] [&_svg]:max-w-full [&_svg]:max-h-[450px] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:mx-auto cursor-pointer"
                onClick={() => setIsExpanded(true)}
                title="Click to Expand Window Inside Chatpage"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            )
          ) : (
            <div
              className="w-full max-w-full overflow-auto flex items-center justify-center p-2 max-h-[480px] [&_svg]:max-w-full [&_svg]:max-h-[450px] [&_svg]:w-auto [&_svg]:h-auto [&_svg]:mx-auto cursor-pointer"
              onClick={() => setIsExpanded(true)}
              title="Click to Expand Window Inside Chatpage"
              dangerouslySetInnerHTML={{ __html: makeSvgResponsive(code) }}
            />
          )}
        </div>
      ) : (
        <div 
          className="overflow-x-auto p-3 text-xs font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
