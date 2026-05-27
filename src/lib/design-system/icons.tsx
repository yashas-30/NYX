import React from 'react';

/**
 * NYX - Custom Icons & Logos
 */

export const Logo = React.memo(({ size = 24, className = "" }: { size?: number; className?: string }) => {
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
      <path
        d="M20 80C35 50 65 35 85 20C75 40 50 65 20 80Z"
        fill="url(#goldGradient)"
      />
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
        <linearGradient id="goldGradient" x1="20" y1="80" x2="85" y2="20" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#D97706" />
          <stop offset="50%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#FBBF24" />
        </linearGradient>
        <linearGradient id="goldGradientLight" x1="30" y1="70" x2="80" y2="25" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="100%" stopColor="#FFFBEB" />
        </linearGradient>
      </defs>
    </svg>
  );
});

Logo.displayName = 'Logo';

// Fresh versions of common icons matching SF Symbols weight
export const StudioIcon = React.memo(() => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="3" width="18" height="18" rx="4" />
    <path d="M3 9h18" />
    <path d="M9 21V9" />
  </svg>
));

StudioIcon.displayName = 'StudioIcon';

export const RegistryIcon = React.memo(() => (
  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
    <ellipse cx="12" cy="5" rx="9" ry="3" />
    <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" />
    <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3" />
  </svg>
));

RegistryIcon.displayName = 'RegistryIcon';

