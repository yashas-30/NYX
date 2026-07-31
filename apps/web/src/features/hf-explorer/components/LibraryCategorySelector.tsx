// src/features/hf-explorer/components/LibraryCategorySelector.tsx
import React, { useState, useRef, useEffect } from 'react';
import { Books, Check, MagnifyingGlass } from '@phosphor-icons/react';
import { motion, AnimatePresence } from 'framer-motion';

export interface LibraryOption {
  id: string;
  label: string;
  query: string;
  badge: string;
  description: string;
}

export const LIBRARY_OPTIONS: LibraryOption[] = [
  { id: 'all', label: 'All Libraries', query: '', badge: 'ALL', description: 'Show all model libraries and formats' },
  { id: 'gguf', label: 'GGUF', query: 'gguf', badge: 'GGUF', description: 'Quantized LLM & Vision models for llama.cpp' },
  { id: 'diffusers', label: 'Diffusers', query: 'diffusers', badge: 'DIFF', description: 'Text-to-Image local image generation' },
  { id: 'paddleocr', label: 'PaddleOCR', query: 'paddleocr', badge: 'OCR', description: 'Optical Character Recognition & Image-to-Text' },
  { id: 'safetensors', label: 'Safetensors', query: 'safetensors', badge: 'SAFE', description: 'Zero-copy safe PyTorch / HF model weights' },
  { id: 'onnx', label: 'ONNX', query: 'onnx', badge: 'ONNX', description: 'Cross-platform native neural engine weights' },
  { id: 'transformers', label: 'Transformers', query: 'transformers', badge: 'HF', description: 'Official Hugging Face Transformers models' },
  { id: 'transformers.js', label: 'Transformers.js', query: 'transformers.js', badge: 'WEB', description: 'In-browser WebGPU & WASM client inference' },
  { id: 'sentence-transformers', label: 'Sentence-Transformers', query: 'sentence-transformers', badge: 'RAG', description: 'Vector embeddings & semantic search' },
  { id: 'pyannote-audio', label: 'pyannote.audio', query: 'pyannote-audio', badge: 'AUDIO', description: 'Speaker diarization & audio analysis' },
  { id: 'openvino', label: 'OpenVINO', query: 'openvino', badge: 'INTEL', description: 'Intel NPU & iGPU hardware accelerated models' },
  { id: 'mlx', label: 'MLX', query: 'mlx', badge: 'MLX', description: 'Apple Silicon MLX framework models' },
  { id: 'llamafile', label: 'llamafile', query: 'llamafile', badge: 'EXE', description: 'Single-executable standalone local models' },
];

interface LibraryCategorySelectorProps {
  activeLibrary: string;
  onLibraryChange: (id: string) => void;
}

export function LibraryCategorySelector({
  activeLibrary,
  onLibraryChange,
}: LibraryCategorySelectorProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  const activeOpt = LIBRARY_OPTIONS.find((l) => l.id === activeLibrary) || LIBRARY_OPTIONS[0];

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = LIBRARY_OPTIONS.filter(
    (opt) =>
      opt.label.toLowerCase().includes(search.toLowerCase()) ||
      opt.description.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div ref={containerRef} className="relative shrink-0 z-40">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className={`flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-xl border transition-all cursor-pointer shadow-xs ${
          activeLibrary !== 'all'
            ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 hover:bg-purple-500/20'
            : 'bg-background text-foreground border-border/80 hover:bg-muted/30'
        }`}
      >
        <Books size={14} className={activeLibrary !== 'all' ? 'text-purple-400' : 'text-muted-foreground'} />
        <span>{activeOpt.label}</span>
        <span className="text-[9px] text-muted-foreground ml-0.5">▼</span>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 top-full mt-2 w-72 max-h-96 rounded-2xl bg-popover border border-border shadow-2xl overflow-hidden flex flex-col z-[100]"
          >
            {/* Top Search Bar inside Popover */}
            <div className="p-2.5 border-b border-border/50 bg-muted/20 relative">
              <MagnifyingGlass size={13} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Filter library (Diffusers, GGUF...)"
                className="w-full bg-background border border-border/60 rounded-lg text-xs py-1.5 pl-7 pr-3 outline-none focus:border-primary/60 transition-all placeholder:text-muted-foreground/40"
              />
            </div>

            {/* List */}
            <div className="flex-1 overflow-y-auto custom-scrollbar p-1.5 flex flex-col gap-1">
              {filtered.map((opt) => {
                const isSelected = activeLibrary === opt.id;
                return (
                  <button
                    key={opt.id}
                    onClick={() => {
                      onLibraryChange(opt.id);
                      setIsOpen(false);
                      setSearch('');
                    }}
                    className={`w-full flex items-start gap-2 p-2 rounded-xl text-left transition-all ${
                      isSelected
                        ? 'bg-primary/10 border border-primary/30 text-primary font-bold'
                        : 'hover:bg-muted/50 text-foreground border border-transparent'
                    }`}
                  >
                    <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-muted border border-border/40 text-muted-foreground shrink-0 mt-0.5">
                      {opt.badge}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-semibold flex items-center justify-between">
                        <span className="truncate">{opt.label}</span>
                        {isSelected && <Check size={12} className="text-primary shrink-0" />}
                      </div>
                      <div className="text-[10px] text-muted-foreground/70 truncate mt-0.5">
                        {opt.description}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
