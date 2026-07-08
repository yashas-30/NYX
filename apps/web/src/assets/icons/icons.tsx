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
        {/* Sleek, sophisticated gold vector swift bird */}
        <path d="M20 80C35 50 65 35 85 20C75 40 50 65 20 80Z" fill="url(#goldGradient)" />
        <path
          d="M30 70C45 48 68 38 80 25C72 41 52 58 30 70Z"
          fill="url(#goldGradientLight)"
          opacity="0.8"
        />
        <path
          d="M45 80C50 68 62 55 75 45C68 55 58 68 45 80Z"
          fill="url(#goldGradient)"
          opacity="0.6"
        />
        <defs>
          <linearGradient
            id="goldGradient"
            x1="20"
            y1="80"
            x2="85"
            y2="20"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#D97706" />
            <stop offset="50%" stopColor="#cc785c" />
            <stop offset="100%" stopColor="#FBBF24" />
          </linearGradient>
          <linearGradient
            id="goldGradientLight"
            x1="30"
            y1="70"
            x2="80"
            y2="25"
            gradientUnits="userSpaceOnUse"
          >
            <stop offset="0%" stopColor="#cc785c" />
            <stop offset="100%" stopColor="#FFFBEB" />
          </linearGradient>
        </defs>
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