export const NyxLoader = React.memo(({ size = 28, className = "" }: { size?: number; className?: string }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-13 -13 45 45"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      xmlSpace="preserve"
    >
      <style dangerouslySetInnerHTML={{ __html: `
        .box5631 {
          transform-origin: 50% 50%;
          fill: currentColor;
        }

        @keyframes moveBox5631-1 {
          9.0909090909% {
            transform: translate(-12px, 0);
          }

          18.1818181818% {
            transform: translate(0px, 0);
          }

          27.2727272727% {
            transform: translate(0px, 0);
          }

          36.3636363636% {
            transform: translate(12px, 0);
          }

          45.4545454545% {
            transform: translate(12px, 12px);
          }

          54.5454545455% {
            transform: translate(12px, 12px);
          }

          63.6363636364% {
            transform: translate(12px, 12px);
          }

          72.7272727273% {
            transform: translate(12px, 0px);
          }

          81.8181818182% {
            transform: translate(0px, 0px);
          }

          90.9090909091% {
            transform: translate(-12px, 0px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(1) {
          animation: moveBox5631-1 4s infinite;
        }

        @keyframes moveBox5631-2 {
          9.0909090909% {
            transform: translate(0, 0);
          }

          18.1818181818% {
            transform: translate(12px, 0);
          }

          27.2727272727% {
            transform: translate(0px, 0);
          }

          36.3636363636% {
            transform: translate(12px, 0);
          }

          45.4545454545% {
            transform: translate(12px, 12px);
          }

          54.5454545455% {
            transform: translate(12px, 12px);
          }

          63.6363636364% {
            transform: translate(12px, 12px);
          }

          72.7272727273% {
            transform: translate(12px, 12px);
          }

          81.8181818182% {
            transform: translate(0px, 12px);
          }

          90.9090909091% {
            transform: translate(0px, 12px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(2) {
          animation: moveBox5631-2 4s infinite;
        }

        @keyframes moveBox5631-3 {
          9.0909090909% {
            transform: translate(-12px, 0);
          }

          18.1818181818% {
            transform: translate(-12px, 0);
          }

          27.2727272727% {
            transform: translate(0px, 0);
          }

          36.3636363636% {
            transform: translate(-12px, 0);
          }

          45.4545454545% {
            transform: translate(-12px, 0);
          }

          54.5454545455% {
            transform: translate(-12px, 0);
          }

          63.6363636364% {
            transform: translate(-12px, 0);
          }

          72.7272727273% {
            transform: translate(-12px, 0);
          }

          81.8181818182% {
            transform: translate(-12px, -12px);
          }

          90.9090909091% {
            transform: translate(0px, -12px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(3) {
          animation: moveBox5631-3 4s infinite;
        }

        @keyframes moveBox5631-4 {
          9.0909090909% {
            transform: translate(-12px, 0);
          }

          18.1818181818% {
            transform: translate(-12px, 0);
          }

          27.2727272727% {
            transform: translate(-12px, -12px);
          }

          36.3636363636% {
            transform: translate(0px, -12px);
          }

          45.4545454545% {
            transform: translate(0px, 0px);
          }

          54.5454545455% {
            transform: translate(0px, -12px);
          }

          63.6363636364% {
            transform: translate(0px, -12px);
          }

          72.7272727273% {
            transform: translate(0px, -12px);
          }

          81.8181818182% {
            transform: translate(-12px, -12px);
          }

          90.9090909091% {
            transform: translate(-12px, 0px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(4) {
          animation: moveBox5631-4 4s infinite;
        }

        @keyframes moveBox5631-5 {
          9.0909090909% {
            transform: translate(0, 0);
          }

          18.1818181818% {
            transform: translate(0, 0);
          }

          27.2727272727% {
            transform: translate(0, 0);
          }

          36.3636363636% {
            transform: translate(12px, 0);
          }

          45.4545454545% {
            transform: translate(12px, 0);
          }

          54.5454545455% {
            transform: translate(12px, 0);
          }

          63.6363636364% {
            transform: translate(12px, 0);
          }

          72.7272727273% {
            transform: translate(12px, 0);
          }

          81.8181818182% {
            transform: translate(12px, -12px);
          }

          90.9090909091% {
            transform: translate(0px, -12px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(5) {
          animation: moveBox5631-5 4s infinite;
        }

        @keyframes moveBox5631-6 {
          9.0909090909% {
            transform: translate(0, 0);
          }

          18.1818181818% {
            transform: translate(-12px, 0);
          }

          27.2727272727% {
            transform: translate(-12px, 0);
          }

          36.3636363636% {
            transform: translate(0px, 0);
          }

          45.4545454545% {
            transform: translate(0px, 0);
          }

          54.5454545455% {
            transform: translate(0px, 0);
          }

          63.6363636364% {
            transform: translate(0px, 0);
          }

          72.7272727273% {
            transform: translate(0px, 12px);
          }

          81.8181818182% {
            transform: translate(-12px, 12px);
          }

          90.9090909091% {
            transform: translate(-12px, 0px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(6) {
          animation: moveBox5631-6 4s infinite;
        }

        @keyframes moveBox5631-7 {
          9.0909090909% {
            transform: translate(12px, 0);
          }

          18.1818181818% {
            transform: translate(12px, 0);
          }

          27.2727272727% {
            transform: translate(12px, 0);
          }

          36.3636363636% {
            transform: translate(0px, 0);
          }

          45.4545454545% {
            transform: translate(0px, -12px);
          }

          54.5454545455% {
            transform: translate(12px, -12px);
          }

          63.6363636364% {
            transform: translate(0px, -12px);
          }

          72.7272727273% {
            transform: translate(0px, -12px);
          }

          81.8181818182% {
            transform: translate(0px, 0px);
          }

          90.9090909091% {
            transform: translate(12px, 0px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(7) {
          animation: moveBox5631-7 4s infinite;
        }

        @keyframes moveBox5631-8 {
          9.0909090909% {
            transform: translate(0, 0);
          }

          18.1818181818% {
            transform: translate(-12px, 0);
          }

          27.2727272727% {
            transform: translate(-12px, -12px);
          }

          36.3636363636% {
            transform: translate(0px, -12px);
          }

          45.4545454545% {
            transform: translate(0px, -12px);
          }

          54.5454545455% {
            transform: translate(0px, -12px);
          }

          63.6363636364% {
            transform: translate(0px, -12px);
          }

          72.7272727273% {
            transform: translate(0px, -12px);
          }

          81.8181818182% {
            transform: translate(12px, -12px);
          }

          90.9090909091% {
            transform: translate(12px, 0px);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(8) {
          animation: moveBox5631-8 4s infinite;
        }

        @keyframes moveBox5631-9 {
          9.0909090909% {
            transform: translate(-12px, 0);
          }

          18.1818181818% {
            transform: translate(-12px, 0);
          }

          27.2727272727% {
            transform: translate(0px, 0);
          }

          36.3636363636% {
            transform: translate(-12px, 0);
          }

          45.4545454545% {
            transform: translate(0px, 0);
          }

          54.5454545455% {
            transform: translate(0px, 0);
          }

          63.6363636364% {
            transform: translate(-12px, 0);
          }

          72.7272727273% {
            transform: translate(-12px, 0);
          }

          81.8181818182% {
            transform: translate(-24px, 0);
          }

          90.9090909091% {
            transform: translate(-12px, 0);
          }

          100% {
            transform: translate(0px, 0px);
          }
        }

        .box5631:nth-child(9) {
          animation: moveBox5631-9 4s infinite;
        }
      ` }} />
      <g>
        <circle className="box5631" cx="13" cy="1" r="5" />
        <circle className="box5631" cx="13" cy="1" r="5" />
        <circle className="box5631" cx="25" cy="25" r="5" />
        <circle className="box5631" cx="13" cy="13" r="5" />
        <circle className="box5631" cx="13" cy="13" r="5" />
        <circle className="box5631" cx="25" cy="13" r="5" />
        <circle className="box5631" cx="1" cy="25" r="5" />
        <circle className="box5631" cx="13" cy="25" r="5" />
        <circle className="box5631" cx="25" cy="25" r="5" />
      </g>
    </svg>
  );
});

NyxLoader.displayName = 'NyxLoader';
