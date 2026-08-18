import React, { useState, useRef } from 'react';
import { Play, Pause, Volume2, VolumeX, Maximize, Download, Film, ExternalLink, ThumbsUp, ThumbsDown } from 'lucide-react';
import { toast } from 'sonner';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';

export interface VideoArtifactCardProps {
  videoUrl: string;
  previewUrl?: string;
  title: string;
  duration?: number;
  source?: string;
  author?: string;
  authorUrl?: string;
  aspectRatio?: '16:9' | '9:16' | '4:3';
}

export const VideoArtifactCard: React.FC<VideoArtifactCardProps> = ({
  videoUrl,
  previewUrl,
  title,
  duration = 0,
  source = 'Video Reference',
  author,
  authorUrl,
}) => {
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(true);
  const [currentTime, setCurrentTime] = useState(0);
  const [totalDuration, setTotalDuration] = useState(duration);
  const [feedback, setFeedback] = useState<'up' | 'down' | null>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const { recordFeedback } = useTokenUsage();

  const detectedProvider = 'video';

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().then(() => {
        setIsPlaying(true);
      }).catch((e) => {
        console.warn('Video play failed:', e);
      });
    }
  };

  const toggleMute = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const toggleFullscreen = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!videoRef.current) return;
    if (videoRef.current.requestFullscreen) {
      videoRef.current.requestFullscreen();
    }
  };

  const handleDownload = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const link = document.createElement('a');
      link.href = videoUrl;
      link.target = '_blank';
      link.download = `nyx_video_${Date.now()}.mp4`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Video download started');
    } catch {
      window.open(videoUrl, '_blank');
    }
  };

  const handleFeedback = (type: 'up' | 'down', e: React.MouseEvent) => {
    e.stopPropagation();
    if (feedback === type) {
      setFeedback(null);
      return;
    }
    setFeedback(type);
    recordFeedback(detectedProvider, type);
    if (type === 'up') {
      toast.success('Video quality rating saved to API key data!');
    } else {
      toast.info('Video feedback recorded');
    }
  };

  const formatSeconds = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const formattedSource = source || 'Video Reference';

  return (
    <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-slate-950/90 shadow-2xl my-3 max-w-2xl transition-all duration-300 hover:border-white/20">
      {/* Uncropped Video Viewport */}
      <div 
        className="w-full min-h-[240px] max-h-[580px] relative bg-black overflow-hidden cursor-pointer flex items-center justify-center"
        onClick={togglePlay}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          poster={previewUrl}
          playsInline
          muted={isMuted}
          loop
          onTimeUpdate={() => {
            if (videoRef.current) {
              setCurrentTime(videoRef.current.currentTime);
              if (videoRef.current.duration && !totalDuration) {
                setTotalDuration(videoRef.current.duration);
              }
            }
          }}
          onEnded={() => setIsPlaying(false)}
          className="max-h-[580px] w-auto h-auto max-w-full object-contain block mx-auto"
        />

        {/* Big Play Overlay */}
        {!isPlaying && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] flex items-center justify-center transition-all duration-300 group-hover:bg-black/30">
            <div className="w-14 h-14 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-xl border border-white/30 flex items-center justify-center text-white shadow-2xl transition-transform transform group-hover:scale-110">
              <Play className="w-6 h-6 fill-white ml-1" />
            </div>
          </div>
        )}

        {/* Source Badge & Duration Overlay */}
        <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md border border-white/15 text-white text-[10px] font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md pointer-events-none">
          <Film className="w-3 h-3 text-cyan-400" />
          <span className="font-semibold text-cyan-200">{formattedSource}</span>
          {totalDuration > 0 && (
            <>
              <span className="text-white/40">|</span>
              <span className="text-white/80">{formatSeconds(totalDuration)}</span>
            </>
          )}
        </div>

        {/* Author link */}
        {author && (
          <div className="absolute top-3 right-3 bg-black/70 backdrop-blur-md border border-white/15 text-white/90 text-[10px] px-2.5 py-1 rounded-full flex items-center gap-1 shadow-md opacity-0 group-hover:opacity-100 transition-opacity">
            <span>By {author}</span>
            {authorUrl && (
              <a
                href={authorUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-cyan-300 hover:text-cyan-100 transition-colors ml-0.5"
                title="View Creator Page"
              >
                <ExternalLink className="w-2.5 h-2.5" />
              </a>
            )}
          </div>
        )}

        {/* Floating Thumbs Up & Down Overlay with Video Behind */}
        <div className="absolute bottom-3 right-3 flex items-center gap-1.5 bg-black/65 hover:bg-black/85 backdrop-blur-md border border-white/15 rounded-full px-2.5 py-1 z-10 shadow-xl transition-all">
          <button
            onClick={(e) => handleFeedback('up', e)}
            className={`p-1 rounded-full transition-all cursor-pointer ${
              feedback === 'up'
                ? 'bg-emerald-500/30 text-emerald-400 scale-110 shadow-sm'
                : 'hover:bg-white/20 text-slate-300 hover:text-emerald-400'
            }`}
            title="High Quality Video"
          >
            <ThumbsUp className="w-3.5 h-3.5" />
          </button>
          <div className="w-[1px] h-3 bg-white/20" />
          <button
            onClick={(e) => handleFeedback('down', e)}
            className={`p-1 rounded-full transition-all cursor-pointer ${
              feedback === 'down'
                ? 'bg-red-500/30 text-red-400 scale-110 shadow-sm'
                : 'hover:bg-white/20 text-slate-300 hover:text-red-400'
            }`}
            title="Poor Quality Video"
          >
            <ThumbsDown className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Interactive Bottom Video Control Bar Overlay */}
        <div className="absolute bottom-12 left-3 right-3 p-2 bg-black/75 backdrop-blur-md border border-white/10 rounded-xl flex items-center justify-between gap-3 opacity-0 group-hover:opacity-100 transition-all duration-300">
          <div className="flex items-center gap-2">
            <button
              onClick={(e) => { e.stopPropagation(); togglePlay(); }}
              className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
              title={isPlaying ? 'Pause' : 'Play'}
            >
              {isPlaying ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 fill-white ml-0.5" />}
            </button>
            <button
              onClick={toggleMute}
              className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
              title={isMuted ? 'Unmute' : 'Mute'}
            >
              {isMuted ? <VolumeX className="w-3 h-3 text-red-300" /> : <Volume2 className="w-3 h-3" />}
            </button>
            <span className="text-[10px] font-mono text-white/80">
              {formatSeconds(currentTime)} / {formatSeconds(totalDuration || 0)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
              title="Download MP4 Video"
            >
              <Download className="w-3 h-3" />
            </button>
            <button
              onClick={toggleFullscreen}
              className="p-1 rounded-full bg-white/20 hover:bg-white/30 text-white transition-colors cursor-pointer"
              title="Fullscreen"
            >
              <Maximize className="w-3 h-3" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
