import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeRaw from 'rehype-raw';
import rehypeKatex from 'rehype-katex';
import pptxgen from 'pptxgenjs';
import { toast } from 'sonner';
import {
  ChevronLeft,
  ChevronRight,
  Maximize2,
  Minimize2,
  FileDown,
  FileCode,
  Copy,
  Check,
  StickyNote,
  Tv,
  LayoutGrid,
  Clock,
  CircleDot,
  PenTool,
  PanelLeft,
  X,
} from 'lucide-react';
import {
  parseSlidevMarkdown,
  ParsedSlidevDeck,
  SlidevSlide,
} from '../../artifacts/utils/slidevParser';
import { compileResponseToSlidev, isSlidevContent } from '../utils/slidevCompiler';
import { exportSlidevToPptx } from '../../artifacts/utils/pptxExporter';
import { SlideOverviewGrid } from './SlideOverviewGrid';
import { SlideDrawingCanvas } from './SlideDrawingCanvas';
import { Arrow, AutoFitText, Toc, Youtube } from './SlidevComponents';

interface PresentationDeckProps {
  content: string;
  title?: string;
  className?: string;
}

/**
 * Sanitizes markdown content
 */
function sanitizeSlideContent(raw: string): string {
  if (!raw) return '';
  return raw.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
}

