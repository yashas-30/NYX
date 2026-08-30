import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, LayoutGrid } from 'lucide-react';
import { SlidevSlide } from '../../artifacts/utils/slidevParser';

interface SlideOverviewGridProps {
  isOpen: boolean;
  slides: SlidevSlide[];
  activeSlideIndex: number;
  onSelectSlide: (index: number) => void;
  onClose: () => void;
}

export const SlideOverviewGrid: React.FC<SlideOverviewGridProps> = ({
  isOpen,
  slides,
  activeSlideIndex,
  onSelectSlide,
  onClose,
}) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-8 bg-black/90 backdrop-blur-xl">
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.96 }}
          className="w-full max-w-5xl max-h-[85vh] bg-[#050505] border border-white/10 rounded-2xl flex flex-col overflow-hidden shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#0a0a0a]">
            <div className="flex items-center gap-2.5 text-white font-semibold text-sm">
              <LayoutGrid className="w-4 h-4 text-zinc-400" />
              <span>Slide Overview ({slides.length} Slides)</span>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-zinc-800/60 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Grid Container */}
          <div className="flex-1 overflow-y-auto p-6 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 custom-scrollbar">
            {slides.map((slide, idx) => (
              <div
                key={idx}
                onClick={() => {
                  onSelectSlide(idx);
                  onClose();
                }}
                className={`group relative flex flex-col justify-between aspect-[16/9] p-3.5 rounded-xl cursor-pointer border transition-all ${
                  idx === activeSlideIndex
                    ? 'bg-zinc-900/90 border-white text-white shadow-md'
                    : 'bg-[#0a0a0a] border-white/10 hover:border-white/30 hover:bg-zinc-900/50'
                }`}
              >
                {/* Top Badge */}
                <div className="flex items-center justify-between">
                  <span
                    className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                      idx === activeSlideIndex
                        ? 'bg-white text-black'
                        : 'bg-zinc-800 text-zinc-400 group-hover:text-zinc-200'
                    }`}
                  >
                    {idx + 1}
                  </span>
                  <span className="text-[9px] font-mono uppercase tracking-wider text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded border border-white/5">
                    {slide.layout}
                  </span>
                </div>

                {/* Center Title */}
                <div className="my-auto text-center px-1">
                  <span className="text-xs font-medium text-zinc-100 line-clamp-2 leading-snug">
                    {slide.title || `Slide ${idx + 1}`}
                  </span>
                </div>

                {/* Bottom Footer Details */}
                <div className="text-[9px] text-zinc-500 truncate font-mono">
                  {slide.notes ? '📝 notes' : ''}
                </div>
              </div>
            ))}
          </div>

          {/* Footer Guidance */}
          <div className="px-6 py-3 border-t border-white/10 bg-[#0a0a0a] text-xs text-zinc-400 flex justify-between">
            <span>Click any slide to navigate</span>
            <span className="font-mono text-zinc-500">ESC to close</span>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
