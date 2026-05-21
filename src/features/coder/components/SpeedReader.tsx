/**
 * @file src/features/coder/components/SpeedReader.tsx
 * @description RSVP speed reader overlay for reading AI responses at high speed.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Zap, X, Play, Pause, RotateCcw } from 'lucide-react';

interface RSVPWord {
  text: string;
  left: string;
  orp: string;
  right: string;
  delayFactor: number;
}

function parseTextToRSVPWords(text: string): RSVPWord[] {
  let cleanedText = text.replace(/```[\s\S]*?```/g, ' [Code Block] ');
  cleanedText = cleanedText.replace(/`([^`]+)`/g, '$1');
  cleanedText = cleanedText.replace(/[\*_]{1,3}/g, '');

  const rawWords = cleanedText.split(/\s+/).filter(w => w.trim().length > 0);

  return rawWords.map(word => {
    let delayFactor = 1.0;
    const lastChar = word.slice(-1);
    if (['.', '?', '!'].includes(lastChar)) {
      delayFactor = 2.2;
    } else if ([',', ';', ':', '-'].includes(lastChar)) {
      delayFactor = 1.6;
    }

    const cleanWord = word.replace(/^[^\w\d]+|[^\w\d]+$/g, '');
    const cleanLen = cleanWord.length;
    
    let orpIndex = 0;
    if (cleanLen <= 1) {
      orpIndex = 0;
    } else if (cleanLen <= 5) {
      orpIndex = 1;
    } else if (cleanLen <= 9) {
      orpIndex = 2;
    } else if (cleanLen <= 13) {
      orpIndex = 3;
    } else {
      orpIndex = 4;
    }

    const startIndex = word.indexOf(cleanWord);
    const absoluteOrpIndex = startIndex >= 0 ? startIndex + orpIndex : orpIndex;

    const left = word.substring(0, absoluteOrpIndex);
    const orp = word.charAt(absoluteOrpIndex) || '';
    const right = word.substring(absoluteOrpIndex + 1);

    return { text, left, orp, right, delayFactor };
  });
}

interface SpeedReaderOverlayProps {
  text: string;
  onClose: () => void;
}

export const SpeedReaderOverlay: React.FC<SpeedReaderOverlayProps> = ({ text, onClose }) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [wpm, setWpm] = useState(600);

  const words = useMemo(() => parseTextToRSVPWords(text), [text]);
  const currentWord = words[currentIndex];

  const togglePlay = () => setIsPlaying(p => !p);

  useEffect(() => {
    if (!isPlaying) return;
    if (currentIndex >= words.length - 1) {
      setIsPlaying(false);
      return;
    }

    const baseDelay = (60 / wpm) * 1000;
    const currentWordObj = words[currentIndex];
    const delay = baseDelay * (currentWordObj?.delayFactor || 1.0);

    const timer = setTimeout(() => setCurrentIndex(prev => prev + 1), delay);
    return () => clearTimeout(timer);
  }, [isPlaying, currentIndex, wpm, words]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying(p => !p);
      } else if (e.code === 'Escape') {
        onClose();
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIndex(prev => Math.max(0, prev - 1));
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        setIsPlaying(false);
        setCurrentIndex(prev => Math.min(words.length - 1, prev + 1));
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [words.length, onClose]);

  const progressPercent = words.length > 1 ? (currentIndex / (words.length - 1)) * 100 : 0;

  return (
    <div className="absolute inset-0 bg-background/80 backdrop-blur-md z-50 flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300">
      <div className="w-full max-w-lg bg-card/95 border border-border-strong/40 rounded-2xl p-6 shadow-2xl space-y-6">
        <div className="flex items-center justify-between pb-3 border-b border-border-strong/10">
          <div className="flex items-center gap-2">
            <Zap className="w-3.5 h-3.5 text-primary fill-primary/10" />
            <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">RSVP Speed Reader</span>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all"
            title="Close Speed Reader (Esc)"
          >
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>

        <div className="relative border-y border-border-strong/20 py-8 my-6 flex justify-center items-center font-mono text-4xl font-bold select-none h-24 overflow-hidden bg-muted/5">
          <div className="absolute left-1/2 -translate-x-1/2 top-0 w-0.5 h-3.5 bg-primary" />
          <div className="absolute left-1/2 -translate-x-1/2 bottom-0 w-0.5 h-3.5 bg-primary" />
          <div className="absolute left-6 right-6 top-3 border-t border-border-strong/5" />
          <div className="absolute left-6 right-6 bottom-3 border-b border-border-strong/5" />

          <div className="flex w-full">
            <div className="flex-1 text-right text-foreground pr-[0.05em] overflow-hidden whitespace-nowrap">
              {currentWord?.left || ""}
            </div>
            <span className="text-primary select-none shrink-0 text-center flex-none font-bold" style={{ width: '1ch' }}>
              {currentWord?.orp || (currentIndex === 0 ? "" : " ")}
            </span>
            <div className="flex-1 text-left text-foreground/80 pl-[0.05em] overflow-hidden whitespace-nowrap">
              {currentWord?.right || ""}
            </div>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-[9px] font-mono font-bold text-muted-foreground uppercase">
            <span>Word {currentIndex + 1} of {words.length}</span>
            <span>{Math.round(progressPercent)}%</span>
          </div>
          <div className="relative w-full h-1.5 bg-muted rounded-full overflow-hidden group/progress cursor-pointer">
            <input 
              type="range" 
              min={0} 
              max={words.length - 1} 
              value={currentIndex}
              onChange={(e) => {
                setIsPlaying(false);
                setCurrentIndex(Number(e.target.value));
              }}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            />
            <div 
              className="h-full bg-primary rounded-full transition-all duration-100" 
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>

        <div className="flex flex-col gap-4 pt-3 border-t border-border-strong/10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button 
                onClick={() => { setIsPlaying(false); setCurrentIndex(0); }}
                className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition-all border border-border-strong/30"
                title="Restart"
              >
                <RotateCcw size={14} strokeWidth={1.5} />
              </button>
              <button 
                onClick={togglePlay}
                className="p-2 rounded-xl bg-primary text-primary-foreground hover:scale-105 transition-all shadow-lg shadow-primary/25 border border-primary flex items-center justify-center w-9 h-9"
                title={isPlaying ? "Pause (Space)" : "Play (Space)"}
              >
                {isPlaying ? <Pause size={16} fill="currentColor" /> : <Play size={16} className="ml-0.5" fill="currentColor" />}
              </button>
            </div>

            <div className="flex items-center gap-3 bg-muted/20 px-3 py-1.5 rounded-xl border border-border-strong/40">
              <span className="text-[9px] font-black uppercase tracking-wider text-muted-foreground shrink-0">WPM: {wpm}</span>
              <input 
                type="range" 
                min={200} 
                max={1000} 
                step={50} 
                value={wpm} 
                onChange={(e) => setWpm(Number(e.target.value))}
                className="w-24 h-1 bg-muted rounded-lg appearance-none cursor-pointer accent-primary"
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[8px] font-bold text-muted-foreground/60 uppercase">
            <span>[Space] Play/Pause • [Arrows] Step • [Esc] Close</span>
            <div className="flex gap-1.5">
              {[300, 450, 600, 750, 900].map((preset) => (
                <button 
                  key={preset}
                  onClick={() => setWpm(preset)}
                  className={`px-1.5 py-0.5 rounded border transition-all ${
                    wpm === preset 
                      ? 'bg-primary/10 border-primary text-primary' 
                      : 'border-border hover:border-muted-foreground/30 hover:text-muted-foreground'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
