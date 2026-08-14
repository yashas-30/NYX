// src/features/hf-explorer/components/HfAuthorAvatar.tsx
import React, { useState, useEffect } from 'react';

interface HfAuthorAvatarProps {
  creator: string;
  avatarUrl?: string;
  size?: number; // Size in px
}

// Known mapping from HuggingFace org name to GitHub org handle for 100% reliable avatar loading
const GITHUB_ORG_MAP: Record<string, string> = {
  'google': 'google',
  'meta-llama': 'meta-llama',
  'meta': 'meta-llama',
  'microsoft': 'microsoft',
  'mistralai': 'mistralai',
  'qwen': 'QwenLM',
  'qwen-lm': 'QwenLM',
  'nvidia': 'NVIDIA',
  'deepseek-ai': 'deepseek-ai',
  'cohere': 'cohere-ai',
  'stabilityai': 'Stability-AI',
  'nousresearch': 'NousResearch',
  'huggingfaceh4': 'huggingface',
  'huggingface': 'huggingface',
  'apple': 'apple',
  'xai-org': 'xai-org',
  '01-ai': '01-ai',
  'allenai': 'allenai',
  'tiiuae': 'tiiuae',
  'internlm': 'InternLM',
  'unsloth': 'unslothai',
  'lmstudio-community': 'lmstudio-ai',
  'bartowski': 'bartowski',
  'thebloke': 'TheBloke',
  'city96': 'city96',
  'mradermacher': 'mradermacher',
  'quantfactory': 'QuantFactory',
};

export function HfAuthorAvatar({ creator, avatarUrl, size = 40 }: HfAuthorAvatarProps) {
  const lower = (creator || 'community').toLowerCase().trim();
  const ghUser = GITHUB_ORG_MAP[lower] || creator.trim();

  // Determine avatar image URLs to try in order
  const urlsToTry = React.useMemo(() => {
    const urls: string[] = [];
    if (avatarUrl) {
      const fullHfUrl = avatarUrl.startsWith('http') ? avatarUrl : `https://huggingface.co${avatarUrl}`;
      urls.push(fullHfUrl);
    }
    // GitHub avatar URL (extremely reliable for HF creators)
    urls.push(`https://github.com/${ghUser}.png?size=${size * 2}`);
    // Unavatar service fallback
    urls.push(`https://unavatar.io/github/${ghUser}`);
    return urls;
  }, [avatarUrl, ghUser, size]);

  const [urlIndex, setUrlIndex] = useState(0);
  const [hasFailed, setHasFailed] = useState(false);

  // Reset when creator or avatarUrl changes
  useEffect(() => {
    setUrlIndex(0);
    setHasFailed(false);
  }, [creator, avatarUrl]);

  const handleError = () => {
    if (urlIndex < urlsToTry.length - 1) {
      setUrlIndex(prev => prev + 1);
    } else {
      setHasFailed(true);
    }
  };

  // Plain initials fallback
  const initials = creator
    .replace(/[-_]/g, ' ')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(w => w[0].toUpperCase())
    .join('') || creator.slice(0, 2).toUpperCase();

  const currentSrc = urlsToTry[urlIndex];

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: size > 48 ? 14 : 8,
        overflow: 'hidden',
        flexShrink: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: '#27272a',
        border: '1px solid #3f3f46',
      }}
      title={creator}
    >
      {!hasFailed && currentSrc ? (
        <img
          key={currentSrc}
          src={currentSrc}
          alt={creator}
          onError={handleError}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          loading="lazy"
        />
      ) : (
        <span
          style={{
            color: '#f4f4f5',
            fontSize: size * 0.36,
            fontWeight: 700,
            fontFamily: 'sans-serif',
            userSelect: 'none',
          }}
        >
          {initials}
        </span>
      )}
    </div>
  );
}
