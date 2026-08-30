import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles, Maximize2, Image as ImageIcon } from 'lucide-react';

export interface ImageArtifactCardProps {
  imageUrl: string;
  prompt?: string;
  provider?: string;
  engine?: string;
  altText?: string;
  aspectRatio?: string;
  onOpenLightbox?: (url?: string, prompt?: string, engine?: string) => void;
  onReroll?: (prompt: string, aspectRatio?: string) => void;
}

/**
 * Proxies external image URLs through the Rust backend (fetch_image_base64).
 * This bypasses hotlink protection and WebView2 referrer/CORS restrictions
 * that block DuckDuckGo and Bing image CDN URLs when loaded directly in <img>.
 */
async function proxyImageUrl(url: string): Promise<string> {
  if (!url || !url.startsWith('http')) return url;
  try {
    const result = await invoke<{ base64: string; mime_type: string }>('fetch_image_base64', {
      url,
    });
    if (result?.base64) {
      return `data:${result.mime_type || 'image/jpeg'};base64,${result.base64}`;
    }
  } catch {
    // fall back to direct URL
  }
  return url;
}

export const ImageArtifactCard: React.FC<ImageArtifactCardProps> = ({
  imageUrl,
  prompt,
  altText,
  onOpenLightbox,
  engine,
}) => {
  const [resolvedSrc, setResolvedSrc] = useState<string | null>(null);
  const [hasError, setHasError] = useState(false);
  const abortRef = useRef(false);

  useEffect(() => {
    abortRef.current = false;
    setResolvedSrc(null);
    setHasError(false);

    if (!imageUrl) return;

    proxyImageUrl(imageUrl)
      .then((src) => {
        if (!abortRef.current) setResolvedSrc(src);
      })
      .catch(() => {
        if (!abortRef.current) setHasError(true);
      });

    return () => {
      abortRef.current = true;
    };
  }, [imageUrl]);

  if (!imageUrl || hasError) return null;

  const displayTitle = altText || prompt || 'Visual Reference';

  if (!resolvedSrc) {
    // Shimmer while proxying
    return (
      <div className="my-3.5 flex flex-col max-w-xl rounded-xl border border-white/5 bg-zinc-950/60 p-2 animate-pulse">
        <div className="w-full h-44 rounded-lg bg-white/5 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-primary/50" />
        </div>
      </div>
    );
  }

  return (
    <figure className="my-4 max-w-xl group relative overflow-hidden rounded-xl border border-white/10 dark:border-white/10 bg-zinc-950/70 backdrop-blur-xs shadow-md transition-all duration-200 hover:border-primary/40">
      <div
        className="relative overflow-hidden bg-black/40 cursor-pointer flex items-center justify-center max-h-[300px]"
        onClick={() => onOpenLightbox?.(imageUrl, prompt, engine)}
      >
        <img
          src={resolvedSrc}
          alt={displayTitle}
          decoding="async"
          onError={() => setHasError(true)}
          className="w-full h-auto max-h-[300px] object-contain rounded-t-xl transition-transform duration-300 group-hover:scale-[1.015]"
        />
        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors flex items-center justify-center opacity-0 group-hover:opacity-100 duration-200 pointer-events-none">
          <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-zinc-900/90 text-white text-[11px] font-medium border border-white/20 shadow-lg backdrop-blur-md">
            <Maximize2 size={12} className="text-primary" />
            Expand Preview
          </span>
        </div>
      </div>
      {displayTitle && displayTitle !== 'Visual Reference' && (
        <figcaption className="flex items-center justify-between px-3 py-2 border-t border-white/5 bg-zinc-900/40 text-[11.5px] text-zinc-400 font-sans">
          <span className="flex items-center gap-1.5 truncate font-medium text-zinc-300">
            <ImageIcon size={12} className="text-primary/70 shrink-0" />
            <span className="truncate">{displayTitle}</span>
          </span>
          <span className="text-[10px] text-zinc-500 uppercase tracking-wider shrink-0 font-mono">
            {engine || 'Reference'}
          </span>
        </figcaption>
      )}
    </figure>
  );
};
