interface TelemetryMetrics {
  tokens: number;
  tps: number;
  latency: number;
}

// Icons placeholders for missing imports
const ZapIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
  </svg>
);

const ClockIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const ActivityIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
  </svg>
);

export function StreamingIndicator() {
  return (
    <div className="flex items-center gap-1.5 py-2">
      <span className="text-sm text-text-muted">Thinking</span>
      <div className="flex gap-0.5">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="w-1.5 h-1.5 rounded-md bg-primary nyx-dot"
            style={{ animationDelay: `${i * 150}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

// Add streaming progress visualization
export function StreamingProgress({ tokens, tps, latency }: TelemetryMetrics) {
  return (
    <div className="flex items-center gap-4 text-xs text-text-subtle py-1">
      <span className="flex items-center gap-1">
        <ZapIcon className="w-3 h-3" />
        {tokens.toLocaleString()} tokens
      </span>
      <span className="flex items-center gap-1">
        <ClockIcon className="w-3 h-3" />
        {(latency / 1000).toFixed(1)}s
      </span>
      <span className="flex items-center gap-1">
        <ActivityIcon className="w-3 h-3" />
        {tps.toFixed(1)} t/s
      </span>
    </div>
  );
}
