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
            // Smart retry: up to 3 times for server/network errors, never for client errors (4xx)
            retry: (failureCount, error: any) => {
              const status = error?.response?.status ?? error?.status;
              // Never retry client errors — they won't fix themselves
              if (status && status >= 400 && status < 500) return false;
              return failureCount < 3;
            },
            retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 10_000),
            // Cache for 30s so rapid navigation doesn't re-fetch
            staleTime: 30_000,
          },
          mutations: {
            retry: false, // Mutations should never auto-retry
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