export const PresentationDeck: React.FC<PresentationDeckProps> = ({
  content,
  title: initialTitle,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);

  // Parse and compile Slidev Deck with executive structure
  const deck: ParsedSlidevDeck = useMemo(() => {
    const sanitized = sanitizeSlideContent(content);
    const directParse = parseSlidevMarkdown(sanitized);
    if (directParse.slides.length > 1 && isSlidevContent(sanitized)) {
      return directParse;
    }
    const compiled = compileResponseToSlidev(sanitized, initialTitle);
    return parseSlidevMarkdown(compiled);
  }, [content, initialTitle]);

  const slides: SlidevSlide[] = deck.slides;
  const totalSlides = slides.length;

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const [currentClick, setCurrentClick] = useState(0);
  const [showNotes, setShowNotes] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [isOverviewOpen, setIsOverviewOpen] = useState(false);
  const [isTheaterMode, setIsTheaterMode] = useState(false);
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [isExportingPptx, setIsExportingPptx] = useState(false);

  const [isLaserActive, setIsLaserActive] = useState(false);
  const [laserPos, setLaserPos] = useState({ x: 0, y: 0 });
  const [isDrawingActive, setIsDrawingActive] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);

  const currentSlide = slides[activeSlideIndex] || slides[0];
  const presentationTitle =
    initialTitle || deck.headmatter.title || slides[0]?.title || 'Presentation';

  // Timer interval
  useEffect(() => {
    let interval: any = null;
    if (isTimerRunning) {
      interval = setInterval(() => setElapsedSeconds((prev) => prev + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isTimerRunning]);

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  // Reset click count when slide changes
  useEffect(() => {
    setCurrentClick(0);
  }, [activeSlideIndex]);

  // Navigation with v-click awareness
  const goToNext = useCallback(() => {
    if (currentClick < (currentSlide.clicksCount || 0)) {
      setCurrentClick((prev) => prev + 1);
    } else if (activeSlideIndex < totalSlides - 1) {
      setActiveSlideIndex((prev) => prev + 1);
      setCurrentClick(0);
    }
  }, [activeSlideIndex, currentClick, currentSlide, totalSlides]);

  const goToPrev = useCallback(() => {
    if (currentClick > 0) {
      setCurrentClick((prev) => prev - 1);
    } else if (activeSlideIndex > 0) {
      setActiveSlideIndex((prev) => prev - 1);
      const prevSlide = slides[activeSlideIndex - 1];
      setCurrentClick(prevSlide?.clicksCount || 0);
    }
  }, [activeSlideIndex, currentClick, slides]);

  // Laser pointer mouse move tracking
  const handleStageMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isLaserActive || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    setLaserPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });
  };

  // Global Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['input', 'textarea'].includes((e.target as HTMLElement)?.tagName?.toLowerCase())) return;

      if (e.key === 'ArrowRight' || e.key === ' ' || e.key === 'PageDown') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft' || e.key === 'PageUp' || e.key === 'Backspace') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'Escape') {
        if (isTheaterMode) {
          e.preventDefault();
          setIsTheaterMode(false);
        } else if (isOverviewOpen) {
          e.preventDefault();
          setIsOverviewOpen(false);
        }
      } else if (e.key === 'F5' || (e.key === 'f' && !e.ctrlKey && !e.metaKey)) {
        e.preventDefault();
        setIsTheaterMode((prev) => !prev);
      } else if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        setIsOverviewOpen((prev) => !prev);
      } else if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        setIsLaserActive((prev) => !prev);
      } else if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        setIsDrawingActive((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, isTheaterMode, isOverviewOpen]);

  /**
   * 1-Click Multi-Slide PowerPoint (.pptx) Exporter
   */
  const exportToPowerPoint = async () => {
    try {
      setIsExportingPptx(true);
      toast.info('Generating PowerPoint (.pptx) presentation...');
      await exportSlidevToPptx(deck, {
        fileName: presentationTitle || 'presentation',
        theme: 'midnight',
      });
      toast.success('PowerPoint (.pptx) downloaded successfully!');
    } catch (err: any) {
      console.error('Failed to export PPTX:', err);
      toast.error(`PowerPoint export failed: ${err.message || 'Unknown error'}`);
    } finally {
      setIsExportingPptx(false);
    }
  };

  /**
   * Export to Standalone HTML Presentation File
   */
  const exportToHtml = () => {
    const htmlSource = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>${presentationTitle}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { background-color: #080c14; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif; }
    .slide-page { page-break-after: always; min-height: 100vh; display: flex; flex-direction: column; justify-content: center; padding: 4rem; }
  </style>
</head>
<body class="p-8 max-w-5xl mx-auto space-y-12">
  <header class="border-b border-slate-800 pb-4 flex justify-between items-center">
    <h1 class="text-xl font-bold text-indigo-400">${presentationTitle}</h1>
    <span class="text-xs text-slate-500 font-mono">${slides.length} Slides</span>
  </header>
  ${slides
    .map(
      (s, idx) => `
    <div class="slide-page bg-slate-950 border border-slate-800 rounded-2xl p-12 my-6 shadow-2xl">
      <div class="text-xs font-mono uppercase text-indigo-400 mb-2">Slide ${idx + 1} • ${s.layout}</div>
      <h1 class="text-2xl font-bold mb-4 text-white">${s.title}</h1>
      <div class="prose prose-invert text-slate-300 leading-relaxed">${s.content.replace(/^#+\s+[^\n]+\n?/, '')}</div>
      ${
        s.notes
          ? `<div class="mt-6 p-4 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-400"><strong>Notes:</strong> ${s.notes}</div>`
          : ''
      }
    </div>
  `
    )
    .join('\n')}
</body>
</html>`;

    const blob = new Blob([htmlSource], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${presentationTitle.toLowerCase().replace(/[^a-z0-9]+/g, '_')}.html`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Downloaded HTML presentation');
  };

  const copyMarkdown = () => {
    navigator.clipboard.writeText(content);
    setIsCopied(true);
    toast.success('Copied presentation markdown');
    setTimeout(() => setIsCopied(false), 2000);
  };

  // Custom clean slide markdown components
  const slideMarkdownComponents = useMemo(
    () => ({
      h1: ({ children }: any) => (
        <h1 className="text-xl sm:text-2xl md:text-3xl lg:text-4xl font-extrabold text-white tracking-tight leading-tight mb-2">
          {children}
        </h1>
      ),
      h2: ({ children }: any) => (
        <h2 className="text-base sm:text-lg md:text-xl lg:text-2xl font-bold text-zinc-200 mt-2 mb-1.5">
          {children}
        </h2>
      ),
      h3: ({ children }: any) => (
        <h3 className="text-sm sm:text-base md:text-lg font-semibold text-zinc-300 mt-2 mb-1">
          {children}
        </h3>
      ),
      p: ({ children }: any) => (
        <div className="text-sm sm:text-base md:text-lg lg:text-xl text-zinc-300 leading-relaxed my-2">
          {children}
        </div>
      ),
      strong: ({ children }: any) => (
        <strong className="font-semibold text-white tracking-wide">{children}</strong>
      ),
      em: ({ children }: any) => <em className="italic text-zinc-300">{children}</em>,
      code: ({ children }: any) => (
        <code className="font-mono text-xs md:text-sm px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300">
          {children}
        </code>
      ),
      ul: ({ children }: any) => {
        const validChildren = React.Children.toArray(children).filter((child: any) => {
          if (!child) return false;
          if (typeof child === 'string') return child.trim().length > 0;
          if (child.props?.children) {
            const inner = child.props.children;
            if (typeof inner === 'string') return inner.trim().length > 0;
            if (Array.isArray(inner)) {
              return inner.some((c) => (typeof c === 'string' ? c.trim().length > 0 : !!c));
            }
          }
          return true;
        });

        return (
          <ul className="space-y-2 sm:space-y-3 my-2 text-sm sm:text-base md:text-lg text-zinc-300 list-none pl-0">
            {validChildren.map((child: any, idx) => {
              const isRevealed = idx < currentClick || currentClick === 0;
              return (
                <li
                  key={idx}
                  className={`flex items-start gap-2.5 sm:gap-3 leading-relaxed transition-opacity duration-300 ${
                    isRevealed ? 'opacity-100' : 'opacity-20'
                  }`}
                >
                  <span className="inline-block w-1.5 sm:w-2 h-1.5 sm:h-2 rounded-full bg-white mt-2 shrink-0 shadow-sm" />
                  <span className="flex-1">{child.props ? child.props.children : child}</span>
                </li>
              );
            })}
          </ul>
        );
      },
      ol: ({ children }: any) => (
        <ol className="list-decimal pl-5 space-y-2 my-2 text-sm sm:text-base md:text-lg text-zinc-300">
          {children}
        </ol>
      ),
      li: ({ children }: any) => <li className="leading-relaxed">{children}</li>,
      blockquote: ({ children }: any) => (
        <blockquote className="border-l-2 border-white/40 bg-zinc-900/40 pl-4 py-2.5 my-3 italic text-zinc-200 rounded-r-lg text-base md:text-lg">
          {children}
        </blockquote>
      ),
      toc: () => <Toc list={slides.map((s, i) => ({ title: s.title, index: i + 1 }))} />,
      arrow: (props: any) => <Arrow {...props} />,
      autofittext: (props: any) => <AutoFitText {...props} />,
      youtube: (props: any) => <Youtube {...props} />,
    }),
    [currentClick, slides]
  );

  return (
    <div
      ref={containerRef}
      className={`flex flex-col bg-[#000000] border border-white/10 rounded-xl overflow-hidden shadow-2xl transition-all my-2 ${
        isTheaterMode
          ? 'fixed inset-0 z-50 rounded-none h-screen w-screen border-none bg-black p-4 md:p-6 my-0'
          : 'w-full h-full'
      } ${className}`}
    >
      {/* ── TOP BAR: MINIMALIST TRUE BLACK APP BAR ── */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[#09090b] border-b border-white/10 select-none">
        {/* Left: Presentation Branding & Title & Thumbnail Toggle */}
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={() => setShowThumbnails((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              showThumbnails
                ? 'text-white bg-zinc-900 border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent'
            }`}
            title={showThumbnails ? 'Hide Slide Strip' : 'Show Slide Strip'}
          >
            <PanelLeft className="w-4 h-4" />
          </button>
          <div className="w-6 h-6 rounded-md bg-zinc-900 border border-white/10 flex items-center justify-center text-white shrink-0">
            <Tv className="w-3.5 h-3.5 text-zinc-200" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs md:text-sm font-semibold text-zinc-100 truncate max-w-[180px] sm:max-w-xs md:max-w-md">
              {presentationTitle}
            </span>
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-mono">
              <span>{slides.length} Slides</span>
              <span>•</span>
              <span>Slidev Studio</span>
            </div>
          </div>
        </div>

        {/* Right: Actions */}
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          {/* Presenter Timer */}
          <button
            onClick={() => setIsTimerRunning((prev) => !prev)}
            className={`hidden sm:flex items-center gap-1 px-2 py-1 rounded text-xs font-mono border transition-colors cursor-pointer ${
              isTimerRunning
                ? 'bg-zinc-900 border-white/30 text-white'
                : 'bg-zinc-950 border-white/10 text-zinc-400 hover:text-white'
            }`}
            title="Toggle Timer"
          >
            <Clock className="w-3 h-3" />
            <span>{formatTime(elapsedSeconds)}</span>
          </button>

          {/* Grid Overview (G) */}
          <button
            onClick={() => setIsOverviewOpen(true)}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 border border-transparent hover:border-white/10 transition-colors cursor-pointer"
            title="Slide Overview Grid (G)"
          >
            <LayoutGrid className="w-4 h-4" />
          </button>

          {/* Laser Pointer (L) */}
          <button
            onClick={() => setIsLaserActive((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isLaserActive
                ? 'text-red-400 bg-red-950/40 border-red-500/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent'
            }`}
            title="Laser Pointer (L)"
          >
            <CircleDot className="w-4 h-4" />
          </button>

          {/* Drawing Pen (D) */}
          <button
            onClick={() => setIsDrawingActive((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              isDrawingActive
                ? 'text-white bg-zinc-800 border-white/40'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent'
            }`}
            title="Drawing Pen (D)"
          >
            <PenTool className="w-4 h-4" />
          </button>

          {/* 1-Click PowerPoint .PPTX Download */}
          <button
            onClick={exportToPowerPoint}
            disabled={isExportingPptx}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-white text-black hover:bg-zinc-200 transition-all active:scale-95 disabled:opacity-50 cursor-pointer shadow-sm"
            title="Download PowerPoint (.pptx)"
          >
            <FileDown className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Export .PPTX</span>
          </button>

          {/* In-App Fluid Theater Mode (Present) */}
          <button
            onClick={() => setIsTheaterMode((prev) => !prev)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-zinc-900 hover:bg-zinc-800 text-zinc-200 border border-white/10 transition-colors cursor-pointer"
            title={
              isTheaterMode ? 'Exit Theater Mode (Esc)' : 'Expand to Fullscreen Presentation (F5)'
            }
          >
            {isTheaterMode ? (
              <Minimize2 className="w-3.5 h-3.5" />
            ) : (
              <Maximize2 className="w-3.5 h-3.5" />
            )}
            <span className="hidden md:inline">{isTheaterMode ? 'Exit' : 'Present'}</span>
          </button>

          {/* Standalone HTML File Export */}
          <button
            onClick={exportToHtml}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer hidden sm:block"
            title="Export Standalone HTML"
          >
            <FileCode className="w-4 h-4" />
          </button>

          {/* Toggle Speaker Notes */}
          <button
            onClick={() => setShowNotes((prev) => !prev)}
            className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
              showNotes
                ? 'text-white bg-zinc-900 border-white/20'
                : 'text-zinc-400 hover:text-white hover:bg-zinc-900 border-transparent'
            }`}
            title="Toggle Speaker Notes"
          >
            <StickyNote className="w-4 h-4" />
          </button>

          {/* Copy Raw Slidev Markdown */}
          <button
            onClick={copyMarkdown}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 transition-colors cursor-pointer"
            title="Copy Markdown"
          >
            {isCopied ? <Check className="w-4 h-4 text-white" /> : <Copy className="w-4 h-4" />}
          </button>

          {isTheaterMode && (
            <button
              onClick={() => setIsTheaterMode(false)}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-900 border border-white/10 transition-colors cursor-pointer ml-1"
              title="Close Theater Mode (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* ── WORKSPACE ── */}
      <div className="flex flex-1 min-h-[520px] h-full overflow-hidden">
        {/* LEFT: SLIDE THUMBNAIL VERTICAL STRIP */}
        {showThumbnails && (
          <div className="w-36 md:w-48 bg-[#09090b] border-r border-white/10 p-2.5 overflow-y-auto space-y-2 select-none shrink-0 custom-scrollbar">
            {slides.map((slide, idx) => (
              <div
                key={idx}
                onClick={() => {
                  setActiveSlideIndex(idx);
                  setCurrentClick(0);
                }}
                className={`group flex items-start gap-2.5 p-2.5 rounded-lg cursor-pointer border transition-all ${
                  idx === activeSlideIndex
                    ? 'bg-zinc-900 border-white/30 shadow-sm text-white'
                    : 'bg-[#121214] border-white/5 hover:border-white/20 hover:bg-zinc-900/60 text-zinc-400'
                }`}
              >
                {/* Slide Number Badge */}
                <span
                  className={`text-[10px] font-mono font-bold mt-0.5 px-1.5 py-0.5 rounded ${
                    idx === activeSlideIndex ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-400'
                  }`}
                >
                  {idx + 1}
                </span>

                {/* Mini Slide Card Preview */}
                <div className="flex-1 min-w-0">
                  <span className="text-xs font-medium text-zinc-200 block truncate">
                    {slide.title || `Slide ${idx + 1}`}
                  </span>
                  <span className="text-[9px] text-zinc-500 font-mono uppercase tracking-wider block mt-0.5">
                    {slide.layout}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* CENTER / RIGHT: MAIN PRESENTATION CANVAS & SPEAKER NOTES */}
        <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden bg-[#000000]">
          {/* 16:9 PRESENTATION STAGE */}
          <div
            ref={stageRef}
            onMouseMove={handleStageMouseMove}
            className="flex-1 min-h-0 flex items-center justify-center p-3 sm:p-5 md:p-7 bg-[#000000] overflow-hidden relative w-full h-full select-none"
          >
            {/* Laser Pointer Spotlight Overlay */}
            {isLaserActive && (
              <div
                className="absolute w-5 h-5 rounded-full bg-red-500 shadow-[0_0_16px_4px_rgba(239,68,68,0.9)] pointer-events-none z-50 -translate-x-1/2 -translate-y-1/2 transition-transform duration-75"
                style={{ left: laserPos.x, top: laserPos.y }}
              />
            )}

            {/* Drawing Annotation Layer */}
            <SlideDrawingCanvas isActive={isDrawingActive} />

            <AnimatePresence mode="wait">
              <motion.div
                key={activeSlideIndex}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.15 }}
                className="w-full aspect-[16/9] max-h-full max-w-[calc(100%)] bg-[#0c0c0e] border border-white/10 rounded-xl p-6 sm:p-8 md:p-10 lg:p-12 shadow-2xl flex flex-col justify-between relative overflow-hidden select-none m-auto"
                style={{
                  maxHeight: '100%',
                  maxWidth: 'min(100%, calc((100% - 1rem) * 16 / 9))',
                  backgroundImage: currentSlide?.background
                    ? currentSlide.background.startsWith('http')
                      ? `linear-gradient(rgba(0, 0, 0, 0.88), rgba(0, 0, 0, 0.94)), url(${currentSlide.background})`
                      : undefined
                    : undefined,
                  backgroundSize: currentSlide?.backgroundSize || 'cover',
                  backgroundPosition: 'center',
                }}
              >
                {/* Top Slide Header Meta */}
                <div className="flex items-center justify-between z-10 select-none pb-2 border-b border-white/10 mb-3">
                  <span className="px-2.5 py-0.5 rounded text-[10px] md:text-xs font-mono font-semibold uppercase tracking-wider bg-zinc-900 border border-white/10 text-zinc-300">
                    {currentSlide?.layout || 'Slide'}
                  </span>
                  <span className="text-xs md:text-sm font-mono text-zinc-400 font-medium">
                    {activeSlideIndex + 1} / {totalSlides}
                  </span>
                </div>

                {/* SLIDEV LAYOUTS */}
                <div className="flex-1 flex flex-col justify-center z-10 my-auto overflow-hidden">
                  {/* 1. COVER / INTRO LAYOUT */}
                  {currentSlide?.layout === 'cover' ||
                  currentSlide?.layout === 'intro' ||
                  activeSlideIndex === 0 ? (
                    <div className="flex flex-col justify-center items-start space-y-4 md:space-y-6 max-w-4xl py-2 my-auto">
                      <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-zinc-900 border border-white/10 shadow-sm">
                        <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                        <span className="text-[10px] md:text-xs font-mono font-semibold uppercase tracking-wider text-zinc-300">
                          EXECUTIVE BRIEFING • STRATEGIC REPORT
                        </span>
                      </div>
                      <h1 className="text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-black text-white tracking-tight leading-[1.08]">
                        {currentSlide?.title || presentationTitle}
                      </h1>
                      <div className="text-zinc-300 text-base sm:text-lg md:text-xl lg:text-2xl leading-relaxed space-y-2">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={slideMarkdownComponents}
                        >
                          {(currentSlide?.content || '').replace(/^#\s+[^\n]+\n?/, '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : currentSlide?.layout === 'two-cols-header' ? (
                    /* 2. TWO-COLS-HEADER LAYOUT */
                    <div className="flex flex-col h-full space-y-4">
                      {currentSlide.headerContent && (
                        <div className="border-b border-white/10 pb-3">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm, remarkMath]}
                            rehypePlugins={[rehypeRaw, rehypeKatex]}
                            components={slideMarkdownComponents}
                          >
                            {currentSlide.headerContent}
                          </ReactMarkdown>
                        </div>
                      )}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 flex-1 items-stretch">
                        <div className="p-5 sm:p-6 md:p-8 rounded-xl bg-[#121214] border border-white/10 flex flex-col justify-between shadow-md">
                          <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300">
                              01
                            </span>
                          </div>
                          <div className="flex-1">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeRaw, rehypeKatex]}
                              components={slideMarkdownComponents}
                            >
                              {currentSlide.leftContent || ''}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div className="p-5 sm:p-6 md:p-8 rounded-xl bg-[#121214] border border-white/10 flex flex-col justify-between shadow-md">
                          <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300">
                              02
                            </span>
                          </div>
                          <div className="flex-1">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeRaw, rehypeKatex]}
                              components={slideMarkdownComponents}
                            >
                              {currentSlide.rightContent || ''}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : currentSlide?.layout === 'two-cols' ||
                    (currentSlide?.leftContent && currentSlide?.rightContent) ? (
                    /* 3. TWO-COLUMN BENTO LAYOUT */
                    <div className="flex flex-col h-full space-y-4">
                      <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white border-b border-white/10 pb-3 mb-2">
                        {currentSlide?.title || `Slide ${activeSlideIndex + 1}`}
                      </h1>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 flex-1 items-stretch">
                        <div className="p-5 sm:p-6 md:p-8 rounded-xl bg-[#121214] border border-white/10 flex flex-col justify-between shadow-md">
                          <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300">
                              01
                            </span>
                          </div>
                          <div className="flex-1">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeRaw, rehypeKatex]}
                              components={slideMarkdownComponents}
                            >
                              {(currentSlide?.leftContent || currentSlide?.content || '').replace(
                                /^#+\s+[^\n]+\n?/,
                                ''
                              )}
                            </ReactMarkdown>
                          </div>
                        </div>
                        <div className="p-5 sm:p-6 md:p-8 rounded-xl bg-[#121214] border border-white/10 flex flex-col justify-between shadow-md">
                          <div className="flex items-center justify-between pb-2 border-b border-white/5 mb-3">
                            <span className="text-xs font-mono font-bold px-2 py-0.5 rounded bg-zinc-900 border border-white/10 text-zinc-300">
                              02
                            </span>
                          </div>
                          <div className="flex-1">
                            <ReactMarkdown
                              remarkPlugins={[remarkGfm, remarkMath]}
                              rehypePlugins={[rehypeRaw, rehypeKatex]}
                              components={slideMarkdownComponents}
                            >
                              {(currentSlide?.rightContent || '').replace(/^#+\s+[^\n]+\n?/, '')}
                            </ReactMarkdown>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : currentSlide?.layout === 'fact' ? (
                    /* 4. FACT / BIG METRIC LAYOUT */
                    <div className="flex flex-col items-center justify-center text-center p-4 sm:p-8 space-y-4 md:space-y-6 max-w-4xl mx-auto my-auto">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-900 border border-white/10">
                        <span className="text-[10px] md:text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
                          KEY PERFORMANCE METRIC
                        </span>
                      </div>
                      <span className="text-7xl sm:text-8xl md:text-9xl lg:text-[10rem] font-black text-white tracking-tight leading-none">
                        {(currentSlide?.title || '').replace(/^#+\s*/, '')}
                      </span>
                      <div className="text-zinc-300 text-lg sm:text-xl md:text-2xl leading-relaxed max-w-3xl mx-auto font-medium pt-3 border-t border-white/10">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={slideMarkdownComponents}
                        >
                          {(currentSlide?.content || '').replace(/^#+\s+[^\n]+\n?/, '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : currentSlide?.layout === 'image-left' ||
                    currentSlide?.layout === 'image-right' ? (
                    /* 5. IMAGE-LEFT / IMAGE-RIGHT LAYOUT */
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-full items-center">
                      {currentSlide.layout === 'image-left' && currentSlide.image && (
                        <div className="rounded-xl overflow-hidden border border-white/10 aspect-video shadow-md">
                          <img
                            src={currentSlide.image}
                            alt={currentSlide.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                      <div className="flex flex-col justify-center">
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white mb-3">
                          {currentSlide.title}
                        </h1>
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={slideMarkdownComponents}
                        >
                          {(currentSlide?.content || '').replace(/^#+\s+[^\n]+\n?/, '')}
                        </ReactMarkdown>
                      </div>
                      {currentSlide.layout === 'image-right' && currentSlide.image && (
                        <div className="rounded-xl overflow-hidden border border-white/10 aspect-video shadow-md">
                          <img
                            src={currentSlide.image}
                            alt={currentSlide.title}
                            className="w-full h-full object-cover"
                          />
                        </div>
                      )}
                    </div>
                  ) : currentSlide?.layout === 'center' ||
                    currentSlide?.layout === 'quote' ||
                    currentSlide?.layout === 'statement' ||
                    currentSlide?.layout === 'section' ? (
                    /* 6. CENTER / QUOTE / STATEMENT / SECTION */
                    <div className="flex flex-col items-center justify-center text-center p-4 sm:p-8 max-w-4xl mx-auto space-y-6 my-auto">
                      <div className="inline-flex items-center px-3 py-1 rounded-full bg-zinc-900 border border-white/10">
                        <span className="text-[10px] md:text-xs font-mono font-semibold uppercase tracking-wider text-zinc-400">
                          EXECUTIVE THESIS
                        </span>
                      </div>
                      <h1 className="text-2xl sm:text-3xl md:text-4xl lg:text-5xl font-serif italic text-white leading-relaxed tracking-tight max-w-3xl">
                        {(currentSlide?.title || `Slide ${activeSlideIndex + 1}`).replace(
                          /^["'“”#\s]+|["'“”\s]+$/g,
                          ''
                        )}
                      </h1>
                      <div className="text-zinc-400 text-sm sm:text-base md:text-lg font-mono uppercase tracking-wider border-t border-white/10 pt-4">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={slideMarkdownComponents}
                        >
                          {(currentSlide?.content || '').replace(/^#+\s+[^\n]+\n?/, '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  ) : (
                    /* 7. DEFAULT ROADMAP / TAKEAWAYS LAYOUT */
                    <div className="flex flex-col h-full space-y-4">
                      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-2">
                        <h1 className="text-2xl sm:text-3xl md:text-4xl font-bold text-white tracking-tight">
                          {currentSlide?.title || `Slide ${activeSlideIndex + 1}`}
                        </h1>
                        <span className="text-xs font-mono text-zinc-500 uppercase tracking-wider">
                          STRATEGIC HORIZONS
                        </span>
                      </div>
                      <div className="flex-1 p-6 sm:p-8 md:p-10 rounded-xl bg-[#121214] border border-white/10">
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm, remarkMath]}
                          rehypePlugins={[rehypeRaw, rehypeKatex]}
                          components={slideMarkdownComponents}
                        >
                          {(currentSlide?.content || '').replace(/^#+\s+[^\n]+\n?/, '')}
                        </ReactMarkdown>
                      </div>
                    </div>
                  )}
                </div>

                {/* Bottom Slide Footer */}
                <div className="flex items-center justify-between text-xs text-zinc-500 border-t border-white/10 pt-2.5 z-10 select-none font-mono">
                  <span className="truncate max-w-md text-zinc-400">{presentationTitle}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-zinc-400">NYX Slides</span>
                    <span>•</span>
                    <span className="text-zinc-300">{activeSlideIndex + 1}</span>
                  </div>
                </div>
              </motion.div>
            </AnimatePresence>
          </div>

          {/* BOTTOM: SLIDE NAVIGATION BAR */}
          <div className="bg-[#09090b] border-t border-white/10 select-none">
            <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
              <div className="flex items-center gap-2">
                <button
                  onClick={goToPrev}
                  disabled={activeSlideIndex === 0 && currentClick === 0}
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/5"
                  title="Previous (Left Arrow / Backspace)"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={goToNext}
                  disabled={
                    activeSlideIndex >= totalSlides - 1 &&
                    currentClick >= (currentSlide.clicksCount || 0)
                  }
                  className="p-1.5 rounded-lg bg-zinc-900 hover:bg-zinc-800 text-white disabled:opacity-30 disabled:cursor-not-allowed transition-all cursor-pointer border border-white/5"
                  title="Next (Right Arrow / Space)"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
                <span className="text-xs font-mono text-zinc-400 ml-1">
                  Slide <strong className="text-white">{activeSlideIndex + 1}</strong> of{' '}
                  {totalSlides}
                  {currentSlide.clicksCount > 0 && (
                    <span className="text-[11px] text-zinc-500 ml-2">
                      (Step {currentClick}/{currentSlide.clicksCount})
                    </span>
                  )}
                </span>
              </div>

              {/* Keyboard Shortcuts */}
              <div className="text-[11px] text-zinc-500 font-mono hidden sm:flex items-center gap-2">
                <span>
                  <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-white/10 rounded text-[10px] text-zinc-300">
                    G
                  </kbd>{' '}
                  Grid
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-white/10 rounded text-[10px] text-zinc-300">
                    L
                  </kbd>{' '}
                  Laser
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-white/10 rounded text-[10px] text-zinc-300">
                    D
                  </kbd>{' '}
                  Draw
                </span>
                <span>
                  <kbd className="px-1.5 py-0.5 bg-zinc-900 border border-white/10 rounded text-[10px] text-zinc-300">
                    F5
                  </kbd>{' '}
                  Present
                </span>
              </div>
            </div>

            {/* Collapsible Speaker Notes */}
            {showNotes && (
              <div className="px-4 py-3 bg-[#050505] text-xs max-h-28 overflow-y-auto custom-scrollbar border-t border-white/5">
                <div className="flex items-center gap-1.5 text-zinc-400 font-semibold mb-1">
                  <StickyNote className="w-3.5 h-3.5" />
                  <span>Presenter Notes</span>
                </div>
                <div className="text-zinc-300 leading-relaxed font-sans">
                  {currentSlide?.notes ? (
                    currentSlide.notes
                  ) : (
                    <span className="text-zinc-600 italic">No speaker notes for this slide.</span>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Grid Overview Modal (G) */}
      <SlideOverviewGrid
        isOpen={isOverviewOpen}
        slides={slides}
        activeSlideIndex={activeSlideIndex}
        onSelectSlide={(idx) => {
          setActiveSlideIndex(idx);
          setCurrentClick(0);
        }}
        onClose={() => setIsOverviewOpen(false)}
      />
    </div>
  );
};
export default PresentationDeck;
