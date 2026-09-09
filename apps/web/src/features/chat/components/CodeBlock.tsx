import React, { useState, useCallback } from 'react';
import {
  Download,
  Check,
  ExternalLink,
  Sparkles,
  Columns,
  Pencil,
  X,
  Send,
  Presentation,
} from 'lucide-react';
import { CopyIcon as Copy } from '@animateicons/react/lucide';
import { toast } from '@src/shared/components/ui/sonner';
import { SvgDiagramCard } from './SvgDiagramCard';

export interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
  isStreaming?: boolean;
  isEditable?: boolean;
  onCodeChange?: (newCode: string) => void;
  onAskAiEdit?: (instruction: string) => void;
  onOpenCodePanel?: (item: {
    code: string;
    language: string;
    filename?: string;
    title?: string;
    isStreaming?: boolean;
    initialTab?: 'code' | 'preview';
  }) => void;
  onVisualClick?: (visual: { type: 'slidev' | 'diagram'; title: string; content: string }) => void;
  onArtifactClick?: (artifact: {
    id: string;
    type: string;
    title: string;
    content: string;
    language?: string;
  }) => void;
}

/**
 * Automatically fits and crops an SVG so it completely occupies 100% of the
 * response width without dead outer canvas padding or shrunken inner cards.
 */
