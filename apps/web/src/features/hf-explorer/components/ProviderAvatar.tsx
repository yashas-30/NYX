// src/features/hf-explorer/components/ProviderAvatar.tsx
import { useState, useCallback } from 'react';
import { PROVIDER_META } from '../constants/providers';
import { hashColor, getInitials } from '../lib/utils';

interface ProviderAvatarProps {
  creator: string;
  avatarUrl?: string;
  size?: 'sm' | 'md' | 'lg';
}

export function ProviderAvatar({ creator, avatarUrl: customAvatarUrl, size = 'sm' }: ProviderAvatarProps) {
  const [imageError, setImageError] = useState(false);
  const [stage, setStage] = useState(0);

  const meta = PROVIDER_META[creator] ?? PROVIDER_META[creator.toLowerCase()];
  const [from, to] = meta ? [meta.from, meta.to] : hashColor(creator);
  const short = meta?.short ?? getInitials(creator);
  const textColor = meta?.text ?? '#fff';
  const ring = meta?.ring;

  const sizeClasses = {
    lg: 'w-12 h-12 rounded-2xl text-[13px] font-black shadow-lg',
    md: 'w-9 h-9 rounded-xl text-[11px] font-black shadow-md',
    sm: 'w-[22px] h-[22px] rounded-[7px] text-[8px] font-black shadow-sm',
  };

  const githubUser = meta?.github ?? creator;
  const initialUrl = customAvatarUrl
    ? (customAvatarUrl.startsWith('http') ? customAvatarUrl : `https://huggingface.co${customAvatarUrl}`)
    : `https://huggingface.co/${creator}.png?size=${size === 'lg' ? 96 : size === 'md' ? 72 : 44}`;

  const [currentUrl, setCurrentUrl] = useState(initialUrl);

  const handleError = useCallback(() => {
    if (stage === 0) {
      setStage(1);
      setCurrentUrl(`https://huggingface.co/${creator}.png?size=80`);
    } else if (stage === 1) {
      setStage(2);
      setCurrentUrl(`https://github.com/${githubUser}.png?size=${size === 'lg' ? 96 : size === 'md' ? 72 : 44}`);
    } else {
      setImageError(true);
    }
  }, [stage, creator, githubUser, size]);

  return (
    <div
      className={`${sizeClasses[size]} shrink-0 flex items-center justify-center relative select-none overflow-hidden`}
      style={{
        background: `linear-gradient(145deg, ${from}, ${to})`,
        boxShadow: ring ? `0 0 0 1.5px ${ring}, 0 3px 10px ${ring}` : undefined,
      }}
      title={meta?.fullName ?? creator}
    >
      {!imageError ? (
        <img
          src={currentUrl}
          alt={creator}
          onError={handleError}
          className="w-full h-full object-cover"
          loading="lazy"
        />
      ) : (
        <span
          style={{
            color: textColor,
            letterSpacing: short.length > 2 ? '-0.05em' : '0',
            lineHeight: 1,
          }}
        >
          {short}
        </span>
      )}

      {meta?.isQuantizer && (
        <div
          className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-400 border-[1.5px] border-background z-10"
          title="Community Quantizer"
        />
      )}
    </div>
  );
}
