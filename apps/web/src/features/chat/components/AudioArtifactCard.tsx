import React, { useState, useRef, useEffect } from 'react';
import { Play, Pause, Volume2, VolumeX, Disc } from 'lucide-react';

export interface AudioArtifactCardProps {
  audioUrl: string;
  title: string;
  artist?: string;
  duration?: number;
  source?: string;
  tags?: string;
  previewUrl?: string;
}

export const AudioArtifactCard: React.FC<AudioArtifactCardProps> = ({
  audioUrl,
  title,
  artist = 'Audio Soundtrack',
  duration = 180,
  source = 'Audio Track',
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const audioRef = useRef<HTMLAudioElement>(null);

  const formatTime = (seconds: number) => {
    if (isNaN(seconds) || seconds < 0) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      audioRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Audio play failed:', e);
      });
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!audioRef.current) return;
    audioRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = parseFloat(e.target.value);
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const onTimeUpdate = () => setCurrentTime(audio.currentTime);
    const onLoadedMetadata = () => {
      if (audio.duration && !isNaN(audio.duration)) {
        setTotalDuration(audio.duration);
      }
    };
    const onEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };

    audio.addEventListener('timeupdate', onTimeUpdate);
    audio.addEventListener('loadedmetadata', onLoadedMetadata);
    audio.addEventListener('ended', onEnded);

    return () => {
      audio.removeEventListener('timeupdate', onTimeUpdate);
      audio.removeEventListener('loadedmetadata', onLoadedMetadata);
      audio.removeEventListener('ended', onEnded);
    };
  }, []);

  return (
    <div className="my-4 w-full max-w-xl rounded-2xl border border-border/70 bg-gradient-to-br from-card/80 via-card/50 to-muted/20 backdrop-blur-md shadow-md p-4 transition-all duration-300 hover:border-primary/40 hover:shadow-lg group">
      <audio ref={audioRef} src={audioUrl} preload="metadata" />

      <div className="flex items-center gap-3.5">
        {/* Play/Pause Button with Glowing Ring */}
        <button
          onClick={togglePlay}
          aria-label={isPlaying ? 'Pause soundtrack' : 'Play soundtrack'}
          className={`relative shrink-0 flex items-center justify-center w-12 h-12 rounded-full transition-all duration-300 shadow-md ${
            isPlaying
              ? 'bg-primary text-primary-foreground scale-105 shadow-primary/30'
              : 'bg-primary/10 text-primary hover:bg-primary/20 hover:scale-105'
          }`}
        >
          {isPlaying ? (
            <Pause className="w-5 h-5 fill-current" />
          ) : (
            <Play className="w-5 h-5 fill-current ml-0.5" />
          )}
        </button>

        {/* Title, Artist, & Soundwave Visualizer */}
        <div className="flex flex-col min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold tracking-wide text-foreground truncate max-w-xs">
              {title}
            </span>
            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 shrink-0">
              <Disc className="w-2.5 h-2.5 animate-spin" style={{ animationDuration: isPlaying ? '3s' : '0s' }} />
              {source}
            </span>
          </div>

          <div className="flex items-center justify-between mt-1 text-[11px] text-muted-foreground/80">
            <span className="truncate">{artist}</span>

            {/* Frequency bars visualizer */}
            <div className="flex items-end gap-0.5 h-3.5 px-2">
              {[0.4, 0.8, 0.3, 0.9, 0.6, 1.0, 0.5, 0.7].map((height, idx) => (
                <span
                  key={idx}
                  className={`w-0.5 bg-primary/70 rounded-full transition-all duration-150 ${
                    isPlaying ? 'animate-pulse' : 'opacity-40'
                  }`}
                  style={{
                    height: isPlaying ? `${Math.max(20, height * 100)}%` : '25%',
                    animationDelay: `${idx * 120}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>

        {/* Volume / Mute Toggle */}
        <button
          onClick={toggleMute}
          aria-label={isMuted ? 'Unmute' : 'Mute'}
          className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
        >
          {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>
      </div>

      {/* Progress Bar & Time Scrubber */}
      <div className="mt-3 flex items-center gap-2.5">
        <span className="text-[10px] font-mono text-muted-foreground/70 w-8 text-right shrink-0">
          {formatTime(currentTime)}
        </span>

        <div className="relative flex-1 flex items-center group/slider">
          <input
            type="range"
            min="0"
            max={totalDuration || 100}
            step="0.1"
            value={currentTime}
            onChange={handleSeek}
            className="w-full h-1.5 bg-muted rounded-lg appearance-none cursor-pointer accent-primary focus:outline-hidden"
          />
        </div>

        <span className="text-[10px] font-mono text-muted-foreground/70 w-8 text-left shrink-0">
          {formatTime(totalDuration)}
        </span>
      </div>
    </div>
  );
};
