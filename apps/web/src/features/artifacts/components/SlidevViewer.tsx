import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileText,
  Download,
  Copy,
  Check,
  Grid,
  Clock,
  Play,
  Pause,
  RotateCcw,
  Sparkles,
  Presentation,
  Share2,
  Palette,
  Eye,
  Sliders,
  ExternalLink,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeRaw from 'rehype-raw';
import { toast } from '@src/shared/components/ui/sonner';
import { parseSlidevMarkdown, ParsedSlidevDeck, SlidevSlide } from '../utils/slidevParser';
import { exportSlidevToPptx } from '../utils/pptxExporter';
import { CodeBlock } from '@src/components/chat/CodeBlock';

interface SlidevViewerProps {
  content: string;
  title?: string;
  isCanvasMode?: boolean;
  onOpenCanvas?: () => void;
}

/**
 * Sanitizes template placeholders that some models accidentally output
 */
function sanitizeSlideContent(text: string): string {
  if (!text) return '';
  const today = new Date().toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  return text
    .replace(/\{\{\s*date\s*\}\}/gi, today)
    .replace(/\{\{\s*author\s*\}\}/gi, 'NYX AI Studio')
    .replace(/\{\{\s*presenter\s*\}\}/gi, 'NYX Intelligence')
    .replace(
      /Presenter:\s*(?:Your Name|\[Your Name\]|<Your Name>|Name)/gi,
      'Presented by: NYX Intelligence'
    )
    .replace(/Date:\s*(?:Your Date|\[Date\]|<Date>)/gi, `Date: ${today}`);
}

