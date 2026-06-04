/**
 * @file src/app/providers.tsx
 * @description Root context provider composition.
 */

import React, { useState } from 'react';
import { BrowserRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from '@src/shared/context/ThemeContext';
import { TokenUsageProvider } from '@src/shared/context/TokenUsageContext';

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            refetchOnWindowFocus: false,
            retry: false,
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ThemeProvider>
          <TokenUsageProvider>{children}</TokenUsageProvider>
        </ThemeProvider>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
