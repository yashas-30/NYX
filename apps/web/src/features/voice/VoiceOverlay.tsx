import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { XIcon as X, MicIcon as Mic, MicOffIcon as MicOff } from '@animateicons/react/lucide';
import { Volume2 } from 'lucide-react';
import { Button } from '@src/shared/components/ui/button';

interface VoiceOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  status: 'listening' | 'processing' | 'transcribing' | 'error';
  errorMessage?: string;
  transcript?: string;
}

export const VoiceOverlay: React.FC<VoiceOverlayProps> = ({
  isOpen,
  onClose,
  status,
  errorMessage,
  transcript,
}) => {
  const [volume, setVolume] = useState<number[]>(new Array(12).fill(10));
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animationRef = useRef<number | null>(null);

  // Initialize Audio Visualizer
  useEffect(() => {
    if (!isOpen) return;

    let active = true;

    async function initVisualizer() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (!active) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;

        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const audioCtx = new AudioContextClass();
        audioCtxRef.current = audioCtx;

        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyserRef.current = analyser;
        source.connect(analyser);

        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateMeter() {
          if (!active) return;
          if (analyserRef.current) {
            analyserRef.current.getByteFrequencyData(dataArray);
            
            // Map frequencies to 12 bands
            const newVolume = Array.from(dataArray)
              .slice(0, 12)
              .map((v) => Math.max(8, (v / 255) * 80));
            
            // Padding if frequency bins are fewer
            while (newVolume.length < 12) {
              newVolume.push(8);
            }
            setVolume(newVolume);
          }
          animationRef.current = requestAnimationFrame(updateMeter);
        }

        updateMeter();
      } catch (err) {
        console.error('Audio visualizer failed to initialize:', err);
      }
    }

    initVisualizer();

    return () => {
      active = false;
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const statusLabel = {
    listening: 'Listening to your voice...',
    processing: 'Processing speech...',
    transcribing: 'Transcribing with Whisper...',
    error: 'Error occurred',
  }[status];

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 bg-background/95 backdrop-blur-md flex flex-col items-center justify-between p-6 z-50 overflow-hidden"
      >
        {/* Header */}
        <div className="w-full flex justify-end">
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="rounded-full hover:bg-white/10 text-white/80 hover:text-white"
          >
            <X className="w-6 h-6" />
          </Button>
        </div>

        {/* Core Visualization Container */}
        <div className="flex-1 flex flex-col items-center justify-center gap-12 w-full max-w-lg">
          {/* Waveform Visualization */}
          <div className="h-40 flex items-center justify-center gap-1.5 w-full">
            {volume.map((height, i) => (
              <motion.div
                key={i}
                animate={{ height: status === 'listening' ? height : 8 }}
                transition={{ type: 'spring', stiffness: 300, damping: 20 }}
                style={{
                  width: '6px',
                  borderRadius: '9999px',
                  background: 'linear-gradient(to top, var(--primary), var(--accent))',
                  boxShadow: '0 0 15px rgba(204, 120, 92, 0.4)',
                }}
              />
            ))}
          </div>

          {/* Glowing Orb representation of voice state */}
          <div className="relative flex items-center justify-center">
            <motion.div
              animate={{
                scale: status === 'listening' ? [1, 1.08, 1] : 1,
              }}
              transition={{
                repeat: Infinity,
                duration: 2,
                ease: 'easeInOut',
              }}
              className={`w-24 h-24 rounded-full bg-gradient-to-tr ${
                status === 'error'
                  ? 'from-destructive to-rose-400'
                  : 'from-primary to-accent'
              } flex items-center justify-center shadow-xl relative z-10`}
            >
              {status === 'listening' ? (
                <Mic className="w-10 h-10 text-white" />
              ) : status === 'error' ? (
                <MicOff className="w-10 h-10 text-white" />
              ) : (
                <AnimatedIcon icon={Volume2} className="w-10 h-10 text-white animate-pulse" />
              )}
            </motion.div>
            
            {/* Ambient background glow */}
            <div className={`absolute inset-0 w-24 h-24 rounded-full filter blur-xl opacity-60 animate-pulse ${
              status === 'error' ? 'bg-destructive' : 'bg-primary'
            }`} />
          </div>

          {/* Status Text */}
          <div className="text-center space-y-2">
            <h2 className="text-lg font-semibold text-white tracking-wide">
              {statusLabel}
            </h2>
            {status === 'listening' && (
              <p className="text-sm text-muted-foreground animate-pulse">
                Click the mic or speak to capture
              </p>
            )}
            {status === 'error' && errorMessage && (
              <p className="text-sm text-red-400 font-medium">
                {errorMessage}
              </p>
            )}
          </div>

          {/* Incremental/Live Transcript */}
          {transcript && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className="w-full bg-muted/50 border border-border rounded-xl p-4 text-center max-h-32 overflow-y-auto"
            >
              <p className="text-sm text-foreground/80 italic">
                "{transcript}"
              </p>
            </motion.div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="w-full max-w-sm flex flex-col gap-3 pb-8">
          {status === 'listening' ? (
            <Button
              onClick={onClose}
              className="w-full rounded-full py-6 font-semibold bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-500/20"
            >
              Finish & Send
            </Button>
          ) : (
            <Button
              variant="outline"
              onClick={onClose}
              disabled={status === 'transcribing'}
              className="w-full rounded-full py-6 font-semibold border-white/20 hover:bg-white/5 text-white"
            >
              Cancel
            </Button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
