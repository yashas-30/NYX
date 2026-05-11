import React from 'react';
import { THEME } from './theme';

/**
 * LLM LAB - Custom Icons & Logos
 */

export const Logo = ({ size = 24, className = "" }: { size?: number; className?: string }) => (
  <svg 
    width={size} 
    height={size} 
    viewBox="0 0 24 24" 
    fill="none" 
    xmlns="http://www.w3.org/2000/svg"
    className={className}
  >
    {/* Abstract SF Symbol style Node */}
    <rect x="3" y="3" width="18" height="18" rx="5" stroke="currentColor" strokeWidth="1.8" />
    <path 
      d="M7 12H17" 
      stroke="currentColor" 
      strokeWidth="1.8" 
      strokeLinecap="round" 
    />
    <path 
      d="M12 7V17" 
      stroke="currentColor" 
      strokeWidth="1.8" 
      strokeLinecap="round" 
    />
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
  </svg>
);

// Fresh versions of common icons matching SF Symbols weight
export const StudioIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
);

export const RegistryIcon = () => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
  </svg>
);