export function fitSvgToResponseWidth(svgCode: string): string {
  if (!svgCode || typeof svgCode !== 'string') return svgCode;

  let result = svgCode.trim();

  // 1. Extract original dimensions and viewBox before stripping attributes
  const origWidthMatch = result.match(/<svg\b[^>]*\bwidth=["']([0-9.]+)(?:px)?["']/i);
  const origHeightMatch = result.match(/<svg\b[^>]*\bheight=["']([0-9.]+)(?:px)?["']/i);
  const vbMatch = result.match(
    /\bviewBox=["']\s*([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s+([0-9.-]+)\s*["']/i
  );

  let minX = 0;
  let minY = 0;
  let vbWidth = 0;
  let vbHeight = 0;

  if (vbMatch) {
    minX = parseFloat(vbMatch[1]);
    minY = parseFloat(vbMatch[2]);
    vbWidth = parseFloat(vbMatch[3]);
    vbHeight = parseFloat(vbMatch[4]);
  } else if (origWidthMatch && origHeightMatch) {
    vbWidth = parseFloat(origWidthMatch[1]);
    vbHeight = parseFloat(origHeightMatch[1]);
  }

  // 2. Ensure root <svg> has viewBox, responsive width="100%", preserveAspectRatio, and no fixed pixel bounds
  result = result.replace(/<svg\b([^>]*)>/i, (_, attrs) => {
    let cleanAttrs = attrs
      .replace(/\bwidth=["'][^"']*["']/gi, '')
      .replace(/\bheight=["'][^"']*["']/gi, '')
      .trim();

    if (!/\bviewBox=["']/i.test(cleanAttrs) && vbWidth > 0 && vbHeight > 0) {
      cleanAttrs += ` viewBox="${minX} ${minY} ${vbWidth} ${vbHeight}"`;
    }

    if (!/\bpreserveAspectRatio=["']/i.test(cleanAttrs)) {
      cleanAttrs += ' preserveAspectRatio="xMidYMid meet"';
    }

    return `<svg ${cleanAttrs} width="100%" height="auto">`;
  });

  if (isNaN(vbWidth) || isNaN(vbHeight) || vbWidth <= 0 || vbHeight <= 0) return result;

  // 3. Search for content cards (rectangles).
  // A multi-card dashboard or multi-column layout must NEVER have its viewBox cropped,
  // as cropping would eliminate adjacent panels, sidebars, or comparative cards.
  const rectRegex = /<rect\b([^>]*)\/?>/gi;
  let m: RegExpExecArray | null;
  const contentCards: Array<{ x: number; y: number; width: number; height: number }> = [];

  while ((m = rectRegex.exec(result)) !== null) {
    const attrs = m[1];
    const xMatch = attrs.match(/\bx=["']([0-9.]+)["']/i);
    const yMatch = attrs.match(/\by=["']([0-9.]+)["']/i);
    const wMatch = attrs.match(/\bwidth=["']([0-9.]+)["']/i);
    const hMatch = attrs.match(/\bheight=["']([0-9.]+)["']/i);

    if (wMatch && hMatch) {
      const rx = xMatch ? parseFloat(xMatch[1]) : 0;
      const ry = yMatch ? parseFloat(yMatch[1]) : 0;
      const rw = parseFloat(wMatch[1]);
      const rh = parseFloat(hMatch[1]);

      // Exclude full-canvas background rects that cover >= 95% of viewBox dimensions
      const isCanvasBackground =
        rx <= 5 && ry <= 5 && rw >= vbWidth * 0.95 && rh >= vbHeight * 0.95;

      if (!isCanvasBackground && rw >= 60 && rh >= 40) {
        contentCards.push({ x: rx, y: ry, width: rw, height: rh });
      }
    }
  }

  // Only consider cropping if there is EXACTLY ONE isolated container card.
  // If there are multiple cards, the author/model has designed a multi-column or multi-card layout.
  if (contentCards.length !== 1) {
    return result;
  }

  const singleCard = contentCards[0];

  // A card only has dead outer margins if it takes <= 92% of viewBox and is noticeably offset
  const hasDeadMargins =
    singleCard.width <= vbWidth * 0.92 &&
    singleCard.height <= vbHeight * 0.92 &&
    (singleCard.x >= 30 || singleCard.y >= 25);

  if (!hasDeadMargins) {
    return result;
  }

  // Check if any visual or textual elements exist outside the single card boundary.
  // If outer headers, footers, or annotations exist, expand the crop boundary to include them safely.
  let cropMinX = Math.max(0, singleCard.x - 1);
  let cropMinY = Math.max(0, singleCard.y - 1);
  let cropMaxX = singleCard.x + singleCard.width + 1;
  let cropMaxY = singleCard.y + singleCard.height + 1;

  // Scan text elements to ensure outer titles/labels are not clipped
  const textFullRegex = /<text\b([^>]*)>([\s\S]*?)<\/text>/gi;
  let tm: RegExpExecArray | null;
  while ((tm = textFullRegex.exec(result)) !== null) {
    const tAttrs = tm[1];
    const textBody = tm[2].replace(/<[^>]+>/g, '').trim();
    const txM = tAttrs.match(/\bx=["']([0-9.-]+)["']/i);
    const tyM = tAttrs.match(/\by=["']([0-9.-]+)["']/i);
    const fsM = tAttrs.match(/\bfont-size=["']([0-9.]+)["']/i);

    if (txM && tyM) {
      const tx = parseFloat(txM[1]);
      const ty = parseFloat(tyM[1]);
      const fontSize = fsM ? parseFloat(fsM[1]) : 12;
      const estimatedTextWidth = textBody.length * fontSize * 0.65;

      if (tx < cropMinX) cropMinX = Math.max(0, tx - 12);
      if (ty - fontSize - 4 < cropMinY) cropMinY = Math.max(0, ty - fontSize - 8);
      if (tx + estimatedTextWidth > cropMaxX) {
        cropMaxX = Math.min(vbWidth, Math.max(cropMaxX, tx + estimatedTextWidth + 12));
      }
      if (ty + 8 > cropMaxY) cropMaxY = Math.min(vbHeight, ty + 12);
    }
  }

  const newW = cropMaxX - cropMinX;
  const newH = cropMaxY - cropMinY;

  result = result.replace(
    /\bviewBox=["'][^"']*["']/i,
    `viewBox="${cropMinX} ${cropMinY} ${newW} ${newH}"`
  );

  return result;
}

/**
 * Compact CodeBlock pill — shows only the header bar in chat.
 * Full code view + live preview open in the right-side CodeBlockPanel.
 */
export function CodeBlock({
  code,
  language,
  filename,
  isStreaming = false,
  isEditable = true,
  onCodeChange,
  onAskAiEdit,
  onOpenCodePanel,
  onVisualClick,
  onArtifactClick,
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');

  const cleanLang = (language || '').toLowerCase().trim();
  const isSvg =
    cleanLang === 'svg' ||
    (cleanLang === 'xml' && /^\s*<svg\b/i.test(code.trim())) ||
    (/^\s*<svg\b/i.test(code.trim()) && /<\/svg>\s*$/i.test(code.trim()));
  const isDiagram =
    cleanLang === 'diagram-design' ||
    cleanLang === 'diagram' ||
    isSvg ||
    ((cleanLang === 'html' || cleanLang === 'xml') &&
      (/<svg\b/i.test(code) || /class="[^"]*diagram/i.test(code) || /viewBox=/i.test(code)));

  const isSlidev =
    cleanLang === 'slidev' ||
    ((cleanLang === 'markdown' || cleanLang === 'md') && code.includes('layout:'));

  const handleOpenVisualWindow = useCallback(() => {
    if (onVisualClick) {
      onVisualClick({
        type: 'slidev',
        title: filename || 'Presentation Deck',
        content: code,
      });
    }
  }, [onVisualClick, filename, code]);

  const lineCount = code.split('\n').length;
  const charCount = code.length;

  const copyToClipboard = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  const downloadFile = useCallback(() => {
    const extMap: Record<string, string> = {
      javascript: 'js',
      js: 'js',
      typescript: 'ts',
      ts: 'ts',
      jsx: 'jsx',
      tsx: 'tsx',
      python: 'py',
      py: 'py',
      rust: 'rs',
      go: 'go',
      html: 'html',
      css: 'css',
      json: 'json',
      sql: 'sql',
      bash: 'sh',
      shell: 'sh',
    };
    const ext = extMap[cleanLang] || cleanLang || 'txt';
    const name = filename || `nyx-export-${Date.now()}.${ext}`;
    const blob = new Blob([code], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${name}`);
  }, [code, cleanLang, filename]);

  const handleOpenInSidePanel = useCallback(() => {
    const item = {
      code,
      language: cleanLang,
      filename,
      title: filename || 'Code Block',
      isStreaming,
    };
    if (onOpenCodePanel) {
      onOpenCodePanel(item);
    } else if (onArtifactClick) {
      onArtifactClick({
        id: `code-${Date.now()}`,
        type: 'code',
        title: item.title!,
        content: code,
        language: cleanLang,
      });
    }
  }, [code, cleanLang, filename, isStreaming, onOpenCodePanel, onArtifactClick]);

  const handleSendAiPrompt = useCallback(() => {
    if (!aiPrompt.trim() || !onAskAiEdit) return;
    onAskAiEdit(
      `[MODIFY CODE SNIPPET]:\n\`\`\`${cleanLang || 'code'}\n${code}\n\`\`\`\n\n[USER REQUEST]:\n${aiPrompt.trim()}`
    );
    setShowAiPrompt(false);
    setAiPrompt('');
    toast.success('Edit instruction sent to AI');
  }, [aiPrompt, onAskAiEdit, cleanLang, code]);

  // If this code block is an editorial diagram / SVG, render ONLY the final visual
  // directly in the full chat message space with double-click expand/minimize.
  if (isDiagram) {
    if (!code.trim()) return null;
    return <SvgDiagramCard svgCode={code} />;
  }

  return (
    <div className="rounded-lg overflow-hidden border border-white/10 bg-[#09090b] my-2 transition-colors duration-200">
      {/* Compact header — the only thing rendered in chat */}
      <div className="flex items-center justify-between px-3 py-2 gap-2 select-none">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono text-[10px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-zinc-400 shrink-0">
            {cleanLang || 'CODE'}
          </span>
          {filename && (
            <span className="font-mono text-zinc-300 text-[11px] truncate tracking-tight">
              {filename}
            </span>
          )}
          <span className="text-[10px] font-mono text-zinc-600 shrink-0">
            {isStreaming ? 'Streaming…' : `${lineCount}L · ${charCount}c`}
          </span>
        </div>

        <div className="flex items-center gap-0.5 shrink-0">
          {/* Copy */}
          <button
            onClick={copyToClipboard}
            title="Copy Code"
            className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            {copied ? (
              <Check className="w-3.5 h-3.5 text-emerald-400" />
            ) : (
              <Copy className="w-3.5 h-3.5" />
            )}
          </button>

          {/* Download */}
          <button
            onClick={downloadFile}
            title="Download File"
            className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <Download className="w-3.5 h-3.5" />
          </button>

          {/* Ask AI */}
          {isEditable && !isStreaming && onAskAiEdit && (
            <button
              onClick={() => setShowAiPrompt((p) => !p)}
              title="Ask AI to Edit"
              className={`p-1 rounded transition-colors cursor-pointer ${showAiPrompt ? 'bg-primary/20 text-primary' : 'hover:bg-white/10 text-zinc-500 hover:text-zinc-100'}`}
            >
              <Sparkles className="w-3.5 h-3.5" />
            </button>
          )}

          {/* Open in Side Code Panel (code + live preview) */}
          <button
            onClick={handleOpenInSidePanel}
            title="Open in Code Panel"
            className="p-1 rounded hover:bg-white/10 text-zinc-500 hover:text-zinc-100 transition-colors cursor-pointer"
          >
            <Columns className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Inline Ask-AI prompt — only shown if triggered, still no code body */}
      {showAiPrompt && onAskAiEdit && (
        <div className="px-3 py-2 bg-[#121214] border-t border-white/10 flex items-center gap-2">
          <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />
          <input
            type="text"
            value={aiPrompt}
            onChange={(e) => setAiPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSendAiPrompt();
              if (e.key === 'Escape') setShowAiPrompt(false);
            }}
            placeholder="Describe your edit request…"
            className="flex-1 bg-black/40 border border-white/10 rounded px-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-primary/50"
            autoFocus
          />
          <button
            onClick={handleSendAiPrompt}
            disabled={!aiPrompt.trim()}
            className="px-2.5 py-1 rounded bg-primary text-primary-foreground text-xs font-medium hover:bg-primary/90 disabled:opacity-40 transition-colors flex items-center gap-1 cursor-pointer"
          >
            <Send className="w-3 h-3" />
            <span>Send</span>
          </button>
          <button
            onClick={() => setShowAiPrompt(false)}
            className="p-1 text-zinc-400 hover:text-white rounded transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Interactive Deck Banner for Slidev Presentations */}
      {isSlidev && !showAiPrompt && (
        <div
          onClick={handleOpenVisualWindow}
          className="relative border-t border-white/5 bg-[#09090b] p-3.5 flex items-center justify-between cursor-pointer group/preview transition-colors hover:bg-[#121214]"
          title="Click to launch presentation deck"
        >
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-zinc-300 group-hover/preview:text-white transition-colors">
              <Presentation className="w-4 h-4" />
            </div>
            <div className="flex flex-col">
              <span className="text-xs font-medium text-zinc-200 group-hover/preview:text-white transition-colors">
                {filename || 'Interactive Slidev Presentation Deck'}
              </span>
              <span className="text-[10px] text-zinc-500 font-mono">
                Click to launch full-screen interactive presentation deck
              </span>
            </div>
          </div>
          <div className="flex items-center gap-1 text-xs font-medium text-zinc-400 group-hover/preview:text-white transition-colors pr-1">
            <span>Launch Deck</span>
            <span>→</span>
          </div>
        </div>
      )}
    </div>
  );
}
