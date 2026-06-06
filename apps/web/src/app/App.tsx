import { useEffect, useState } from 'react';
import { AppDashboard } from '@src/features/dashboard';
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
        {window.location.pathname.startsWith('/share/') ? (
          <SharedChatView />
        ) : (
          <AppDashboard onExit={() => {}} />
        )}
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

function SharedChatView() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const shareId = window.location.pathname.split('/').pop();
    if (!shareId) {
      setError('Invalid share URL');
      return;
    }

    fetch(`/api/v1/conversations/share/${shareId}`)
      .then((res) => {
        if (!res.ok) throw new Error('Shared conversation not found or expired');
        return res.json();
      })
      .then((d) => setData(d))
      .catch((e) => setError(e.message));
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center h-screen bg-background text-foreground flex-col gap-4">
        <h1 className="text-2xl text-red-500 font-bold">Error</h1>
        <p>{error}</p>
        <a href="/" className="text-primary hover:underline">
          Return to App
        </a>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-screen bg-background">
        <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-md animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-background text-foreground max-w-4xl mx-auto border-x border-border">
      <div className="p-4 border-b border-border flex justify-between items-center bg-card">
        <div>
          <h1 className="font-bold text-lg">{data.title || 'Shared Conversation'}</h1>
          <p className="text-xs text-muted-foreground">
            Shared on {new Date(data.sharedAt).toLocaleString()}
          </p>
        </div>
        <a
          href="/"
          className="px-4 py-2 bg-primary text-primary-foreground text-sm rounded-md font-bold hover:bg-primary/90"
        >
          Open in NYX
        </a>
      </div>
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {data.messages?.map((msg: any, i: number) => (
          <div
            key={i}
            className={`p-4 rounded-md ${msg.role === 'user' ? 'bg-primary/10 ml-12' : 'bg-muted mr-12'}`}
          >
            <div className="text-xs font-bold mb-2 uppercase opacity-50">{msg.role}</div>
            <div className="whitespace-pre-wrap text-sm">{msg.content}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
