import { useEffect, useState } from 'react';
import { AppDashboard } from '@src/features/dashboard';
import { Toaster } from 'sonner';
import { toast } from '@src/shared/components/ui/sonner';
import { useTheme } from '@src/shared/context/ThemeContext';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { DebugLogger } from '@src/core/utils/DebugLogger';
import { Providers } from './providers';
import { WindowResizeHandles } from '@src/shared/components/WindowResizeHandles';
import { useFluidScaler } from '@src/shared/hooks/useFluidScaler';

export default function App() {
  return (
    <Providers>
      <AppContent />
    </Providers>
  );
}

function AppContent() {
  useFluidScaler();
  const { theme } = useTheme();
  const privacyMode = useNyxStore((state) => state.privacyMode);
  const clearPrivacyData = useNyxStore((state) => state.clearPrivacyData);

  useEffect(() => {
    DebugLogger.init();

    // Initialize Local LLM Environment
    const initLocalLLM = async () => {
      try {
        if (typeof window !== 'undefined' && ('__TAURI__' in window || '__TAURI_INTERNALS__' in window)) {
          const { invoke } = await import('@tauri-apps/api/core');
          const { listen } = await import('@tauri-apps/api/event');
          
          let toastId: string | number | undefined;
          
          const unlisten = await listen<{ progress: number; status: string }>('llm-download-progress', (event) => {
             const { progress, status } = event.payload;
             if (!toastId && progress < 100) {
               toastId = toast.loading(`Initializing Local Intelligence: ${status}`, { duration: Infinity });
             } else if (toastId && progress < 100) {
               toast.loading(`${status} (${Math.round(progress)}%)`, { id: toastId });
             }
          });

          const unlistenComplete = await listen('llm-download-complete', () => {
             if (toastId) toast.success('Local model downloaded successfully!', { id: toastId });
             toastId = undefined;
          });

          // Ensure assets exist (downloads if missing) - run in background
          invoke('download_local_model').catch(err => {
            if (String(err).includes('already being downloaded')) {
              console.log('[App] Local LLM init skipped: download already in progress');
            } else {
              console.error('[App] Failed to init Local LLM:', err);
            }
          }).finally(() => {
            unlisten();
            unlistenComplete();
          });
        }
      } catch (err) {
        console.error('[App] Init Local LLM failed:', err);
      }
    };
    initLocalLLM();
    
    // Sync search settings to backend
    const syncSearchSettings = async () => {
      try {
        const { searchProvider, apiKeys } = useNyxStore.getState();
        const apiKey = apiKeys['tavily'] || '';
        const { invoke } = await import('@tauri-apps/api/core');
        await invoke('set_search_settings', {
          provider: searchProvider,
          apiKey: apiKey,
        });
      } catch (e) {
        console.error('Failed to sync search settings:', e);
      }
    };
    
    syncSearchSettings();
    const unsub = useNyxStore.subscribe((state, prevState) => {
      if (state.searchProvider !== prevState.searchProvider || state.apiKeys['tavily'] !== prevState.apiKeys['tavily']) {
        syncSearchSettings();
      }
    });

    if (!privacyMode) return () => unsub();

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
      unsub();
      if (timeoutId) clearTimeout(timeoutId);
      events.forEach((event) => {
        window.removeEventListener(event, resetTimer);
      });
    };
  }, [privacyMode, clearPrivacyData]);



  return (
    <div className="h-screen w-full overflow-hidden bg-background text-foreground selection:bg-primary/30 font-sans">
      <ErrorBoundary>
        {window.location.pathname.startsWith('/share/') ? (
          <SharedChatView />
        ) : (
          <AppDashboard onExit={() => {}} />
        )}
      </ErrorBoundary>
      <WindowResizeHandles />

      {/* 
      User requested to disable all toast popups app-wide
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
      */}
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

    import('@tauri-apps/api/core').then(({ invoke }) => {
      invoke('db_get_shared_conversation', { shareId })
        .then((d: any) => {
          if (!d) throw new Error('Shared conversation not found or expired');
          setData(d);
        })
        .catch((e: any) => setError(e.message || String(e)));
    });
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
    <div className="h-screen flex flex-col bg-background text-foreground w-full max-w-screen-2xl mx-auto border-x border-border">
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
