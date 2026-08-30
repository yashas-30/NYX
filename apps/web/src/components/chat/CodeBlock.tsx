import { useEffect, useState, useRef, useCallback } from 'react';
import { codeToHtml } from 'shiki';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { useTheme } from '../../shared/context/ThemeContext';
import { CopyIcon as Copy } from '@animateicons/react/lucide';
import { Maximize2, Minimize2, ZoomIn, ZoomOut, RotateCcw, Download, Move } from 'lucide-react';
import { isSlidevContent } from '../../features/artifacts/utils/slidevParser';
import { PresentationDeck } from '../../features/presentation/components/PresentationDeck';

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
  cleaned = cleaned
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();

  // Strip leading comments or markdown titles before diagram declaration
  cleaned = cleaned.replace(/^#+.*$/gm, '').trim();

  // Ensure valid diagram type header if missing
  const hasValidHeader =
    /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|journey|gantt)\b/i.test(
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
    if (
      /^\s*(flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph|subgraph|end)\b/i.test(
        l
      )
    ) {
      return l;
    }

    // 1. Double bracket labels: NodeId[["Label"]] or NodeId((("Label"))) or NodeId{{ "Label" }}
    l = l.replace(
      /(\b[a-zA-Z0-9_-]+)\s*(\{\{|\(\(|\(\[|\[\[)\s*([^\]\)\}\n]+?)\s*(\}\}|\)\)|\)\]|\]\])/g,
      (match, id, open, content, close) => {
        const trimmed = content.trim().replace(/^["']+|["']+$/g, '');
        const escaped = trimmed.replace(/"/g, "'");
        return `${id}${open}"${escaped}"${close}`;
      }
    );

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
 * Editorial Diagram-Design Fallback HTML Generator.
 * Produces a publication-grade diagram-design HTML+SVG when Mermaid fails to render.
 * Uses the same Obsidian / True Black + Atomic Coral (#f08a59) color tokens as cathrynlavery/diagram-design.
 */
export function generateFallbackFlowchartSvg(rawCode: string): string {
  const lines = rawCode
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !/^(flowchart|graph|sequenceDiagram|subgraph|end|%%)/i.test(l));

  const nodesMap = new Map<string, string>();
  const edges: Array<{ from: string; to: string; label?: string }> = [];

  for (const line of lines) {
    const defMatches = line.matchAll(
      /(\b[a-zA-Z0-9_-]+)\s*(?:\[|\(|\{)\s*["']?([^\]\)\}]+?)["']?\s*(?:\]|\)|\})/g
    );
    for (const match of defMatches) {
      if (match[1] && match[2])
        nodesMap.set(
          match[1],
          match[2]
            .trim()
            .replace(/&amp;/g, '&')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
        );
    }
    const connMatch = line.match(
      /(\b[a-zA-Z0-9_-]+)\s*(?:-->|==>|->)\s*(?:\|["']?([^|\n]+?)["']?\|)?\s*(\b[a-zA-Z0-9_-]+)/
    );
    if (connMatch) {
      const fromId = connMatch[1];
      const toId = connMatch[3];
      const edgeLabel = connMatch[2]?.trim();
      if (!nodesMap.has(fromId)) nodesMap.set(fromId, fromId);
      if (!nodesMap.has(toId)) nodesMap.set(toId, toId);
      edges.push({ from: fromId, to: toId, label: edgeLabel });
    }
  }

  const nodeList = Array.from(nodesMap.entries()).map(([id, label]) => ({ id, label }));
  if (nodeList.length === 0) {
    nodeList.push(
      { id: '1', label: 'Input Layer' },
      { id: '2', label: 'Processing Core' },
      { id: '3', label: 'Output Layer' }
    );
    edges.push({ from: '1', to: '2' }, { from: '2', to: '3' });
  }

  // Layout: horizontal row with wrap at 5 nodes
  const cols = Math.min(nodeList.length, 5);
  const rows = Math.ceil(nodeList.length / cols);
  const NW = 180;
  const NH = 56;
  const HGAP = 60;
  const VGAP = 70;
  const PAD = 40;
  const totalW = PAD * 2 + cols * NW + (cols - 1) * HGAP;
  const totalH = PAD * 2 + rows * NH + (rows - 1) * VGAP + 40;

  const nodePositions = new Map<string, { cx: number; cy: number }>();
  const nodeSvg = nodeList
    .map((n, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = PAD + col * (NW + HGAP);
      const y = PAD + row * (NH + VGAP);
      const cx = x + NW / 2;
      const cy = y + NH / 2;
      nodePositions.set(n.id, { cx, cy });
      const isFirst = i === 0;
      const fill = isFirst ? 'rgba(240,138,89,0.15)' : '#121214';
      const stroke = isFirst ? '#f08a59' : 'rgba(255,255,255,0.12)';
      const textColor = isFirst ? '#f08a59' : '#f5f5f5';
      const label = n.label.length > 24 ? n.label.slice(0, 22) + '…' : n.label;
      return `<g>
      <rect x="${x}" y="${y}" width="${NW}" height="${NH}" rx="8" fill="${fill}" stroke="${stroke}" stroke-width="1.5"/>
      <text x="${cx}" y="${y + 33}" fill="${textColor}" font-family="Geist,Inter,system-ui,sans-serif" font-size="12" font-weight="600" text-anchor="middle">${label}</text>
    </g>`;
    })
    .join('\n');

  const edgeSvg = edges
    .map((e) => {
      const from = nodePositions.get(e.from);
      const to = nodePositions.get(e.to);
      if (!from || !to) return '';
      const x1 = from.cx + NW / 2 - 10;
      const y1 = from.cy;
      const x2 = to.cx - NW / 2 + 10;
      const y2 = to.cy;
      return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#a1a1aa" stroke-width="1.5" marker-end="url(#arr)"/>`;
    })
    .join('\n');

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${totalW} ${totalH}" style="max-width:100%;height:auto;display:block;margin:auto;background:#09090b;border-radius:12px;">
  <defs>
    <marker id="arr" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
      <path d="M0 2 L10 5 L0 8z" fill="#a1a1aa"/>
    </marker>
  </defs>
  <rect width="100%" height="100%" fill="#09090b" rx="12"/>
  ${edgeSvg}
  ${nodeSvg}
</svg>`;
}

const SANITIZE_OPTIONS = {
  USE_PROFILES: { svg: true, html: true, svgFilters: true },
  ADD_TAGS: [
    'style',
    'svg',
    'defs',
    'linearGradient',
    'radialGradient',
    'filter',
    'feGaussianBlur',
    'feMerge',
    'feMergeNode',
    'feDropShadow',
    'path',
    'rect',
    'circle',
    'text',
    'tspan',
    'g',
    'marker',
    'line',
    'polygon',
    'polyline',
    'ellipse',
    'div',
    'span',
  ],
  ADD_ATTR: [
    'viewBox',
    'xmlns',
    'fill',
    'stroke',
    'stroke-width',
    'stroke-dasharray',
    'marker-end',
    'marker-start',
    'd',
    'rx',
    'ry',
    'x',
    'y',
    'x1',
    'y1',
    'x2',
    'y2',
    'cx',
    'cy',
    'r',
    'text-anchor',
    'dominant-baseline',
    'font-family',
    'font-size',
    'font-weight',
    'letter-spacing',
    'opacity',
    'transform',
    'filter',
    'style',
    'class',
    'id',
    'refX',
    'refY',
    'markerWidth',
    'markerHeight',
    'orient',
  ],
};

export function makeSvgResponsive(rawHtmlOrSvg: string): string {
  if (!rawHtmlOrSvg) return '';
  let content = rawHtmlOrSvg.trim();
  content = content
    .replace(/^```(?:html|svg|diagram|diagram-design)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const styleMatch = content.match(/<style[\s\S]*?<\/style>/i);
  const styleTag = styleMatch ? styleMatch[0] : '';
  const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);

  if (svgMatch) {
    let svg = svgMatch[0];
    svg = svg.replace(/max-width:\s*[^;"]+;?/gi, '');
    if (/style="([^"]*)"/i.test(svg)) {
      svg = svg.replace(
        /style="([^"]*)"/i,
        (_, s) => `style="${s}; width: 100%; max-width: 100%; height: auto;"`
      );
    } else {
      svg = svg.replace(/<svg\b/i, '<svg style="width: 100%; max-width: 100%; height: auto;"');
    }
    return `${styleTag}\n${svg}`;
  }

  return content;
}

export function makeExpandedSvgResponsive(rawHtmlOrSvg: string): string {
  if (!rawHtmlOrSvg) return '';
  let content = rawHtmlOrSvg.trim();
  content = content
    .replace(/^```(?:html|svg|diagram|diagram-design)?\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim();

  const styleMatch = content.match(/<style[\s\S]*?<\/style>/i);
  const styleTag = styleMatch ? styleMatch[0] : '';
  const svgMatch = content.match(/<svg[\s\S]*?<\/svg>/i);

  if (svgMatch) {
    let svg = svgMatch[0];
    svg = svg
      .replace(/max-width:\s*[^;"]+;?/gi, '')
      .replace(/<svg\s+([^>]*)\bstyle="([^"]*)"/gi, (_, attrs, style) => {
        const cleanStyle = style
          .replace(/max-width:\s*[^;"]+;?/gi, '')
          .replace(/max-height:\s*[^;"]+;?/gi, '')
          .replace(/height:\s*[^;"]+;?/gi, '')
          .replace(/width:\s*[^;"]+;?/gi, '')
          .trim();
        return `<svg ${attrs} style="${cleanStyle}; width: 100%; height: 100%; min-height: 460px;"`;
      });
    if (!svg.includes('style=')) {
      svg = svg.replace(/<svg\b/i, '<svg style="width: 100%; height: 100%; min-height: 460px;"');
    }
    return `${styleTag}\n${svg}`;
  }

  return content;
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
  const isSlidev = isSlidevContent(code, language);

  const isMermaid =
    language === 'mermaid' ||
    /^\s*(flowchart|graph|gantt|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph)\b/i.test(
      code
    );
  const isSvg = language === 'svg' || (language === 'xml' && /^\s*<svg\b/i.test(code.trim()));
  const isDiagramHtml =
    (language === 'html' || language === 'diagram' || language === 'diagram-design') &&
    (/<svg\b/i.test(code) || /class="diagram/i.test(code) || /viewBox=/i.test(code));
  const isVisualDiagram = isMermaid || isSvg || isDiagramHtml;

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
        // Escape HTML entities to prevent XSS when Shiki fails
        const escapeHtml = (text: string) =>
          text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
        if (!isCancelled) setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`);
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
    let svgContent = isMermaid ? mermaidSvg : code;
    if (isDiagramHtml) {
      const match = code.match(/<svg[\s\S]*?<\/svg>/i);
      if (match) svgContent = match[0];
    } else if (!isMermaid) {
      svgContent = makeSvgResponsive(code);
    }
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

  if (isSlidev) {
    return <PresentationDeck content={code} title={filename || 'Presentation Deck'} />;
  }

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
              __html: DOMPurify.sanitize(
                isMermaid ? makeExpandedSvgResponsive(mermaidSvg) : makeExpandedSvgResponsive(code),
                SANITIZE_OPTIONS as any
              ),
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
            {filename ||
              (isMermaid ? 'Visual Diagram' : isSvg ? 'SVG Graphic' : language) ||
              'code'}
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
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(mermaidSvg, SANITIZE_OPTIONS as any),
                }}
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
              dangerouslySetInnerHTML={{
                __html: DOMPurify.sanitize(makeSvgResponsive(code), SANITIZE_OPTIONS as any),
              }}
            />
          )}
        </div>
      ) : (
        <div
          className="overflow-x-auto max-h-[380px] overflow-y-auto p-3 text-xs font-mono leading-relaxed select-text"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
