import React, { useState } from 'react';
import { Maximize2, RefreshCw, Copy, Download, Check, Sparkles, Layers } from 'lucide-react';
import { toast } from 'sonner';

export interface ImageArtifactCardProps {
  imageUrl: string;
  prompt: string;
  aspectRatio?: '1:1' | '16:9' | '9:16' | '4:3';
  engine?: string;
  altText?: string;
  onOpenLightbox?: (url: string, prompt: string, engine?: string) => void;
  onReroll?: (prompt: string, aspectRatio?: string) => void;
  onCompare?: () => void;
}

export const ImageArtifactCard: React.FC<ImageArtifactCardProps> = ({
  imageUrl,
  prompt,
  aspectRatio = '16:9',
  engine = 'AI Generator',
  altText,
  onOpenLightbox,
  onReroll,
  onCompare,
}) => {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isCopied, setIsCopied] = useState(false);

  const cssRatio = aspectRatio.replace(':', ' / ');

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(prompt);
    setIsCopied(true);
    toast.success('Prompt copied to clipboard!');
    setTimeout(() => setIsCopied(false), 2000);
  };

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `nyx_generated_${Date.now()}.${blob.type.includes('png') ? 'png' : 'webp'}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast.success('Image downloaded!');
    } catch {
      window.open(imageUrl, '_blank');
    }
  };

  return (
    <div className="relative group rounded-2xl overflow-hidden border border-white/10 bg-slate-900/60 shadow-2xl my-3 max-w-2xl transition-all duration-300 hover:border-white/20">
      {/* Zero CLS Aspect Ratio Container */}
      <div 
        className="w-full relative bg-slate-950 overflow-hidden"
        style={{ aspectRatio: cssRatio }}
      >
        {/* Phase 1: Shimmer & Blur Skeleton Placeholder */}
        {!isLoaded && (
          <div className="absolute inset-0 bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 animate-pulse flex flex-col items-center justify-center gap-2 text-slate-400">
            <Sparkles className="w-8 h-8 animate-spin text-purple-400 opacity-75" />
            <span className="text-xs font-mono text-slate-400">Rendering visual asset...</span>
          </div>
        )}

        {/* Phase 2: High Resolution Image Render */}
        <img
          src={imageUrl}
          alt={altText || prompt}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onLoad={() => setIsLoaded(true)}
          onError={() => setIsLoaded(true)}
          className={`w-full h-full object-cover transition-all duration-500 ${
            isLoaded ? 'opacity-100 scale-100 blur-0' : 'opacity-0 scale-105 blur-md'
          }`}
        />


        {/* Engine Badge Overlay */}
        <div className="absolute top-3 left-3 bg-black/60 backdrop-blur-md border border-white/10 text-white/90 text-[10px] font-mono px-2.5 py-1 rounded-full flex items-center gap-1.5 shadow-md pointer-events-none">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
          <span>{engine}</span>
          <span className="text-white/40">|</span>
          <span className="text-purple-300 font-semibold">{aspectRatio}</span>
        </div>

        {/* Frosted Glass Action Toolbar Pill Overlay */}
        <div className="absolute bottom-3 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0 bg-black/75 backdrop-blur-xl border border-white/15 rounded-full px-3 py-1.5 flex items-center gap-2 shadow-2xl z-10">
          {onOpenLightbox && (
            <button
              onClick={() => onOpenLightbox(imageUrl, prompt, engine)}
              className="p-1.5 hover:bg-white/20 rounded-full text-slate-200 hover:text-white transition-colors"
              title="Inspect (Zoom / Pan)"
            >
              <Maximize2 className="w-4 h-4" />
            </button>
          )}

          {onReroll && (
            <button
              onClick={() => onReroll(prompt, aspectRatio)}
              className="p-1.5 hover:bg-white/20 rounded-full text-slate-200 hover:text-white transition-colors"
              title="Re-roll Variation"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          )}

          {onCompare && (
            <button
              onClick={onCompare}
              className="p-1.5 hover:bg-white/20 rounded-full text-slate-200 hover:text-white transition-colors"
              title="Compare Before/After"
            >
              <Layers className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={handleCopyPrompt}
            className="p-1.5 hover:bg-white/20 rounded-full text-slate-200 hover:text-white transition-colors"
            title="Copy Prompt"
          >
            {isCopied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
          </button>

          <button
            onClick={handleDownload}
            className="p-1.5 hover:bg-white/20 rounded-full text-slate-200 hover:text-white transition-colors"
            title="Download HD Image"
          >
            <Download className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Caption, Prompt Descriptor Footer & Feedback Controls */}
      <div className="p-3 bg-slate-900/90 border-t border-white/5 text-xs text-slate-300 font-sans flex flex-col md:flex-row items-start md:items-center justify-between gap-2">
        <div className="flex-1 truncate mr-2">
          <span className="text-purple-400 font-semibold mr-1.5">Prompt:</span>
          <span className="text-slate-300 italic">{prompt}</span>
        </div>

        {/* Feedback Buttons */}
        <div className="flex items-center gap-1.5 self-end md:self-auto shrink-0">
          <button
            onClick={() => toast.success('Feedback recorded: High visual satisfaction!')}
            className="p-1 hover:bg-emerald-500/20 text-slate-400 hover:text-emerald-400 rounded-md transition-colors"
            title="Thumbs Up (High Quality)"
          >
            👍
          </button>
          <button
            onClick={() => toast.info('Feedback recorded: Flagged for alignment tuning.')}
            className="p-1 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-md transition-colors"
            title="Thumbs Down (Quality Issue)"
          >
            👎
          </button>
        </div>
      </div>
    </div>
  );
};

