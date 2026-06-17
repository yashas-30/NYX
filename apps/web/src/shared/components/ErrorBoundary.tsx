import React, { Component, ReactNode } from 'react';
import { AlertCircle } from 'lucide-react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  name?: string;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = { hasError: false, error: null };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error(`[ErrorBoundary:${this.props.name ?? 'unknown'}]`, error, info);
  }

  public override render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div
            style={{
              padding: '2rem',
              color: 'var(--color-text-secondary)',
              fontFamily: 'var(--font-mono)',
              fontSize: '13px',
              border: '1px dashed #ef4444',
              borderRadius: '6px',
              margin: '1rem 0',
              background: 'rgba(239, 68, 68, 0.05)',
            }}
          >
            <p style={{ color: '#ef4444', marginBottom: '0.5rem', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <AlertCircle size={14} style={{ flexShrink: 0 }} /> Something went wrong in {this.props.name ?? 'this component'}.
            </p>
            <pre
              style={{
                opacity: 0.8,
                fontSize: '11px',
                whiteSpace: 'pre-wrap',
                background: 'rgba(0, 0, 0, 0.2)',
                padding: '1rem',
                borderRadius: '4px',
                overflow: 'auto',
                marginBottom: '1rem',
              }}
            >
              {this.state.error?.message}
            </pre>
            <button
              style={{
                padding: '4px 12px',
                fontSize: '12px',
                color: '#fff',
                background: '#ef4444',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
              onClick={() => this.setState({ hasError: false, error: null })}
            >
              Retry
            </button>
          </div>
        )
      );
    }
    return this.props.children;
  }
}
