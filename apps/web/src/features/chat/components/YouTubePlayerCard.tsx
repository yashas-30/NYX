/**
 * YouTubePlayerCard.tsx
 *
 * Premium Minimalist True Black interactive YouTube video player component.
 * Implements the Facade Click-to-Play pattern for zero layout shift (CLS)
 * and zero third-party cookie tracking via youtube-nocookie.com.
 */

import React, { useState, memo } from 'react';
import { Play, ExternalLink, X, Film, Clock, User } from 'lucide-react';

export interface YouTubePlayerCardProps {
  videoId: string;
  title?: string;
  channel?: string;
  duration?: string | number;
  url?: string;
}

export const YouTubePlayerCard: React.FC<YouTubePlayerCardProps> = memo(
  ({ videoId, title, channel, duration, url }) => {
    const [isPlaying, setIsPlaying] = useState(false);
    const [thumbnailError, setThumbnailError] = useState(false);

    const videoUrl = url || `https://www.youtube.com/watch?v=${videoId}`;
    const embedUrl = `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=1&rel=0&modestbranding=1`;

    const thumbnailUrl = thumbnailError
      ? `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      : `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;

    const formattedDuration =
      typeof duration === 'number'
        ? `${Math.floor(duration / 60)}:${String(duration % 60).padStart(2, '0')}`
        : duration || '';

    const handleOpenExternal = (e: React.MouseEvent) => {
      e.stopPropagation();
      if (typeof window !== 'undefined') {
        window.open(videoUrl, '_blank', 'noopener,noreferrer');
      }
    };

    return (
      <div className="my-4 w-full max-w-2xl rounded-xl overflow-hidden border border-white/10 bg-black/90 shadow-2xl transition-all duration-300 hover:border-white/20 group/yt">
        {isPlaying ? (
          <div className="relative w-full aspect-video bg-black flex flex-col justify-between">
            <iframe
              src={embedUrl}
              title={title || 'YouTube Video Player'}
              className="w-full h-full border-0 rounded-t-xl"
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
              allowFullScreen
            />
            {/* Player Control Bar */}
            <div className="flex items-center justify-between px-3 py-2 bg-[#09090b] border-t border-white/10 text-xs text-neutral-400">
              <div className="flex items-center gap-2 truncate pr-2">
                <Film size={13} className="text-red-500 shrink-0" />
                <span className="truncate text-white/90 font-medium text-[12px]">
                  {title || 'YouTube Video'}
                </span>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleOpenExternal}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-white/80 hover:text-white transition-colors text-[11px] cursor-pointer"
                  title="Open in YouTube"
                >
                  <ExternalLink size={11} />
                  <span>YouTube</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsPlaying(false)}
                  className="flex items-center gap-1 px-2 py-1 rounded bg-white/10 hover:bg-white/20 text-white transition-colors text-[11px] cursor-pointer font-medium"
                  title="Collapse Player"
                >
                  <X size={12} />
                  <span>Close</span>
                </button>
              </div>
            </div>
          </div>
        ) : (
          <div
            className="relative w-full aspect-video cursor-pointer select-none overflow-hidden"
            onClick={() => setIsPlaying(true)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setIsPlaying(true);
              }
            }}
            aria-label={`Play YouTube video: ${title || 'YouTube Video'}`}
          >
            {/* High-Resolution Thumbnail */}
            <img
              src={thumbnailUrl}
              alt={title || 'Video thumbnail'}
              onError={() => setThumbnailError(true)}
              className="w-full h-full object-cover transition-transform duration-700 ease-out group-hover/yt:scale-105"
              loading="lazy"
            />

            {/* Gradient Overlays */}
            <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/30 to-black/20" />

            {/* Top Bar: Channel Badge + Open External */}
            <div className="absolute top-3 left-3 right-3 flex items-center justify-between pointer-events-none">
              {channel ? (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 border border-white/15 backdrop-blur-md text-[11px] font-medium text-white/90 shadow-md">
                  <User size={11} className="text-red-400" />
                  <span className="truncate max-w-[180px]">{channel}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/75 border border-white/15 backdrop-blur-md text-[11px] font-medium text-red-400 shadow-md">
                  <Film size={11} />
                  <span>YouTube</span>
                </div>
              )}

              <button
                type="button"
                onClick={handleOpenExternal}
                className="pointer-events-auto p-1.5 rounded-full bg-black/75 border border-white/15 hover:bg-white/20 text-white/80 hover:text-white transition-all backdrop-blur-md cursor-pointer"
                title="Open on YouTube"
              >
                <ExternalLink size={12} />
              </button>
            </div>

            {/* Center Play Button with Red Glow */}
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="relative group/btn flex items-center justify-center">
                <div className="absolute -inset-2 bg-red-600/30 rounded-full blur-md opacity-0 group-hover/yt:opacity-100 transition-opacity duration-300" />
                <div className="relative w-14 h-14 rounded-full bg-red-600/90 text-white flex items-center justify-center shadow-2xl transition-all duration-300 group-hover/yt:scale-110 group-hover/yt:bg-red-600 border border-white/20">
                  <Play size={22} className="ml-1 fill-white text-white" />
                </div>
              </div>
            </div>

            {/* Bottom Info Strip */}
            <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between gap-3 pointer-events-none">
              <div className="space-y-1 max-w-[85%]">
                <p className="text-[13.5px] font-semibold text-white tracking-tight line-clamp-2 leading-snug drop-shadow-md">
                  {title || 'YouTube Video'}
                </p>
              </div>
              {formattedDuration && (
                <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded bg-black/85 border border-white/15 text-[11px] font-mono text-white/90 shadow-md backdrop-blur-sm">
                  <Clock size={10} className="text-white/60" />
                  <span>{formattedDuration}</span>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    );
  }
);

YouTubePlayerCard.displayName = 'YouTubePlayerCard';
