import { useEffect, useState, useRef, useCallback, useMemo } from 'react';
import { codeToHtml } from 'shiki';
import mermaid from 'mermaid';
import DOMPurify from 'dompurify';
import { useTheme } from '../../shared/context/ThemeContext';
import {
  CopyIcon as Copy,
  PlayIcon as Play,
  CodeIcon as Code,
  TerminalIcon as Terminal,
} from '@animateicons/react/lucide';
import {
  Maximize2,
  Minimize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Download,
  Move,
  RotateCw,
  Check,
  ExternalLink,
  Sparkles,
} from 'lucide-react';
import { isSlidevContent } from '../../features/artifacts/utils/slidevParser';
import { PresentationDeck } from '../../features/presentation/components/PresentationDeck';
import { PythonSandbox } from '../../features/chat/components/PythonSandbox';
import { Sandpack } from '@codesandbox/sandpack-react';
import { toast } from '../../shared/components/ui/sonner';
import { buildLivePreviewSrcDoc } from '../../shared/utils/livePreviewRunner';

export interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  isStreaming?: boolean;
  onArtifactClick?: (artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    language?: string;
  }) => void;
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

export function CodeBlock({
  code,
  language,
  filename,
  isStreaming = false,
  onArtifactClick,
}: CodeBlockProps) {
  const [html, setHtml] = useState('');
  const [mermaidSvg, setMermaidSvg] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [scale, setScale] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const dragStartRef = useRef({ x: 0, y: 0 });
  const { theme } = useTheme();

  const cleanLang = (language || '').toLowerCase().trim();
  const isSlidev = isSlidevContent(code, cleanLang);

  const isMermaid =
    cleanLang === 'mermaid' ||
    /^\s*(flowchart|graph\s+(?:TD|TB|LR|RL)|gantt|sequenceDiagram|classDiagram|stateDiagram|pie|mindmap|erDiagram|gitGraph)\b/i.test(
      code
    );
  const isSvg = cleanLang === 'svg' || (cleanLang === 'xml' && /^\s*<svg\b/i.test(code.trim()));
  const isDiagramHtml =
    (cleanLang === 'html' || cleanLang === 'diagram' || cleanLang === 'diagram-design') &&
    (/<svg\b/i.test(code) || /class="[^"]*diagram/i.test(code) || /viewBox=/i.test(code));

  const isReact =
    ['jsx', 'tsx', 'react'].includes(cleanLang) ||
    (/import\s+React/i.test(code) && /export\s+default/i.test(code));
  const isPython = cleanLang === 'python' || cleanLang === 'py';
  const isJsScript =
    ['javascript', 'js', 'typescript', 'ts', 'node'].includes(cleanLang) && !isReact;
  const isHtml =
    (cleanLang === 'html' ||
      cleanLang === 'htm' ||
      cleanLang === 'xhtml' ||
      /<!DOCTYPE\s+html/i.test(code) ||
      /<html\b/i.test(code) ||
      (/<head\b/i.test(code) && /<body\b/i.test(code))) &&
    !isSvg &&
    !isDiagramHtml;

  const isPreviewable =
    isHtml || isReact || isPython || isSvg || isMermaid || isDiagramHtml || isSlidev || isJsScript;

  // Track if the user manually switched tabs so we don't clobber their preference
  const userOverrodeTab = useRef(false);
  const prevStreaming = useRef(isStreaming);

  // Active tab state: default to 'code' during streaming so user sees live code typing,
  // and 'preview' when complete for previewable languages.
  const [activeTab, setActiveTab] = useState<'preview' | 'code' | 'console'>(() => {
    if (isStreaming) return 'code';
    return isPreviewable ? 'preview' : 'code';
  });

  // Switch to preview automatically when streaming finishes for previewable content (unless user manually pinned code)
  useEffect(() => {
    if (prevStreaming.current && !isStreaming) {
      if (!userOverrodeTab.current && isPreviewable) {
        setActiveTab('preview');
      }
    }
    prevStreaming.current = isStreaming;
  }, [isStreaming, isPreviewable]);

  const handleTabChange = (tab: 'preview' | 'code' | 'console') => {
    userOverrodeTab.current = true;
    setActiveTab(tab);
  };

  // Shiki syntax highlighting.
  // During streaming: skip expensive async Shiki — show raw escaped text in a plain pre.
  // After streaming completes: run a single Shiki pass for the final highlighted output.
  // This eliminates per-token async layout thrashing that causes scroll jank.
  const escapeHtml = useCallback(
    (text: string) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;'),
    []
  );

  useEffect(() => {
    // While streaming: show raw pre/code — no Shiki cost, no layout thrash.
    if (isStreaming) {
      if (!isMermaid) {
        setHtml(`<pre class="shiki-streaming"><code>${escapeHtml(code)}</code></pre>`);
      }
      return;
    }

    // Stream finished — run a single full Shiki highlight pass.
    let isCancelled = false;
    const highlight = async () => {
      try {
        const highlighted = await codeToHtml(code, {
          lang: cleanLang && cleanLang !== 'mermaid' ? cleanLang : 'text',
          theme: theme === 'dark' ? 'github-dark' : 'github-light',
        });
        if (!isCancelled) setHtml(highlighted);
      } catch {
        if (!isCancelled) setHtml(`<pre><code>${escapeHtml(code)}</code></pre>`);
      }
    };
    highlight();
    return () => {
      isCancelled = true;
    };
  }, [code, cleanLang, theme, isStreaming, isMermaid, escapeHtml]);

  // Mermaid render effect — only runs after streaming is complete
  useEffect(() => {
    let isCancelled = false;

    if (isMermaid && !isStreaming) {
      const renderMermaid = async () => {
        const sanitized = sanitizeMermaidCode(code);
        const uniqueId = `mermaid-${Math.random().toString(36).substring(2, 9)}`;

        try {
          cleanupMermaidDOMErrors();
          mermaid.initialize({
            startOnLoad: false,
            suppressErrorRendering: true,
            theme: 'dark',
            themeVariables: {
              darkMode: true,
              background: 'transparent',
              primaryColor: '#312e81',
              primaryTextColor: '#f8fafc',
              primaryBorderColor: 'rgba(255,255,255,0.2)',
              lineColor: 'rgba(255,255,255,0.4)',
              secondaryColor: '#18181b',
              tertiaryColor: '#09090b',
              clusterBkg: 'rgba(24, 24, 27, 0.6)',
              clusterBorder: 'rgba(255,255,255,0.2)',
              titleColor: '#ffffff',
              nodeBorder: 'rgba(255,255,255,0.3)',
              fontFamily: 'Inter, system-ui, sans-serif',
              fontSize: '13px',
            },
            securityLevel: 'loose',
            flowchart: { useMaxWidth: true, htmlLabels: true, curve: 'basis', padding: 20 },
          });

          const { svg } = await mermaid.render(uniqueId, sanitized);
          cleanupMermaidDOMErrors();

          if (!isCancelled) {
            setMermaidSvg(makeSvgResponsive(svg));
          }
        } catch {
          cleanupMermaidDOMErrors();
          try {
            const fallbackSvg = generateFallbackFlowchartSvg(sanitized);
            if (!isCancelled) setMermaidSvg(makeSvgResponsive(fallbackSvg));
          } catch {
            if (!isCancelled) setMermaidSvg(makeSvgResponsive(generateFallbackFlowchartSvg(code)));
          }
        }
      };

      renderMermaid();
    }

    return () => {
      isCancelled = true;
      cleanupMermaidDOMErrors();
    };
  }, [code, isMermaid, isStreaming]);

  // HTML / JS Iframe generation with full libraries & storage polyfill
  const iframeSrcDoc = useMemo(() => {
    if (!isHtml && !isDiagramHtml && !isJsScript) return '';
    return buildLivePreviewSrcDoc(code, cleanLang);
  }, [code, cleanLang, isHtml, isDiagramHtml, isJsScript]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const downloadFile = () => {
    const extMap: Record<string, string> = {
      html: 'html',
      javascript: 'js',
      js: 'js',
      typescript: 'ts',
      ts: 'ts',
      jsx: 'jsx',
      tsx: 'tsx',
      python: 'py',
      py: 'py',
      svg: 'svg',
      css: 'css',
      json: 'json',
      mermaid: 'mmd',
      slidev: 'md',
    };
    const ext = extMap[cleanLang] || cleanLang || 'txt';
    const name = filename || `nyx-export-${Date.now()}.${ext}`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${name}`);
  };

  const handleOpenInCanvas = () => {
    if (onArtifactClick) {
      onArtifactClick({
        id: `artifact-${Date.now()}`,
        type: isSlidev ? 'presentation' : isPreviewable ? 'app' : 'code',
        title:
          filename ||
          (isHtml
            ? 'Web Application'
            : isReact
              ? 'React Component'
              : isPython
                ? 'Python Script'
                : isMermaid
                  ? 'Architecture Diagram'
                  : 'Code Artifact'),
        content: code,
        language: cleanLang,
      });
    } else {
      setIsExpanded(true);
    }
  };

  const reloadPreview = () => {
    setReloadKey((k) => k + 1);
    toast.info('Reloaded live preview');
  };

  // Zoom & Pan for SVG / Expanded view
  const canvasRef = useRef<HTMLDivElement>(null);
  const resetView = useCallback(() => {
    setScale(1);
    setPan({ x: 0, y: 0 });
  }, []);
  const zoomIn = () => setScale((prev) => Math.min(prev * 1.25, 4.5));
  const zoomOut = () => setScale((prev) => Math.max(prev * 0.8, 0.4));

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPan({
      x: e.clientX - dragStartRef.current.x,
      y: e.clientY - dragStartRef.current.y,
    });
  };

  const handleMouseUp = () => setIsDragging(false);

  // Expanded View Modal
  if (isExpanded) {
    return (
      <div className="w-[calc(100%+2rem)] -ml-4 sm:w-[calc(100%+6rem)] sm:-ml-12 md:w-[calc(100%+12rem)] md:-ml-24 lg:w-[calc(100%+20rem)] lg:-ml-40 max-w-[94vw] rounded-xl border border-border-strong bg-card transition-all duration-300 my-6 overflow-hidden select-none relative z-20">
        {/* Expanded Window Header */}
        <div className="flex items-center justify-between px-4 py-3 bg-muted/40 border-b border-border gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-foreground truncate">
              {filename ||
                (isMermaid
                  ? 'Architecture Diagram'
                  : isHtml
                    ? 'Live Web Application'
                    : 'Expanded Studio View')}
            </span>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-muted text-muted-foreground border border-border">
              {cleanLang.toUpperCase()}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            {isPreviewable && (
              <div className="flex items-center bg-background rounded-lg border border-border p-0.5 mr-2">
                <button
                  onClick={() => setActiveTab('preview')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'preview'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Play className="w-3 h-3 fill-current" />
                  <span>Preview</span>
                </button>
                <button
                  onClick={() => setActiveTab('code')}
                  className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors flex items-center gap-1.5 cursor-pointer ${
                    activeTab === 'code'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  <Code className="w-3 h-3" />
                  <span>Code</span>
                </button>
              </div>
            )}

            <button
              onClick={reloadPreview}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
              title="Refresh"
              aria-label="Refresh Preview"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={downloadFile}
              className="p-1.5 px-2.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground border border-border transition-colors flex items-center gap-1.5 text-xs font-medium cursor-pointer"
              title="Export File"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Export</span>
            </button>
            <button
              onClick={copyToClipboard}
              className="p-1.5 px-2 rounded-lg bg-muted/60 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1 text-xs font-medium cursor-pointer"
              title="Copy Code"
            >
              {copied ? (
                <Check className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </button>
            <button
              onClick={() => setIsExpanded(false)}
              className="p-1.5 rounded-lg bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
              title="Minimize"
            >
              <Minimize2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Expanded Content Canvas */}
        <div className="h-[620px] w-full relative overflow-hidden bg-background">
          {activeTab === 'preview' ? (
            isSlidev ? (
              <PresentationDeck
                content={code}
                title={filename || 'Presentation Deck'}
                className="h-full my-0 border-none rounded-none"
              />
            ) : isHtml || isDiagramHtml || isJsScript ? (
              <iframe
                key={reloadKey}
                title="Expanded Live Preview"
                srcDoc={iframeSrcDoc}
                className="w-full h-full border-none bg-background"
                sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms"
              />
            ) : isReact ? (
              <Sandpack
                template="react-ts"
                theme="dark"
                files={{ '/App.tsx': code }}
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
                    'framer-motion': '^10.12.16',
                    clsx: '^1.2.1',
                    'tailwind-merge': '^1.13.2',
                  },
                }}
              />
            ) : isPython ? (
              <PythonSandbox code={code} />
            ) : isMermaid || isSvg ? (
              <div
                ref={canvasRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                className={`h-full w-full relative overflow-hidden flex items-center justify-center p-6 ${
                  isDragging ? 'cursor-grabbing' : 'cursor-grab'
                }`}
              >
                <div
                  style={{
                    transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale})`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.12s ease-out',
                  }}
                  className="w-full h-full flex items-center justify-center pointer-events-auto [&_svg]:w-full [&_svg]:h-full [&_svg]:max-w-[98%] [&_svg]:max-h-[96%] [&_svg]:mx-auto [&_svg]:my-auto"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(
                      isMermaid
                        ? makeExpandedSvgResponsive(mermaidSvg)
                        : makeExpandedSvgResponsive(code),
                      SANITIZE_OPTIONS as any
                    ),
                  }}
                />
              </div>
            ) : null
          ) : (
            <div
              className="overflow-auto h-full p-4 text-xs font-mono leading-relaxed select-text"
              dangerouslySetInnerHTML={{ __html: html }}
            />
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-card my-3.5 transition-colors duration-200">
      <div className="flex items-center justify-between px-3 py-2 bg-muted/40 border-b border-border text-xs gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-muted-foreground uppercase text-[10px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-muted border border-border shrink-0">
            {cleanLang || 'CODE'}
          </span>

          {isPreviewable && (
            <div className="flex items-center bg-background rounded-md border border-border p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => handleTabChange('preview')}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${
                  activeTab === 'preview'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Live Preview"
              >
                <Play className="w-3 h-3 fill-current" />
                <span>Live Preview</span>
              </button>
              <button
                type="button"
                onClick={() => handleTabChange('code')}
                className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${
                  activeTab === 'code'
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                title="Source Code"
              >
                <Code className="w-3 h-3" />
                <span>Source Code</span>
              </button>
              {isPython && (
                <button
                  type="button"
                  onClick={() => handleTabChange('console')}
                  className={`px-2 py-0.5 text-[11px] font-semibold rounded transition-colors flex items-center gap-1 cursor-pointer ${
                    activeTab === 'console'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="WASM Terminal"
                >
                  <Terminal className="w-3 h-3" />
                  <span>Terminal</span>
                </button>
              )}
            </div>
          )}

          {isStreaming && (
            <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
              <Sparkles className="w-3 h-3 animate-spin text-primary" />
              <span>Streaming code...</span>
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {isPreviewable && activeTab === 'preview' && (isHtml || isDiagramHtml) && (
            <button
              onClick={reloadPreview}
              title="Refresh Preview"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          )}

          <button
            onClick={copyToClipboard}
            title="Copy Code"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            onClick={downloadFile}
            title="Export Code"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {onArtifactClick ? (
            <button
              onClick={handleOpenInCanvas}
              title="Open in Side Panel"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          ) : (
            <button
              onClick={() => setIsExpanded(true)}
              title="Expand View"
              className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <Maximize2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'preview' && isPreviewable ? (
        <div className="w-full relative overflow-hidden bg-[#09090b]">
          {isSlidev ? (
            <PresentationDeck content={code} title={filename || 'Presentation Deck'} />
          ) : isHtml || isDiagramHtml || isJsScript ? (
            <div className="w-full min-h-[360px] max-h-[560px] relative bg-[#09090b]">
              <iframe
                key={reloadKey}
                title="Live Code Preview"
                srcDoc={iframeSrcDoc}
                className="w-full h-[440px] border-none bg-[#09090b]"
                style={{ colorScheme: 'dark', backgroundColor: '#09090b' }}
                sandbox="allow-scripts allow-same-origin allow-modals allow-popups allow-forms"
              />
            </div>
          ) : isReact ? (
            <div className="w-full min-h-[380px] max-h-[580px] overflow-hidden bg-background">
              <Sandpack
                template="react-ts"
                theme="dark"
                files={{ '/App.tsx': code }}
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
                    'framer-motion': '^10.12.16',
                    clsx: '^1.2.1',
                    'tailwind-merge': '^1.13.2',
                  },
                }}
              />
            </div>
          ) : isPython ? (
            <div className="w-full h-[360px] overflow-hidden bg-background">
              <PythonSandbox code={code} />
            </div>
          ) : isMermaid ? (
            <div className="p-4 flex flex-col items-center justify-center bg-card/40 overflow-x-auto min-h-[160px] max-h-[460px]">
              {mermaidSvg ? (
                <div
                  className="w-full flex items-center justify-center overflow-auto p-2 min-h-[140px] [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto"
                  dangerouslySetInnerHTML={{
                    __html: DOMPurify.sanitize(mermaidSvg, SANITIZE_OPTIONS as any),
                  }}
                />
              ) : (
                <div className="w-full flex items-center justify-center p-6 text-xs text-muted-foreground font-mono animate-pulse">
                  Rendering Architecture Diagram...
                </div>
              )}
            </div>
          ) : (
            <div className="p-4 flex flex-col items-center justify-center bg-card/40 overflow-x-auto min-h-[160px] max-h-[460px]">
              <div
                className="w-full max-w-full overflow-auto flex items-center justify-center p-2 min-h-[140px] [&_svg]:max-w-full [&_svg]:h-auto [&_svg]:mx-auto"
                dangerouslySetInnerHTML={{
                  __html: DOMPurify.sanitize(makeSvgResponsive(code), SANITIZE_OPTIONS as any),
                }}
              />
            </div>
          )}
        </div>
      ) : activeTab === 'console' && isPython ? (
        <div className="w-full h-[360px] overflow-hidden bg-background">
          <PythonSandbox code={code} />
        </div>
      ) : (
        <div
          className="overflow-x-auto max-h-[420px] overflow-y-auto p-3 text-xs font-mono leading-relaxed select-text bg-card"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
