import { CoderDashboard } from '@src/features/dashboard';
import { Toaster } from 'sonner';
import { useTheme } from '@src/shared/context/ThemeContext';
import { ErrorBoundary } from '@src/shared/components/ErrorBoundary';
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
            color: 'var(--foreground)'
          }
        }}
      />
    </div>
  );
}
