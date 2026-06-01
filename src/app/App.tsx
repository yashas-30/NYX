import { useEffect } from 'react';
import { CoderDashboard } from '@src/features/dashboard';
import { Toaster } from 'sonner';
import { toast } from '@src/shared/components/ui/sonner';
import { useTheme } from '@src/shared/context/ThemeContext';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { DebugLogger } from '@src/core/utils/DebugLogger';
import { Providers } from './providers';

export default function App() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}

function AppContent() {
  const { theme } = useTheme();
  const privacyMode = useNyxStore((state) => state.privacyMode);
  const clearPrivacyData = useNyxStore((state) => state.clearPrivacyData);

  useEffect(() => {
    DebugLogger.init();
    if (!privacyMode) return;

    let timeoutId: NodeJS.Timeout;

    const resetTimer = () => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(
        () => {
          clearPrivacyData();
          window.dispatchEvent(new Event('nyx:privacy-inactivity-wipe'));
          toast.error(
            'Session auto-destructed due to 5 minutes of inactivity. Ephemeral keys and private history have been wiped.',
            {
              duration: 8000,
            }
          );
        },
        5 * 60 * 1000
      ); // 5 minutes
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'mousedown', 'touchstart'];

    events.forEach((event) => {
      window.addEventListener(event, resetTimer);
    });

    // Initialize timer
    resetTimer();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [privacyMode, clearPrivacyData]);

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
      <ErrorBoundary>
        <CoderDashboard onExit={() => {}} />
      </ErrorBoundary>

      <Toaster
        position="bottom-right"
        theme={theme}
        expand={false}
        richColors
        closeButton
        toastOptions={{
          style: {
            background: 'var(--card)',
            backdropFilter: 'blur(20px)',
            border: '1px solid var(--border)',
            borderRadius: '8px',
            fontSize: '10px',
            fontWeight: '900',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            color: 'var(--foreground)',
          },
        }}
      />
    </div>
  );
}
