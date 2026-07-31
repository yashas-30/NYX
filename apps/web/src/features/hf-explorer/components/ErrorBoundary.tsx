// src/features/hf-explorer/components/ErrorBoundary.tsx
import React, { Component, type ReactNode } from 'react';
import { Warning } from '@phosphor-icons/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('HF Explorer Error:', error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-col items-center justify-center py-12 text-center px-4">
            <Warning size={24} className="text-red-400 mb-3" />
            <p className="text-sm font-bold text-foreground/70">Something went wrong</p>
            <p className="text-xs text-muted-foreground/50 mt-1 max-w-xs">
              {this.state.error?.message ?? 'An unexpected error occurred.'}
            </p>
            <button
              onClick={() => this.setState({ hasError: false, error: null })}
              className="mt-3 text-xs font-semibold text-primary hover:text-primary/80 transition-colors"
            >
              Try again
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
