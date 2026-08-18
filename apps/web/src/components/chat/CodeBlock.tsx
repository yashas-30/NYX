import { useEffect, useState, useRef, useCallback } from 'react';
import { codeToHtml } from 'shiki';
import mermaid from 'mermaid';
import { useTheme } from '../../shared/context/ThemeContext';
import { CopyIcon as Copy } from '@animateicons/react/lucide';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Download, Move } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

/**
 * Removes any stray DOM elements that Mermaid injects into document.body on parse errors.
 */
function cleanupMermaidDOMErrors() {
  if (typeof document === 'undefined') return;
  try {
    const orphans = document.querySelectorAll(
      'body > [id^="dmermaid"], body > .mermaid-error, body > svg[id^="mermaid-"], body > div[id^="dmermaid"]'
    );
    orphans.forEach((el) => el.remove());
  } catch {
    // Ignore DOM cleanup errors
  }
}

/**
 * Ultra-robust Mermaid sanitizer. Automatically repairs common LLM diagram syntax errors:
 * 1. Wraps all node labels with special chars, parens, brackets, or colons into clean quotes
 * 2. Properly handles complex expressions like A[Narrow AI (Point Solutions)] -> A["Narrow AI (Point Solutions)"]
 * 3. Preserves subgraph blocks and declaration directives
 * 4. Ensures root diagram declaration exists
 */
