import React, { useState, useEffect, useRef } from 'react';
import { X, ZoomIn, ZoomOut, RotateCcw, Copy, Download, Check, Sparkles } from 'lucide-react';
import { toast } from 'sonner';

export interface ImageLightboxProps {
  isOpen: boolean;
  imageUrl: string;
  prompt: string;
  engine?: string;
  onClose: () => void;
}

export const ImageLightbox: React.FC<ImageLightboxProps> = ({
  isOpen,
  imageUrl,
  prompt,
  engine = 'AI Generator',
  onClose,
}) => {
  const [scale, setScale] = useState(1);
  const [translateX, setTranslateX] = useState(0);
  const [translateY, setTranslateY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isCopied, setIsCopied] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 1.15 : 1 / 1.15;
    const newScale = Math.min(Math.max(scale * zoomFactor, 0.5), 16);

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

  const resetTransform = () => {
    setScale(1);
    setTranslateX(0);
    setTranslateY(0);
  };

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    setIsCopied(true);
    toast.success('Prompt copied!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl transition-opacity animate-in fade-in duration-200">
      {/* Top Floating Control Bar */}
      <div className="absolute top-4 left-4 right-4 z-20 flex items-center justify-between px-4 py-2 bg-slate-900/80 border border-white/10 backdrop-blur-xl rounded-2xl shadow-xl">
        <div className="flex items-center gap-2 text-white/90 font-mono text-xs">
          <Sparkles className="w-4 h-4 text-purple-400" />
          <span className="font-semibold text-slate-200">{engine}</span>
          <span className="text-slate-500">|</span>
          <span className="text-purple-300 font-mono">Zoom: {Math.round(scale * 100)}%</span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setScale((s) => Math.min(s * 1.25, 16))}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Zoom In"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
          <button
            onClick={() => setScale((s) => Math.max(s / 1.25, 0.5))}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Zoom Out"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={resetTransform}
            className="p-2 text-slate-300 hover:text-white hover:bg-white/10 rounded-xl transition-colors"
            title="Reset Viewport"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <span className="w-px h-4 bg-white/10" />

          <button
            onClick={onClose}
            className="p-2 text-slate-300 hover:text-white hover:bg-red-500/20 rounded-xl transition-colors"
            title="Close Lightbox (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Interactive Canvas Area */}
      <div
        ref={containerRef}
        className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
      >
        <img
          src={imageUrl}
          alt={prompt}
          draggable={false}
          style={{
            transform: `matrix(${scale}, 0, 0, ${scale}, ${translateX}, ${translateY})`,
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
            maxHeight: '85vh',
            maxWidth: '85vw',
          }}
          className="object-contain rounded-lg shadow-2xl pointer-events-auto"
        />
      </div>

      {/* Bottom Floating Prompt Details Drawer */}
      <div className="absolute bottom-4 left-4 right-4 z-20 p-4 bg-slate-900/85 border border-white/10 backdrop-blur-xl rounded-2xl shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
        <div className="flex-1 space-y-1">
          <span className="font-semibold text-purple-400 uppercase tracking-wider text-[10px]">Master Prompt:</span>
          <p className="text-slate-200 italic font-sans leading-relaxed">{prompt}</p>
        </div>

        <div className="flex items-center gap-2 self-end md:self-auto">
          <button
            onClick={handleCopyPrompt}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-white/10 hover:bg-white/20 text-white rounded-xl font-medium transition-colors"
          >
            {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            <span>Copy Prompt</span>
          </button>

          <a
            href={imageUrl}
            target="_blank"
            rel="noopener noreferrer"
            download
            className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl font-medium shadow-lg transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            <span>Download Asset</span>
          </a>
        </div>
      </div>
    </div>
  );
};