export const SlidevViewer: React.FC<SlidevViewerProps> = ({
  content,
  title: initialTitle,
  isCanvasMode = false,
  onOpenCanvas,
}) => {
  const sanitizedRaw = useMemo(() => sanitizeSlideContent(content), [content]);
  const deck: ParsedSlidevDeck = useMemo(() => parseSlidevMarkdown(sanitizedRaw), [sanitizedRaw]);

  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [currentClickStep, setCurrentClickStep] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showPresenterNotes, setShowPresenterNotes] = useState(false);
  const [showThumbnailGrid, setShowThumbnailGrid] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isExportingPptx, setIsExportingPptx] = useState(false);

  // Presenter mode stopwatch timer
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [isTimerRunning, setIsTimerRunning] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);

  const currentSlide: SlidevSlide | undefined = deck.slides[currentSlideIndex] || deck.slides[0];
  const totalSlides = deck.slides.length;
  const theme = (deck.headmatter.theme || 'default').toLowerCase();

  // Navigation
  const goToNextSlide = useCallback(() => {
    if (currentSlide && currentClickStep < currentSlide.clicksCount) {
      setCurrentClickStep((prev) => prev + 1);
      return;
    }
    if (currentSlideIndex < totalSlides - 1) {
      setCurrentSlideIndex((prev) => prev + 1);
      setCurrentClickStep(0);
    }
  }, [currentSlide, currentClickStep, currentSlideIndex, totalSlides]);

  const goToPrevSlide = useCallback(() => {
    if (currentClickStep > 0) {
      setCurrentClickStep((prev) => prev - 1);
      return;
    }
    if (currentSlideIndex > 0) {
      setCurrentSlideIndex((prev) => prev - 1);
      const prevSlide = deck.slides[currentSlideIndex - 1];
      setCurrentClickStep(prevSlide?.clicksCount || 0);
    }
  }, [currentClickStep, currentSlideIndex, deck.slides]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goToNextSlide();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        goToPrevSlide();
      } else if (e.key === 'f' || e.key === 'F11') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'g' || e.key === 'G') {
        setShowThumbnailGrid((prev) => !prev);
      } else if (e.key === 'n' || e.key === 'N') {
        setShowPresenterNotes((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNextSlide, goToPrevSlide]);

  // Timer interval
  useEffect(() => {
    let interval: any;
    if (isTimerRunning) {
      interval = setInterval(() => {
        setTimerSeconds((prev) => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTimer = (totalSecs: number) => {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const toggleFullscreen = () => {
    if (!containerRef.current) return;
    if (!document.fullscreenElement) {
      containerRef.current
        .requestFullscreen()
        .then(() => setIsFullscreen(true))
        .catch(() => {});
    } else {
      document
        .exitFullscreen()
        .then(() => setIsFullscreen(false))
        .catch(() => {});
    }
  };

  // Copy Markdown
  const handleCopyMarkdown = () => {
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    toast.success('Slidev Markdown copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Download slides.md
  const handleDownloadMarkdown = () => {
    const titleSlug = (deck.headmatter.title || initialTitle || 'presentation')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_');
    const blob = new Blob([content], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleSlug || 'slides'}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded slides.md');
  };

  // Export to PowerPoint (.pptx)
  const handleExportPptx = async () => {
    try {
      setIsExportingPptx(true);
      toast.info('Building PowerPoint presentation...');
      await exportSlidevToPptx(deck, {
        fileName: deck.headmatter.title || initialTitle || 'presentation',
        author: 'NYX Slidev Studio',
      });
      toast.success('PowerPoint deck exported successfully!');
    } catch (err: any) {
      toast.error(`Export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExportingPptx(false);
    }
  };

  // Export standalone HTML presentation
  const handleExportHtml = () => {
    const titleText = deck.headmatter.title || initialTitle || 'Slidev Presentation';
    const htmlSource = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${titleText}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700;800;900&family=Plus+Jakarta+Sans:wght@300;400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap" rel="stylesheet">
  <style>
    body { background: #06080e; color: #f1f5f9; font-family: 'Plus Jakarta Sans', system-ui, sans-serif; }
    h1, h2, h3 { font-family: ${theme === 'seriph' ? "'Playfair Display', serif" : "'Plus Jakarta Sans', sans-serif"}; }
    .slide-card { min-height: 85vh; margin: 48px auto; max-width: 1100px; padding: 64px; background: #0c101d; border: 1px solid #1e293b; border-radius: 24px; box-shadow: 0 25px 50px -12px rgba(0,0,0,0.7); position: relative; overflow: hidden; }
    .footer { text-align: center; padding: 32px; color: #71717a; font-size: 0.875rem; font-family: monospace; }
  </style>
</head>
<body class="p-6 md:p-12">
  <div class="max-w-5xl mx-auto mb-10 text-center">
    <div class="inline-block px-4 py-1 rounded-full bg-zinc-900 border border-white/10 text-zinc-300 text-xs font-semibold uppercase tracking-widest mb-3">Slidev Presentation Studio</div>
    <h1 class="text-4xl md:text-5xl font-extrabold text-white">${titleText}</h1>
  </div>
  ${deck.slides
    .map(
      (s) => `
    <div class="slide-card">
      <div class="flex justify-between items-center mb-8 text-xs font-mono text-zinc-400 uppercase tracking-widest">
        <span>Slide ${s.index} of ${totalSlides}</span>
        <span class="px-3 py-1 rounded-full bg-zinc-900 border border-white/10 text-zinc-300 font-bold">${s.layout}</span>
      </div>
      <h1 class="text-3xl md:text-4xl font-extrabold mb-6 text-white">${s.title}</h1>
      <div class="text-base md:text-lg text-zinc-300 leading-relaxed">
        ${s.content.replace(/\n/g, '<br/>')}
      </div>
      ${
        s.notes
          ? `<div class="mt-10 p-5 bg-zinc-900 border border-white/10 rounded-xl text-sm text-zinc-400"><strong>Speaker Notes:</strong> ${s.notes}</div>`
          : ''
      }
    </div>
  `
    )
    .join('\n')}
  <div class="footer">Built with NYX Slidev Presentation Studio • ${totalSlides} Slides</div>
</body>
</html>`;

    const blob = new Blob([htmlSource], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${titleText.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded standalone HTML presentation');
  };

  // High-fidelity Markdown renderer for slide contents
  const markdownComponents = useMemo(
    () => ({
      pre({ children }: any) {
        return children;
      },
      code({ inline, className, children, ...props }: any) {
        const match = /language-(\w+)/.exec(className || '');
        if (!inline && match) {
          return <CodeBlock code={String(children)} language={match[1]} />;
        }
        return (
          <code
            className="px-2 py-0.5 mx-1 rounded-md bg-zinc-900 border border-white/10 text-zinc-300 text-xs md:text-sm font-mono"
            {...props}
          >
            {children}
          </code>
        );
      },
      h1: ({ children }: any) => (
        <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold tracking-tight text-white mb-3 leading-tight">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-lg md:text-xl lg:text-2xl font-bold tracking-tight text-zinc-200 mt-3 mb-2">
          {children}
        </h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-sm md:text-base font-semibold text-zinc-300 mt-2 mb-1">{children}</h3>
      ),
      p: ({ children }: any) => (
        <div className="text-sm md:text-base text-zinc-300 leading-relaxed my-2">{children}</div>
      ),
      ul: ({ children }: any) => (
        <ul className="space-y-2 my-2 text-sm md:text-base text-zinc-300 list-none pl-0">
          {React.Children.map(children, (child) => {
            if (!child) return null;
            return (
              <li className="flex items-start gap-2.5 leading-relaxed">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-white mt-2 shrink-0" />
                <span>{child.props ? child.props.children : child}</span>
              </li>
            );
          })}
        </ul>
      ),
      ol: ({ children }: any) => (
        <ol className="list-decimal pl-5 space-y-1.5 my-2 text-sm md:text-base text-zinc-300">
          {children}
        </ol>
      ),
      li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
      blockquote: ({ children }: any) => (
        <blockquote className="border-l-2 border-white/40 bg-zinc-900/40 pl-4 py-2.5 my-3 italic text-zinc-200 rounded-r-xl text-sm md:text-base">
          {children}
        </blockquote>
      ),
      table: ({ children }: any) => (
        <div className="overflow-x-auto my-3 rounded-lg border border-white/10 bg-[#09090b]">
          <table className="w-full text-left text-xs md:text-sm text-zinc-300 border-collapse">
            {children}
          </table>
        </div>
      ),
      thead: ({ children }: any) => (
        <thead className="bg-[#121214] border-b border-white/10 text-white font-mono uppercase text-[10px] md:text-xs tracking-wider">
          {children}
        </thead>
      ),
      tbody: ({ children }: any) => <tbody className="divide-y divide-white/5">{children}</tbody>,
      tr: ({ children }: any) => (
        <tr className="hover:bg-white/[0.02] transition-colors">{children}</tr>
      ),
      th: ({ children }: any) => (
        <th className="px-3.5 py-2.5 font-semibold text-white">{children}</th>
      ),
      td: ({ children }: any) => (
        <td className="px-3.5 py-2.5 text-zinc-300 leading-normal">{children}</td>
      ),
    }),
    []
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-[#000000] border border-white/10 rounded-xl overflow-hidden shadow-2xl transition-all duration-300 ${
        isFullscreen
          ? 'fixed inset-0 z-50 rounded-none h-screen w-screen border-none'
          : isCanvasMode
            ? 'w-full h-full min-h-[600px]'
            : 'w-full my-4 min-h-[500px]'
      }`}
    >
      {/* ── TOP CONTROL BAR ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-[#09090b] border-b border-white/10 text-foreground shrink-0 select-none">
        {/* Left: Presentation Title & Meta */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-900 border border-white/10 text-zinc-200 shrink-0">
            <Presentation className="w-4.5 h-4.5" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs md:text-sm font-bold text-white truncate max-w-[180px] sm:max-w-xs md:max-w-md">
              {deck.headmatter.title || initialTitle || 'Slidev Presentation'}
            </span>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 uppercase tracking-wider font-mono">
              <span className="text-zinc-300 font-semibold">
                {deck.headmatter.theme || 'seriph'}
              </span>
              <span>•</span>
              <span>
                Slide {currentSlideIndex + 1} of {totalSlides}
              </span>
            </div>
          </div>
        </div>

        {/* Center: Slide Switcher */}
        <div className="flex items-center gap-1.5 bg-surface border border-border/60 rounded-xl px-2 py-1 shadow-sm">
          <button
            onClick={goToPrevSlide}
            disabled={currentSlideIndex === 0 && currentClickStep === 0}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
            title="Previous slide (Left Arrow)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <span className="text-xs font-mono font-bold px-2 text-foreground select-none">
            {currentSlideIndex + 1} / {totalSlides}
          </span>

          <button
            onClick={goToNextSlide}
            disabled={
              currentSlideIndex === totalSlides - 1 &&
              (!currentSlide || currentClickStep >= currentSlide.clicksCount)
            }
            className="p-1.5 rounded-lg text-muted-foreground hover:text-white hover:bg-muted disabled:opacity-30 disabled:hover:bg-transparent transition-all cursor-pointer"
            title="Next slide (Right Arrow or Space)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1.5">
          {/* Thumbnails grid */}
          <button
            onClick={() => setShowThumbnailGrid(!showThumbnailGrid)}
            className={`p-2 rounded-lg border transition-all cursor-pointer text-xs flex items-center gap-1.5 ${
              showThumbnailGrid
                ? 'bg-zinc-900 border-white/30 text-white'
                : 'border-border/60 hover:bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
            title="Slide Overview Grid (G)"
          >
            <Grid className="w-4 h-4" />
            <span className="hidden md:inline">Overview</span>
          </button>

          {/* Presenter Notes */}
          <button
            onClick={() => setShowPresenterNotes(!showPresenterNotes)}
            className={`p-2 rounded-lg border transition-all cursor-pointer text-xs flex items-center gap-1.5 ${
              showPresenterNotes
                ? 'bg-zinc-900 border-white/30 text-white'
                : 'border-border/60 hover:bg-zinc-900 text-zinc-400 hover:text-white'
            }`}
            title="Presenter Notes (N)"
          >
            <Clock className="w-4 h-4" />
            <span className="hidden md:inline">Presenter</span>
          </button>

          {/* Export PPTX */}
          <button
            onClick={handleExportPptx}
            disabled={isExportingPptx}
            className="px-3 py-1.5 rounded-lg bg-white text-black hover:bg-zinc-200 font-semibold text-xs flex items-center gap-1.5 shadow-sm transition-all cursor-pointer disabled:opacity-50"
            title="Export genuine PowerPoint (.pptx) file"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isExportingPptx ? 'Exporting...' : 'PPTX'}</span>
          </button>

          {/* Export HTML */}
          <button
            onClick={handleExportHtml}
            className="p-2 rounded-lg border border-border/60 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Export Standalone HTML presentation"
          >
            <Share2 className="w-4 h-4" />
          </button>

          {/* Download Markdown */}
          <button
            onClick={handleDownloadMarkdown}
            className="p-2 rounded-lg border border-border/60 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Download Slidev Markdown (slides.md)"
          >
            <FileText className="w-4 h-4" />
          </button>

          {/* Open in Canvas */}
          {!isCanvasMode && onOpenCanvas && (
            <button
              onClick={onOpenCanvas}
              className="p-2 rounded-lg border border-border/60 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer"
              title="Open full presentation in Canvas Studio"
            >
              <Sparkles className="w-4 h-4 text-zinc-300" />
            </button>
          )}

          {/* Fullscreen Toggle */}
          <button
            onClick={toggleFullscreen}
            className="p-2 rounded-lg border border-border/60 hover:bg-zinc-900 text-zinc-400 hover:text-white transition-all cursor-pointer"
            title="Toggle Fullscreen (F)"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* ── PRESENTATION STAGE & SIDE PANELS ── */}
      <div className="relative flex-1 flex overflow-hidden min-h-[420px]">
        {/* SLIDE CANVAS CONTAINER */}
        <div className="flex-1 flex items-center justify-center p-4 md:p-6 lg:p-8 bg-[#000000] overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentSlideIndex}
              initial={{ opacity: 0, scale: 0.98, y: 10 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.98, y: -10 }}
              transition={{ duration: 0.22, ease: 'easeOut' }}
              className={`w-full max-w-4xl min-h-[380px] bg-[#0c0c0e] border border-white/10 rounded-xl p-6 md:p-10 shadow-2xl flex flex-col justify-between relative ${
                currentSlide?.classNames || ''
              }`}
              style={{
                backgroundImage: currentSlide?.background
                  ? currentSlide.background.startsWith('http')
                    ? `linear-gradient(rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.94)), url(${currentSlide.background})`
                    : undefined
                  : undefined,
                backgroundSize: 'cover',
                backgroundPosition: 'center',
              }}
            >
              {/* Top Meta Bar */}
              <div className="flex items-center justify-between z-10 select-none pb-3 border-b border-white/10 mb-4">
                <div className="flex items-center gap-2">
                  <span className="px-3 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-white/10 text-zinc-300">
                    {currentSlide?.layout || 'Slide'}
                  </span>
                  {currentSlide?.clicksCount ? (
                    <span className="text-[10px] text-zinc-500 font-mono">
                      Step {currentClickStep + 1} / {currentSlide.clicksCount + 1}
                    </span>
                  ) : null}
                </div>
                <span className="text-xs font-mono font-semibold text-zinc-400">
                  {currentSlideIndex + 1} / {totalSlides}
                </span>
              </div>

              {/* Dynamic Slide Content */}
              <div className="flex-1 flex flex-col justify-center z-10 my-2">
                {/* 1. COVER / INTRO LAYOUT */}
                {currentSlide?.layout === 'cover' ||
                currentSlide?.layout === 'intro' ||
                currentSlideIndex === 0 ? (
                  <div className="flex flex-col justify-center items-start space-y-4 max-w-2xl py-2">
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 shadow-sm">
                      <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                      <span className="text-[10px] md:text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
                        EXECUTIVE BRIEFING • STRATEGIC REPORT
                      </span>
                    </div>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white tracking-tight leading-tight">
                      {currentSlide.title}
                    </h1>
                    <div className="prose prose-invert max-w-none text-zinc-300 text-base md:text-lg leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {currentSlide.content.replace(/^#+\s+[^\n]+\n?/, '')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : currentSlide?.layout === 'section' || currentSlide?.layout === 'chapter' ? (
                  /* 2. SECTION / CHAPTER LAYOUT */
                  <div className="flex flex-col items-center justify-center text-center p-6 max-w-2xl mx-auto space-y-4 py-8">
                    <span className="px-3.5 py-1 rounded-full text-xs font-mono font-bold tracking-widest uppercase bg-zinc-900 border border-white/10 text-zinc-300">
                      Section {currentSlideIndex + 1}
                    </span>
                    <h1 className="text-3xl md:text-4xl lg:text-5xl font-black text-white leading-tight">
                      {currentSlide.title}
                    </h1>
                    <div className="prose prose-invert max-w-none text-zinc-300 text-base md:text-lg leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {currentSlide.content.replace(/^#+\s+[^\n]+\n?/, '')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : currentSlide?.layout === 'end' || currentSlide?.layout === 'conclusion' ? (
                  /* 3. END / CONCLUSION LAYOUT */
                  <div className="flex flex-col justify-center space-y-4 max-w-3xl mx-auto p-4 py-6">
                    <div className="flex items-center gap-2">
                      <span className="px-3 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider bg-zinc-900 border border-white/10 text-zinc-300">
                        Conclusion & Action Plan
                      </span>
                    </div>
                    <h1 className="text-2xl md:text-3xl lg:text-4xl font-extrabold text-white">
                      {currentSlide.title || 'Summary & Next Steps'}
                    </h1>
                    <div className="p-5 rounded-xl bg-[#121214] border border-white/10">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {currentSlide.content.replace(/^#+\s+[^\n]+\n?/, '')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : currentSlide?.layout === 'fact' ? (
                  /* 4. FACT / STAT LAYOUT */
                  <div className="flex flex-col items-center justify-center text-center p-6 max-w-2xl mx-auto space-y-4 py-8">
                    <span className="px-3.5 py-1 rounded-full text-[10px] font-mono font-bold tracking-widest uppercase bg-zinc-900 border border-white/10 text-zinc-300">
                      Key Performance Indicator
                    </span>
                    <h1 className="text-5xl md:text-6xl font-black text-white tracking-tight">
                      {currentSlide.title}
                    </h1>
                    <div className="prose prose-invert max-w-none text-zinc-300 text-base md:text-lg leading-relaxed max-w-xl">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {currentSlide.content.replace(/^#+\s+[^\n]+\n?/, '')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : currentSlide?.layout === 'two-cols' ||
                  currentSlide?.layout === 'two-cols-header' ||
                  (currentSlide?.leftContent && currentSlide?.rightContent) ? (
                  /* 5. TWO-COLUMN LAYOUT (::right::) */
                  <div className="flex flex-col h-full space-y-3">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-white border-b border-white/10 pb-2">
                      {currentSlide.title}
                    </h1>
                    {currentSlide.headerContent && (
                      <div className="text-sm md:text-base text-zinc-300 mb-1">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={markdownComponents}
                        >
                          {currentSlide.headerContent.replace(/^#+\s+[^\n]+\n?/, '')}
                        </ReactMarkdown>
                      </div>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 flex-1 items-stretch">
                      {/* Left Column Card */}
                      <div className="p-4 rounded-xl bg-[#121214] border border-white/10 flex flex-col">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={markdownComponents}
                        >
                          {(currentSlide.leftContent || currentSlide.content).replace(
                            /^#+\s+[^\n]+\n?/,
                            ''
                          )}
                        </ReactMarkdown>
                      </div>

                      {/* Right Column Card */}
                      <div className="p-4 rounded-xl bg-[#121214] border border-white/10 flex flex-col">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={markdownComponents}
                        >
                          {currentSlide.rightContent || ''}
                        </ReactMarkdown>
                      </div>
                    </div>
                  </div>
                ) : currentSlide?.layout === 'center' ||
                  currentSlide?.layout === 'quote' ||
                  currentSlide?.layout === 'statement' ? (
                  /* 6. CENTER / QUOTE / STATEMENT LAYOUT */
                  <div className="flex flex-col items-center justify-center text-center p-4 max-w-2xl mx-auto space-y-4 py-6">
                    <h1 className="text-3xl md:text-4xl font-serif italic text-white leading-tight">
                      {currentSlide.title}
                    </h1>
                    <div className="prose prose-invert max-w-none text-zinc-300 text-base md:text-lg italic leading-relaxed">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {currentSlide.content.replace(/^#+\s+[^\n]+\n?/, '')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ) : (
                  /* 7. DEFAULT / STRUCTURED LAYOUT */
                  <div className="flex flex-col h-full space-y-3">
                    <h1 className="text-2xl md:text-3xl font-extrabold text-white border-b border-white/10 pb-2">
                      {currentSlide?.title}
                    </h1>
                    <div className="flex-1">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm, remarkMath]}
                        rehypePlugins={[rehypeRaw, rehypeKatex]}
                        components={markdownComponents}
                      >
                        {currentSlide?.content.replace(/^#+\s+[^\n]+\n?/, '') || ''}
                      </ReactMarkdown>
                    </div>
                  </div>
                )}
              </div>

              {/* Bottom Slide Footer */}
              <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/10 pt-3 mt-4 z-10 select-none font-mono">
                <span className="truncate max-w-xs text-zinc-400">
                  {deck.headmatter.title || 'Slidev Deck'}
                </span>
                <div className="flex items-center gap-2 font-mono">
                  <span className="text-[11px] text-zinc-400">NYX Slides</span>
                  <span>•</span>
                  <span className="text-zinc-300">{currentSlideIndex + 1}</span>
                </div>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── PRESENTER MODE DRAWER ── */}
        <AnimatePresence>
          {showPresenterNotes && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: 320, opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="w-[320px] bg-[#09090b] border-l border-white/10 flex flex-col h-full z-20 shrink-0"
            >
              <div className="p-3.5 border-b border-white/10 flex items-center justify-between bg-[#121214]">
                <div className="flex items-center gap-2 text-sm font-semibold text-white">
                  <Clock className="w-4 h-4 text-zinc-300" />
                  <span>Speaker Notes</span>
                </div>

                {/* Stopwatch Timer Controls */}
                <div className="flex items-center gap-1 bg-black/40 px-2 py-0.5 rounded-lg border border-white/10">
                  <span className="font-mono text-xs font-bold text-zinc-200">
                    {formatTimer(timerSeconds)}
                  </span>
                  <button
                    onClick={() => setIsTimerRunning(!isTimerRunning)}
                    className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    {isTimerRunning ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3" />}
                  </button>
                  <button
                    onClick={() => {
                      setIsTimerRunning(false);
                      setTimerSeconds(0);
                    }}
                    className="p-1 text-zinc-400 hover:text-white transition-colors cursor-pointer"
                  >
                    <RotateCcw className="w-3 h-3" />
                  </button>
                </div>
              </div>

              {/* Notes Content */}
              <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-4">
                <div>
                  <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1">
                    Slide {currentSlideIndex + 1}
                  </h4>
                  <p className="text-xs font-semibold text-white">{currentSlide?.title}</p>
                </div>

                <div className="p-3 rounded-xl bg-[#121214] border border-white/10 text-zinc-300 text-xs leading-relaxed whitespace-pre-wrap">
                  {currentSlide?.notes ? (
                    currentSlide.notes
                  ) : (
                    <span className="text-zinc-500 italic">
                      No presenter notes recorded for this slide. Use &lt;!-- note: your talking
                      points --&gt; to add speaker cues.
                    </span>
                  )}
                </div>

                {/* Next Slide Preview */}
                {currentSlideIndex < totalSlides - 1 && (
                  <div className="pt-3 border-t border-white/10">
                    <h4 className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider mb-1.5">
                      Next Slide Preview
                    </h4>
                    <div
                      onClick={() => setCurrentSlideIndex(currentSlideIndex + 1)}
                      className="p-2.5 rounded-lg bg-[#121214] border border-white/10 hover:border-white/30 transition-all cursor-pointer text-xs"
                    >
                      <span className="text-zinc-400 font-bold mr-1.5">
                        Slide {currentSlideIndex + 2}:
                      </span>
                      <span className="text-white font-medium">
                        {deck.slides[currentSlideIndex + 1]?.title}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── THUMBNAIL GRID OVERVIEW DRAWER ── */}
        <AnimatePresence>
          {showThumbnailGrid && (
            <motion.div
              initial={{ y: 200, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 200, opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-0 inset-x-0 bg-[#09090b]/95 backdrop-blur-md border-t border-white/10 p-4 z-30 shadow-2xl"
            >
              <div className="flex items-center justify-between mb-3 px-1">
                <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
                  Slide Overview ({totalSlides} Slides)
                </span>
                <button
                  onClick={() => setShowThumbnailGrid(false)}
                  className="text-xs text-zinc-300 hover:text-white hover:underline cursor-pointer"
                >
                  Close Overview (G)
                </button>
              </div>

              <div className="flex gap-3 overflow-x-auto pb-2 custom-scrollbar">
                {deck.slides.map((s, idx) => (
                  <button
                    key={idx}
                    onClick={() => {
                      setCurrentSlideIndex(idx);
                      setCurrentClickStep(0);
                      setShowThumbnailGrid(false);
                    }}
                    className={`flex flex-col items-start p-3 rounded-xl border transition-all shrink-0 w-44 text-left cursor-pointer ${
                      idx === currentSlideIndex
                        ? 'bg-zinc-900 border-white text-white shadow-md ring-1 ring-white/20'
                        : 'bg-[#121214] border-white/10 hover:border-white/30 hover:bg-zinc-900/60'
                    }`}
                  >
                    <span className="text-[10px] font-mono text-zinc-400 font-bold uppercase mb-1">
                      {idx + 1} • {s.layout}
                    </span>
                    <span className="text-xs font-semibold text-white truncate w-full">
                      {s.title || `Slide ${idx + 1}`}
                    </span>
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
};