export function sanitizeMermaidCode(rawCode: string): string {
  if (!rawCode) return '';
  let cleaned = rawCode.trim();
  cleaned = cleaned.replace(/^```(?:mermaid)?\s*/i, '').replace(/```\s*$/, '').trim();

  // Strip leading comments or markdown titles before diagram declaration
  cleaned = cleaned.replace(/^#+.*$/gm, '').trim();

  // Ensure valid diagram type header if missing
  const hasValidHeader = /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|journey|gantt)\b/i.test(
    cleaned
  );

  if (!hasValidHeader) {
    cleaned = `flowchart TD\n${cleaned}`;
  }

  // Line-by-line sanitization to prevent syntax crashes from special characters in node labels
  const lines = cleaned.split('\n');
  const sanitizedLines = lines.map((line) => {
    let l = line.trim();
    if (!l) return l;

    // Preserve top-level directives and subgraphs
    if (/^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|subgraph|end)\b/i.test(l)) {
      return l;
    }

    // 1. Double bracket labels: NodeId[["Label"]] or NodeId((("Label"))) or NodeId{{ "Label" }}
    l = l.replace(/(\b[a-zA-Z0-9_-]+)\s*(\{\{|\(\(|\(\[|\[\[)\s*([^\]\)\}\n]+?)\s*(\}\}|\)\)|\)\]|\]\])/g, (match, id, open, content, close) => {
      const trimmed = content.trim().replace(/^["']+|["']+$/g, '');
      const escaped = trimmed.replace(/"/g, "'");
      return `${id}${open}"${escaped}"${close}`;
    });

    // 2. Square bracket labels: NodeId[Any Text Here (even with nested parens, colons, etc)]
    l = l.replace(/(\b[a-zA-Z0-9_-]+)\s*\[([^\]\n]+)\]/g, (match, id, content) => {
      const trimmed = content.trim().replace(/^["']+|["']+$/g, '');
      const escaped = trimmed.replace(/"/g, "'");
      return `${id}["${escaped}"]`;
    });

    // 3. Rounded parentheses labels: NodeId(Text Here) - only if not already ((...)) or ([...])
    l = l.replace(/(\b[a-zA-Z0-9_-]+)\s*\(([^)\n]+)\)/g, (match, id, content) => {
      if (content.startsWith('[') || content.startsWith('(')) return match;
      const trimmed = content.trim().replace(/^["']+|["']+$/g, '');
      const escaped = trimmed.replace(/"/g, "'");
      return `${id}("${escaped}")`;
    });

    // 4. Arrow labels: -->|Label text (even with parens)|
    l = l.replace(/(-->|---|==>|-.->)\s*\|([^|\n]+)\|/g, (match, arrow, label) => {
      const trimmed = label.trim().replace(/^["']+|["']+$/g, '');
      const escaped = trimmed.replace(/"/g, "'");
      return `${arrow}|"${escaped}"|`;
    });

    return l;
  });

  return sanitizedLines.join('\n');
}

/**
 * Pure SVG Flowchart Fallback Generator.
 * Used when Mermaid syntax is severely malformed so the user ALWAYS gets a crisp visual graph.
 */
function generateFallbackFlowchartSvg(rawCode: string): string {
  const lines = rawCode
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(flowchart|graph|sequenceDiagram|subgraph|end)/i.test(l));

  const nodesMap = new Map<string, string>();

  for (const line of lines) {
    // Extract node definitions with labels like A["Label"] or A[Label]
    const defMatches = line.matchAll(/(\b[a-zA-Z0-9_-]+)\s*(?:\[|\(|\{)\s*["']?([^\]\)\}]+?)["']?\s*(?:\]|\)|\})/g);
    for (const match of defMatches) {
      if (match[1] && match[2]) {
        nodesMap.set(match[1], match[2].trim());
      }
    }

    // Extract connections: A --> B or A -->|label| B
    const connMatch = line.match(/(\b[a-zA-Z0-9_-]+)\s*(?:-->|==>|->)\s*(?:\|["']?([^|\n]+?)["']?\|)?\s*(\b[a-zA-Z0-9_-]+)/);
    if (connMatch) {
      const fromId = connMatch[1];
      const toId = connMatch[3];
      if (!nodesMap.has(fromId)) nodesMap.set(fromId, fromId);
      if (!nodesMap.has(toId)) nodesMap.set(toId, toId);
    }
  }

  const nodeList = Array.from(nodesMap.entries()).map(([id, label]) => ({ id, label }));
  if (nodeList.length === 0) {
    nodeList.push(
      { id: '1', label: 'System Ingestion & Extraction' },
      { id: '2', label: 'Processing & Architecture' },
      { id: '3', label: 'Autonomous Diagnostic Output' }
    );
  }

  const nodeWidth = 240;
  const nodeHeight = 56;
  const gap = 50;
  const totalWidth = Math.max(680, nodeList.length * (nodeWidth + gap) + 40);
  const totalHeight = 160;

  const nodeSvg = nodeList
    .map((n, i) => {
      const x = 30 + i * (nodeWidth + gap);
      const y = 50;
      const cleanLabel = n.label.length > 30 ? n.label.slice(0, 28) + '...' : n.label;
      return `
      <g class="flow-node">
        <rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="12" fill="#1e1b4b" stroke="#6366f1" stroke-width="2" />
        <text x="${x + nodeWidth / 2}" y="${y + 33}" fill="#f8fafc" font-family="system-ui, -apple-system, sans-serif" font-size="13" font-weight="600" text-anchor="middle">${cleanLabel}</text>
      </g>`;
    })
    .join('');

  const arrowSvg = nodeList
    .slice(0, nodeList.length - 1)
    .map((_, i) => {
      const startX = 30 + i * (nodeWidth + gap) + nodeWidth;
      const endX = startX + gap;
      const y = 50 + nodeHeight / 2;
      return `
      <g class="flow-arrow">
        <line x1="${startX}" y1="${y}" x2="${endX - 6}" y2="${y}" stroke="#818cf8" stroke-width="2.5" stroke-dasharray="4,2" />
        <polygon points="${endX},${y} ${endX - 8},${y - 5} ${endX - 8},${y + 5}" fill="#818cf8" />
      </g>`;
    })
    .join('');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalWidth} ${totalHeight}" style="max-width: 100%; height: auto; display: block; margin: auto;">
    <rect width="100%" height="100%" fill="transparent" />
    ${nodeSvg}
    ${arrowSvg}
  </svg>`;
}

export function makeSvgResponsive(rawSvg: string): string {
  if (!rawSvg) return '';
  let svg = rawSvg.replace(/max-width:\s*[^;"]+;?/gi, '');
  if (/style="([^"]*)"/i.test(svg)) {
    svg = svg.replace(/style="([^"]*)"/i, (_, s) => `style="${s}; max-width: 100%; height: auto;"`);
  } else {
    svg = svg.replace(/<svg\b/i, '<svg style="max-width: 100%; height: auto;"');
  }
  return svg;
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
  const [isExpanded, setIsExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const { theme } = useTheme();

  const isMermaid =
    language === 'mermaid' ||
    /^\s*(flowchart|graph|gantt|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph)\b/i.test(code);
  const isSvg = language === 'svg' || (language === 'xml' && /^\s*<svg\b/i.test(code.trim()));
  const isVisualDiagram = isMermaid || isSvg;

  const containerRef = useRef<HTMLDivElement>(null);

  // Initialize Mermaid with suppressErrorRendering to prevent DOM leak
  useEffect(() => {
    try {
      mermaid.initialize({
        startOnLoad: false,
        suppressErrorRendering: true,
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
    } catch {
      // Ignore initialization errors
    }
  }, [theme]);

  // Mermaid render effect with automatic error cleanup and fallback
  useEffect(() => {
    let isCancelled = false;

    if (isMermaid) {
      const renderMermaid = async () => {
        const sanitized = sanitizeMermaidCode(code);
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

        try {
          cleanupMermaidDOMErrors();
          const { svg } = await mermaid.render(uniqueId, sanitized);
          cleanupMermaidDOMErrors();

          if (!isCancelled) {
            setMermaidSvg(makeSvgResponsive(svg));
          }
        } catch {
          cleanupMermaidDOMErrors();

          // Fallback: Generate crisp native SVG flowchart graph
          try {
            const fallbackSvg = generateFallbackFlowchartSvg(sanitized);
            if (!isCancelled) {
              setMermaidSvg(makeSvgResponsive(fallbackSvg));
            }
          } catch {
            if (!isCancelled) {
              setMermaidSvg(makeSvgResponsive(generateFallbackFlowchartSvg(code)));
            }
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
      cleanupMermaidDOMErrors();
    };
  }, [code, language, theme, isMermaid, isSvg]);

  const canvasRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const handleNativeWheel = (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();

      const rect = el.getBoundingClientRect();
      const mouseX = e.clientX - rect.left - rect.width / 2;
      const mouseY = e.clientY - rect.top - rect.height / 2;
      const zoomFactor = e.deltaY < 0 ? 1.15 : 0.85;

      setScale((prevScale) => {
        const newScale = Math.min(Math.max(prevScale * zoomFactor, 0.4), 5.0);
        if (newScale === prevScale) return prevScale;

        setPan((prevPan) => {
          const pointX = (mouseX - prevPan.x) / prevScale;
          const pointY = (mouseY - prevPan.y) / prevScale;
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

  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);

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

  // Inline Expanded Diagram Window
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
              <RotateCcw className="w-3.5 h-3.5" />
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
              onClick={() => {
                setIsExpanded(false);
                resetView();
              }}
              className="p-1.5 rounded-lg bg-muted/80 hover:bg-muted text-foreground transition-colors"
              title="Minimize Diagram"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Interactive Pan/Zoom Canvas */}
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
            dangerouslySetInnerHTML={{
              __html: isMermaid ? makeExpandedSvgResponsive(mermaidSvg) : makeExpandedSvgResponsive(code),
            }}
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
          <button
            onClick={copyToClipboard}
            title="Copy Content"
            className="p-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isVisualDiagram ? (
        <div
          ref={containerRef}
          className="p-3 flex flex-col items-center justify-center bg-card/40 rounded-b-lg border-t border-border/30 overflow-x-auto min-h-[140px]"
        >
          {isMermaid ? (
            mermaidSvg ? (
              <div
                className="w-full flex items-center justify-center overflow-auto p-2 min-h-[140px] max-h-[480px] [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto cursor-pointer"
                onClick={() => setIsExpanded(true)}
                title="Click to Expand Window Inside Chatpage"
                dangerouslySetInnerHTML={{ __html: mermaidSvg }}
              />
            ) : (
              <div className="w-full flex items-center justify-center p-6 text-xs text-muted-foreground font-mono animate-pulse">
                Rendering Visual Architecture Diagram...
              </div>
            )
          ) : (
            <div
              className="w-full max-w-full overflow-auto flex items-center justify-center p-2 min-h-[140px] max-h-[480px] [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto cursor-pointer"
              onClick={() => setIsExpanded(true)}
              title="Click to Expand Window Inside Chatpage"
              dangerouslySetInnerHTML={{ __html: makeSvgResponsive(code) }}
            />
          )}
        </div>
      ) : (
        <div className="overflow-x-auto p-3 text-xs font-mono leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
      )}
    </div>
  );
}
