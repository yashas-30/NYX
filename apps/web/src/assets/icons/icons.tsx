import React from 'react';

// Removed lottiefiles dependency

/**
 * NYX - Custom Icons & Logos
 */

export const Logo = React.memo(
  ({ size = 24, className = '' }: { size?: number; className?: string }) => {
    return (
      <svg
        width={size}
        height={size}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className={className}
      >
        <rect width="100" height="100" rx="22" fill="transparent" />
        <g transform="translate(50, 52)" textAnchor="middle" dominantBaseline="central">
          <text fontFamily="Georgia, serif" fontWeight="bold" fontSize="42" letterSpacing="-1">
            <tspan fill="#3B82F6">NY</tspan>
            <tspan fill="#60A5FA">X</tspan>
          </text>
        </g>
      </svg>
    );
  }
);

Logo.displayName = 'Logo';

// Fresh versions of common icons matching SF Symbols weight
export const StudioIcon = React.memo(() => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
));

StudioIcon.displayName = 'StudioIcon';

export const RegistryIcon = React.memo(() => (
  <svg
    width="20"
    height="20"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.5"
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
  </svg>
));

RegistryIcon.displayName = 'RegistryIcon';

export const NyxLoader = React.memo(
  ({ size = 28, className = '' }: { size?: number; className?: string }) => {
    return (
      <div
        style={{ width: size, height: size }}
        className={`animate-spin rounded-full border-2 border-primary border-t-transparent ${className} shrink-0`}
      />
    );
  }
);
NyxLoader.displayName = 'NyxLoader';

export const CatLoader = React.memo(
  ({ size = 28, className = '' }: { size?: number; className?: string }) => {
    return (
      <div
        style={{ width: size, height: size }}
        className={`animate-pulse rounded-full border-2 border-primary/50 bg-primary/20 ${className} shrink-0`}
      />
    );
  }
);
CatLoader.displayName = 'CatLoader';

export const AnimatedLogo = React.memo(
  ({ size = 28, className = '' }: { size?: number; className?: string }) => {
    return <Logo size={size} className={`animate-pulse ${className}`} />;
  }
);
AnimatedLogo.displayName = 'AnimatedLogo';

