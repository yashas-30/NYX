import React, { memo } from 'react';
import { motion } from 'framer-motion';

// ---------------------------------------------------------------------------
// Streaming Cursor & Loader
// ---------------------------------------------------------------------------
export const StreamingCursor = memo(() => (
  <span className="inline-flex items-center justify-center ml-1 align-baseline">
    <motion.span
      className="inline-block w-2.5 h-2.5 rounded-full bg-primary/80"
      animate={{ scale: [0.7, 1.2, 0.7], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
    />
  </span>
));
StreamingCursor.displayName = 'StreamingCursor';

/**
 * Intelligently binds verified topic photos and YouTube videos directly under specific
 * analytical sub-topics without cluttering the document header or duplicating media.
 */
export function distributeMediaIntoMarkdown(
  rawContent: string,
  images?: Array<{
    url?: string;
    name?: string;
    engine?: string;
    data?: string;
    mimeType?: string;
    aspectRatio?: string;
  }>,
  videos?: Array<{
    url?: string;
    previewUrl?: string;
    title?: string;
    duration?: number | string;
    source?: string;
    author?: string;
    authorUrl?: string;
  }>,
  _audios?: Array<{
    url?: string;
    title?: string;
    artist?: string;
    duration?: number;
    source?: string;
    tags?: string;
    previewUrl?: string;
  }>
): string {
  if (!rawContent) return '';
  const hasImages = images && images.length > 0;
  const hasVideos = videos && videos.length > 0;
  if (!hasImages && !hasVideos) {
    return rawContent;
  }

  // Deduplicate candidate images
  const unplacedImages: Array<{ url: string; name?: string; engine?: string }> = [];
  const seenCandidateUrls = new Set<string>();

  if (images) {
    for (const img of images) {
      if (img?.url && typeof img.url === 'string' && img.url.startsWith('http')) {
        const cleanUrl = img.url.toLowerCase().trim();
        if (!seenCandidateUrls.has(cleanUrl)) {
          seenCandidateUrls.add(cleanUrl);
          unplacedImages.push({
            url: img.url,
            name: img.name,
            engine: img.engine,
          });
        }
      }
    }
  }

  // Deduplicate candidate videos
  const unplacedVideos: Array<{ url: string; title?: string; author?: string }> = [];
  if (videos) {
    for (const vid of videos) {
      if (vid?.url && typeof vid.url === 'string' && vid.url.startsWith('http')) {
        const cleanUrl = vid.url.toLowerCase().trim();
        if (!seenCandidateUrls.has(cleanUrl)) {
          seenCandidateUrls.add(cleanUrl);
          unplacedVideos.push({
            url: vid.url,
            title: vid.title,
            author: vid.author,
          });
        }
      }
    }
  }

  // Check if content already contains working markdown images / youtube videos
  const embeddedUrls = new Set<string>();
  const imgRegex = /!\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
  let match;
  while ((match = imgRegex.exec(rawContent)) !== null) {
    embeddedUrls.add(match[1].toLowerCase().trim());
  }
  const linkRegex = /\[.*?\]\((https?:\/\/[^\s\)]+)\)/g;
  while ((match = linkRegex.exec(rawContent)) !== null) {
    embeddedUrls.add(match[1].toLowerCase().trim());
  }

  // Filter out items already in markdown
  const remainingImages = unplacedImages.filter(
    (img) => !embeddedUrls.has(img.url.toLowerCase().trim())
  );
  const remainingVideos = unplacedVideos.filter(
    (vid) => !embeddedUrls.has(vid.url.toLowerCase().trim())
  );

  if (remainingImages.length === 0 && remainingVideos.length === 0) {
    return rawContent;
  }

  // Split by markdown headings (#, ##, ###, ####)
  const headerRegex = /^(#{1,4}\s+.+)$/gm;
  const parts = rawContent.split(headerRegex);

  if (parts.length > 1) {
    const headingIndices: number[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (/^#{1,4}\s+/.test(parts[i].trim())) {
        headingIndices.push(i);
      }
    }

    if (headingIndices.length >= 2) {
      const assignedMedia = new Map<number, string>();

      // Place 1st image at 2nd heading
      if (remainingImages.length >= 1 && headingIndices.length >= 2) {
        const img = remainingImages[0];
        assignedMedia.set(
          headingIndices[1],
          `\n\n![${img.name || 'Visual Reference'}](${img.url})\n\n`
        );
      }

      // Place video at 3rd or 4th heading
      if (remainingVideos.length >= 1) {
        const vidTargetIdx = headingIndices.length >= 3 ? headingIndices[2] : headingIndices[1];
        const vid = remainingVideos[0];
        const existing = assignedMedia.get(vidTargetIdx) || '';
        assignedMedia.set(
          vidTargetIdx,
          `${existing}\n\n[YouTube Video: ${vid.title || 'Video Demonstration'}](${vid.url})\n\n`
        );
      } else if (remainingImages.length >= 2 && headingIndices.length >= 4) {
        const img = remainingImages[1];
        assignedMedia.set(
          headingIndices[3],
          `\n\n![${img.name || 'Visual Reference'}](${img.url})\n\n`
        );
      }

      const result: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        result.push(parts[i]);
        if (assignedMedia.has(i)) {
          result.push(assignedMedia.get(i)!);
        }
      }
      return result.join('');
    } else if (headingIndices.length === 1) {
      const hIdx = headingIndices[0];
      const result: string[] = [];
      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        if (i === hIdx + 1) {
          const paras = part.split(/\n\n+/);
          let insertion = '';
          if (remainingImages.length > 0) {
            insertion += `\n\n![${remainingImages[0].name || 'Visual Reference'}](${remainingImages[0].url})\n\n`;
          }
          if (remainingVideos.length > 0) {
            insertion += `\n\n[YouTube Video: ${remainingVideos[0].title || 'Video Demonstration'}](${remainingVideos[0].url})\n\n`;
          }
          if (paras.length >= 2) {
            result.push(`${paras[0]}${insertion}${paras.slice(1).join('\n\n')}`);
          } else {
            result.push(`${part}${insertion}`);
          }
        } else {
          result.push(part);
        }
      }
      return result.join('');
    }
  }

  // If no headings exist, place after the first paragraph
  const paragraphs = rawContent.split(/\n\n+/);
  let mediaBlock = '';
  if (remainingImages.length > 0) {
    mediaBlock += `\n\n![${remainingImages[0].name || 'Visual Reference'}](${remainingImages[0].url})\n\n`;
  }
  if (remainingVideos.length > 0) {
    mediaBlock += `\n\n[YouTube Video: ${remainingVideos[0].title || 'Video Demonstration'}](${remainingVideos[0].url})\n\n`;
  }

  if (paragraphs.length >= 2) {
    const firstPara = paragraphs[0];
    const rest = paragraphs.slice(1).join('\n\n');
    return `${firstPara}${mediaBlock}${rest}`;
  }

  return `${rawContent}${mediaBlock}`;
}
