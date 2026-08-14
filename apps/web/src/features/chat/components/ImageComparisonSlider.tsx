import React, { useState, useRef, useEffect } from 'react';
import { X, SlidersHorizontal } from 'lucide-react';

export interface ImageComparisonSliderProps {
  isOpen: boolean;
  beforeUrl: string;
  afterUrl: string;
  beforePrompt?: string;
  afterPrompt?: string;
  onClose: () => void;
}

export const ImageComparisonSlider: React.FC<ImageComparisonSliderProps> = ({
  isOpen,
  beforeUrl,
  afterUrl,
  beforePrompt = 'Original Version',
  afterPrompt = 'Modified Iteration',
  onClose,
}) => {
  const [sliderPosition, setSliderPosition] = useState(50);
  const [isSliding, setIsSliding] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    let percentage = (x / rect.width) * 100;
    if (percentage < 0) percentage = 0;
    if (percentage > 100) percentage = 100;
    setSliderPosition(percentage);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (e.touches.length > 0) {
      handleMove(e.touches[0].clientX);
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isSliding) {
      handleMove(e.clientX);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90 backdrop-blur-2xl animate-in fade-in duration-200 p-4">
      <div className="relative w-full max-w-5xl h-[80vh] flex flex-col bg-slate-900 border border-white/10 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header Bar */}
        <div className="px-5 py-3 border-b border-white/10 flex items-center justify-between bg-slate-950/80 backdrop-blur-md">
          <div className="flex items-center gap-2 text-white font-medium text-sm">
            <SlidersHorizontal className="w-4 h-4 text-purple-400" />
            <span>Visual Iteration Split Comparison</span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-white/10 text-slate-400 hover:text-white rounded-xl transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Interactive Comparison Canvas */}
        <div
          ref={containerRef}
          className="relative flex-1 w-full h-full overflow-hidden select-none cursor-ew-resize bg-slate-950"
          onMouseDown={() => setIsSliding(true)}
          onMouseUp={() => setIsSliding(false)}
          onMouseLeave={() => setIsSliding(false)}
          onMouseMove={handleMouseMove}
          onTouchMove={handleTouchMove}
        >
          {/* Base Layer: After Image */}
          <img
            src={afterUrl}
            alt={afterPrompt}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none"
          />

          {/* Overlay Layer: Before Image (Clipped) */}
          <div
            className="absolute inset-0 w-full h-full overflow-hidden pointer-events-none"
            style={{
              clipPath: `polygon(0 0, ${sliderPosition}% 0, ${sliderPosition}% 100%, 0 100%)`,
            }}
          >
            <img
              src={beforeUrl}
              alt={beforePrompt}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Divider Handle Bar */}
          <div
            className="absolute top-0 bottom-0 w-1 bg-purple-400 shadow-[0_0_12px_rgba(168,85,247,0.8)] pointer-events-none -translate-x-1/2 z-20"
            style={{ left: `${sliderPosition}%` }}
          >
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-purple-600 border-2 border-white shadow-xl flex items-center justify-center text-white">
              <SlidersHorizontal className="w-4 h-4" />
            </div>
          </div>

          {/* Overlay Labels */}
          <div className="absolute top-4 left-4 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono text-purple-300 border border-purple-500/30">
            Original (Before)
          </div>
          <div className="absolute top-4 right-4 bg-black/70 backdrop-blur-md px-3 py-1 rounded-full text-xs font-mono text-emerald-300 border border-emerald-500/30">
            Modified (After)
          </div>
        </div>

        {/* Footer Prompts Comparison */}
        <div className="p-4 bg-slate-950 border-t border-white/10 grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-white/5">
            <span className="text-purple-400 font-semibold block mb-0.5">Turn 1 Prompt:</span>
            <p className="text-slate-300 italic">{beforePrompt}</p>
          </div>
          <div className="p-2.5 bg-slate-900/60 rounded-xl border border-white/5">
            <span className="text-emerald-400 font-semibold block mb-0.5">Turn 2 Edit Prompt:</span>
            <p className="text-slate-300 italic">{afterPrompt}</p>
          </div>
        </div>
      </div>
    </div>
  );
};
