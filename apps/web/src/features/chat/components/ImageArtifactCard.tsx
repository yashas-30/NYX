import React, { useState, useEffect, useRef } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Sparkles } from 'lucide-react';

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
    const result = await invoke<{ base64: string; mime_type: string }>('fetch_image_base64', { url });
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

    proxyImageUrl(imageUrl).then((src) => {
      if (!abortRef.current) setResolvedSrc(src);
    }).catch(() => {
      if (!abortRef.current) setHasError(true);
    });

    return () => { abortRef.current = true; };
  }, [imageUrl]);

  if (!imageUrl || hasError) return null;

  if (!resolvedSrc) {
    // Shimmer while proxying
    return (
      <span className="inline-flex w-48 h-36 rounded-xl bg-white/5 animate-pulse items-center justify-center align-top my-2">
        <Sparkles className="w-4 h-4 text-purple-400/50" />
      </span>
    );
  }

  return (
    <span className="relative my-2 inline-block max-w-full align-top">
      <img
        src={resolvedSrc}
        alt={altText || prompt || 'Visual Reference'}
        decoding="async"
        onClick={() => onOpenLightbox?.(imageUrl, prompt, engine)}
        onError={() => setHasError(true)}
        className={`max-h-[420px] w-auto h-auto max-w-full object-contain rounded-xl${
          onOpenLightbox ? ' cursor-pointer hover:opacity-90' : ''
        }`}
      />
    </span>
  );
};

