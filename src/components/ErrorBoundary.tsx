import React, { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error?: Error;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught component error:', error, errorInfo);
  }

  public render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="h-full flex flex-col items-center justify-center p-8 bg-card border border-destructive/20 rounded-[24px] shadow-xl">
          <AlertCircle size={32} className="text-destructive mb-4" />
          <h2 className="text-xs font-bold text-foreground tracking-widest uppercase mb-2">Error</h2>
          <p className="text-[9px] text-muted-foreground font-bold text-center max-w-[250px] leading-relaxed">
            {this.state.error?.message || "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: undefined })}
            className="mt-6 px-6 py-2 bg-primary text-primary-foreground hover:opacity-90 rounded-full text-[9px] font-bold uppercase tracking-widest transition-all active:scale-95 shadow-lg shadow-primary/20"
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
