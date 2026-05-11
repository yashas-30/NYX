import React, { useState } from 'react';
import { LandingPage } from './components/LandingPage';
import { CompareDashboard } from './components/CompareDashboard';
import { Toaster } from 'sonner';
import { useTheme } from './context/ThemeContext';
import { ErrorBoundary } from './components/ErrorBoundary';


export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const { theme } = useTheme();

  return (
    <div className="min-h-screen bg-background text-foreground selection:bg-primary/30 font-sans">
      <ErrorBoundary>
        {!isAuthenticated ? (
          <LandingPage onStart={() => setIsAuthenticated(true)} />
        ) : (
          <CompareDashboard onExit={() => setIsAuthenticated(false)} />
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
            color: 'var(--foreground)'
          }
        }}
      />
    </div>
  );
}
