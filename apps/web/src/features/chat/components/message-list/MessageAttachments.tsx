import React, { memo, useState, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';
import { ImageIcon, FileText, X } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getDomainFaviconUrl } from '../../../../core/services/mediaEngine';

// ---------------------------------------------------------------------------
// Inline Source Avatar Component
// ---------------------------------------------------------------------------
export const InlineSourceAvatar: React.FC<{ href: string; children?: React.ReactNode }> = memo(
  ({ href }) => {
    const [imgError, setImgError] = useState(false);
    const faviconUrl = useMemo(() => getDomainFaviconUrl(href), [href]);

    let domain = '';
    try {
      domain = new URL(href).hostname.replace(/^www\./, '');
    } catch {
      domain = href || '';
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        title={`Source: ${domain}`}
        className="inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 my-0.5 rounded-full bg-muted/60 hover:bg-muted/90 border border-border/70 text-foreground transition-all hover:scale-105 active:scale-95 no-underline align-middle text-xs group cursor-pointer shadow-2xs"
      >
        {!imgError ? (
          <img
            src={faviconUrl}
            alt={domain}
            className="w-3.5 h-3.5 rounded-full object-contain shrink-0"
            onError={() => setImgError(true)}
          />
        ) : (
          <span className="w-3.5 h-3.5 rounded-full bg-primary/20 flex items-center justify-center text-[9px] font-bold text-primary shrink-0">
            {domain.charAt(0).toUpperCase()}
          </span>
        )}
        <span className="text-[11px] font-medium text-foreground/90 group-hover:text-primary transition-colors max-w-[140px] truncate">
          {domain}
        </span>
      </a>
    );
  }
);
InlineSourceAvatar.displayName = 'InlineSourceAvatar';

// ---------------------------------------------------------------------------
// Image Attachment Display
// ---------------------------------------------------------------------------
export const ImageAttachment: React.FC<{ src: string; alt?: string }> = memo(({ src, alt }) => {
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [proxiedSrc, setProxiedSrc] = useState<string | null>(null);

  const displaySrc = useMemo(() => {
    if (!src) return '';
    let cleaned = src.trim();
    if (cleaned.startsWith('//')) {
      cleaned = `https:${cleaned}`;
    }
    if (
      cleaned.startsWith('data:') ||
      cleaned.startsWith('blob:') ||
      cleaned.startsWith('http://') ||
      cleaned.startsWith('https://')
    ) {
      return cleaned;
    }
    if (cleaned.startsWith('/uploads/') || cleaned.startsWith('/api/')) {
      return `${(window as Record<string, any>).__NYX_BACKEND_URL__ || ''}${cleaned}`;
    }
    if (
      cleaned.startsWith('file://') ||
      cleaned.startsWith('C:') ||
      cleaned.startsWith('D:') ||
      (cleaned.startsWith('/') && !cleaned.startsWith('/assets'))
    ) {
      try {
        const cleanPath = cleaned.replace(/^file:\/\/\/?/, '');
        return convertFileSrc(cleanPath);
      } catch {
        return cleaned;
      }
    }
    return cleaned;
  }, [src]);

  const activeImageSrc = proxiedSrc || displaySrc;

  const handleImageError = useCallback(() => {
    if (!proxiedSrc && displaySrc && displaySrc.startsWith('http')) {
      // Fetch base64 data URL via Rust backend proxy (bypasses webview CORS & hotlink blocks)
      invoke<string>('fetch_image_data_url_command', { url: displaySrc })
        .then((b64DataUrl: string) => {
          if (b64DataUrl) {
            setProxiedSrc(b64DataUrl);
            setError(false);
          } else {
            setError(true);
          }
        })
        .catch(() => {
          setError(true);
        });
    } else {
      setError(true);
    }
  }, [displaySrc, proxiedSrc]);

  if (error) {
    return (
      <a
        href={displaySrc}
        target="_blank"
        rel="noopener noreferrer"
        className="my-2.5 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border/70 hover:bg-muted/70 transition-all text-xs font-medium text-foreground/90 no-underline max-w-md"
      >
        <ImageIcon size={16} className="text-primary shrink-0" />
        <span className="truncate flex-1">{alt || displaySrc}</span>
      </a>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.15, ease: 'easeOut' }}
      className="my-2.5 relative group/image"
    >
      <div
        className={`relative rounded-xl overflow-hidden border border-border/70 bg-muted/40 cursor-zoom-in transition-all ${
          expanded
            ? 'fixed inset-4 z-50 flex items-center justify-center bg-black/80 p-4'
            : 'inline-block max-w-lg shadow-md hover:border-indigo-500/40'
        }`}
        onClick={() => setExpanded(!expanded)}
      >
        {!loaded && (
          <div className="w-48 h-36 flex items-center justify-center bg-slate-900/60 animate-pulse">
            <ImageIcon size={24} className="text-muted-foreground/50 animate-pulse" />
          </div>
        )}

        <img
          src={activeImageSrc}
          alt={alt || 'Attached image'}
          referrerPolicy="no-referrer"
          className={`max-h-80 max-w-full object-contain rounded-xl transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
          onLoad={() => setLoaded(true)}
          onError={handleImageError}
        />

        {expanded && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              setExpanded(false);
            }}
            className="absolute top-4 right-4 p-2 rounded-md bg-black/50 text-white hover:bg-black/70 transition-colors"
          >
            <X size={16} />
          </button>
        )}
      </div>
    </motion.div>
  );
});
ImageAttachment.displayName = 'ImageAttachment';

// ---------------------------------------------------------------------------
// File Attachment Display (Claude Style)
// ---------------------------------------------------------------------------
export const FileAttachment: React.FC<{
  name: string;
  size?: number;
  type?: string;
  mimeType?: string;
}> = memo(({ name, size, type, mimeType }) => {
  const formatSize = (bytes?: number) => {
    if (!bytes) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex items-center gap-3 px-3 py-2 bg-muted/30 border border-border rounded-lg max-w-[280px] shadow-sm mb-2"
    >
      <div className="flex-shrink-0 w-8 h-8 flex items-center justify-center bg-primary/10 text-primary rounded-md">
        <FileText size={16} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[12px] font-semibold text-foreground truncate">{name}</p>
        <p className="text-[10px] text-muted-foreground uppercase tracking-wide truncate">
          {type || mimeType?.split('/')[1] || 'FILE'} {size ? `• ${formatSize(size)}` : ''}
        </p>
      </div>
    </motion.div>
  );
});
FileAttachment.displayName = 'FileAttachment';
