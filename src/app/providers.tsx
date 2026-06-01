/**
 * @file src/app/providers.tsx
 * @description Root context provider composition.
 */

import React from 'react';
import { ThemeProvider } from '@src/shared/context/ThemeContext';
import { TokenUsageProvider } from '@src/shared/context/TokenUsageContext';

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <TokenUsageProvider>{children}</TokenUsageProvider>
    </ThemeProvider>
  );
}
