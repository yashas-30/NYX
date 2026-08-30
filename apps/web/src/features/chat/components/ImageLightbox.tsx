import React, { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Copy,
  Download,
  Check,
  Sparkles,
  Maximize2,
  Minimize2,
  ExternalLink,
  Loader2,
  Eye,
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { invoke } from '@tauri-apps/api/core';

export interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  prompt?: string;
  engine?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  imageUrl,
  prompt,
  engine = 'Visual Engine',
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCopied, setIsCopied] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef(false);

  // Load and proxy image to bypass webview CORS/hotlinking restrictions
  useEffect(() => {
    if (!isOpen || !imageUrl) return;

    abortRef.current = false;
    setIsLoading(true);
    setLoadError(false);
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);

    const loadImg = async () => {
      // Data URIs or local file paths load directly
      if (
        imageUrl.startsWith('data:') ||
        imageUrl.startsWith('blob:') ||
        imageUrl.startsWith('asset:')
      ) {
        setResolvedSrc(imageUrl);
        setIsLoading(false);
        return;
      }

      // Try proxying through Rust backend first for full resolution
      try {
        const result = await invoke<{ base64: string; mime_type: string }>('fetch_image_base64', {
          url: imageUrl,
        });
        if (result?.base64 && !abortRef.current) {
          setResolvedSrc(`data:${result.mime_type || 'image/jpeg'};base64,${result.base64}`);
          setIsLoading(false);
          return;
        }
      } catch (err) {
        console.warn('[ImageLightbox] Rust proxy fetch failed, falling back to direct URL:', err);
      }

      if (!abortRef.current) {
        setResolvedSrc(imageUrl);
        setIsLoading(false);
      }
    };

    loadImg();

    return () => {
      abortRef.current = true;
    };
  }, [isOpen, imageUrl]);

  const resetTransform = useCallback(() => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  }, []);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isFullscreen) {
          setIsFullscreen(false);
        } else {
          onClose();
        }
      } else if (e.key === '+' || e.key === '=') {
        setScale((s) => Math.min(s * 1.25, 16));
      } else if (e.key === '-') {
        setScale((s) => Math.max(s / 1.25, 0.4));
      } else if (e.key === '0') {
        resetTransform();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, isFullscreen, onClose, resetTransform]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.4), 16);

    if (containerRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const cx = e.clientX - rect.left - rect.width / 2;
      const cy = e.clientY - rect.top - rect.height / 2;

      setTranslateX((prevX) => cx - (cx - prevX) * (newScale / scale));
      setTranslateY((prevY) => cy - (cy - prevY) * (newScale / scale));
    }
    setScale(newScale);
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - translateX, y: e.clientY - translateY });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setTranslateX(e.clientX - dragStart.x);
    setTranslateY(e.clientY - dragStart.y);
  };

  const handleMouseUp = () => setIsDragging(false);

  const handleCopyPrompt = () => {
    if (!prompt) return;
    navigator.clipboard.writeText(prompt);
    setIsCopied(true);
    toast.success('Prompt copied to clipboard');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = async () => {
    try {
      const src = resolvedSrc || imageUrl;
      if (!src) return;

      const link = document.createElement('a');
      link.href = src;
      link.download = `nyx-media-${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Image download started');
    } catch {
      toast.error('Failed to download image');
    }
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/95 backdrop-blur-2xl select-none"
      >
        {/* Top Minimal Obsidian Navigation & Control Bar */}
        <motion.div
          initial={{ y: -20, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.2, delay: 0.05 }}
          className="absolute top-4 left-4 right-4 z-30 flex items-center justify-between px-4 py-2.5 bg-[#09090b]/90 border border-white/10 backdrop-blur-xl rounded-xl shadow-2xl"
        >
          <div className="flex items-center gap-3 text-white text-xs font-mono">
            <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white/5 border border-white/10 text-zinc-300 font-medium">
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>{engine}</span>
            </div>
            <span className="text-zinc-600 hidden sm:inline">/</span>
            <span className="text-zinc-400 font-mono tracking-tight hidden sm:inline">
              Zoom: {Math.round(scale * 100)}%
            </span>
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={() => setScale((s) => Math.min(s * 1.25, 16))}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Zoom In (+)"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              onClick={() => setScale((s) => Math.max(s / 1.25, 0.4))}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Zoom Out (-)"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={resetTransform}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title="Reset View (0)"
            >
              <RotateCcw className="w-4 h-4" />
            </button>

            <span className="w-px h-4 bg-white/10 mx-1.5" />

            <button
              onClick={() => setIsFullscreen(!isFullscreen)}
              className="p-2 text-zinc-400 hover:text-white hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              title={isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            >
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>

            <button
              onClick={onClose}
              className="p-2 text-zinc-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors cursor-pointer"
              title="Close (Esc)"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </motion.div>

        {/* Main Interactive Canvas Area */}
        <div
          ref={containerRef}
          className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing relative p-6"
          onWheel={handleWheel}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onDoubleClick={resetTransform}
        >
          {isLoading && (
            <div className="flex flex-col items-center gap-3 text-zinc-400 animate-pulse">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
              <span className="text-xs font-mono tracking-wide">
                Loading High-Resolution Media...
              </span>
            </div>
          )}

          {loadError && !isLoading && (
            <div className="flex flex-col items-center gap-2 p-6 rounded-xl border border-red-500/20 bg-red-950/20 text-red-400 max-w-md text-center">
              <Eye className="w-8 h-8 opacity-60" />
              <span className="text-sm font-semibold">Unable to Render Image</span>
              <p className="text-xs text-zinc-400">
                The remote resource may have expired or is blocked by CORS.
              </p>
              {imageUrl && (
                <a
                  href={imageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-zinc-900 border border-white/10 text-white text-xs hover:bg-zinc-800 transition-colors"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  <span>Open in Browser</span>
                </a>
              )}
            </div>
          )}

          {resolvedSrc && !loadError && (
            <motion.img
              initial={{ scale: 0.96, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.2 }}
              src={resolvedSrc}
              alt={prompt || 'Expanded preview'}
              draggable={false}
              onError={() => setLoadError(true)}
              style={{
                transform: `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`,
                transition: isDragging ? 'none' : 'transform 0.08s cubic-bezier(0.2, 0, 0, 1)',
                maxHeight: isFullscreen ? '96vh' : '82vh',
                maxWidth: isFullscreen ? '96vw' : '88vw',
              }}
              className="object-contain rounded-xl shadow-2xl pointer-events-auto border border-white/10"
            />
          )}
        </div>

        {/* Bottom Floating Details Drawer */}
        {!isFullscreen && (
          <motion.div
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ duration: 0.2, delay: 0.05 }}
            className="absolute bottom-4 left-4 right-4 z-30 p-3.5 bg-[#09090b]/90 border border-white/10 backdrop-blur-xl rounded-xl shadow-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs"
          >
            <div className="flex-1 min-w-0 pr-2">
              <span className="font-mono text-[10px] text-zinc-500 uppercase tracking-widest font-semibold block mb-0.5">
                Reference / Context
              </span>
              <p className="text-zinc-200 text-xs font-sans line-clamp-2 leading-relaxed">
                {prompt || 'Visual media asset'}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
              {prompt && (
                <button
                  onClick={handleCopyPrompt}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-zinc-800 border border-white/10 text-zinc-300 hover:text-white rounded-lg font-medium transition-colors cursor-pointer"
                >
                  {isCopied ? (
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <Copy className="w-3.5 h-3.5" />
                  )}
                  <span>Copy Prompt</span>
                </button>
              )}

              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3.5 py-1.5 bg-white text-black hover:bg-zinc-200 rounded-lg font-semibold shadow-sm transition-all cursor-pointer active:scale-95"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </AnimatePresence>
  );
};
