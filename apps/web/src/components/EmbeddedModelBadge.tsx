/**
 * EmbeddedModelBadge
 *
 * Compact status badge for the embedded Qwen 2.5 sidecar.
 * Shows: ready (green pulse) | downloading (progress bar) | missing (download button) | failed (error)
 *
 * Designed to sit in the sidebar or settings header.
 */
import React, { useEffect } from 'react';
import { useEmbeddedModelStore } from '@src/shared/store/useEmbeddedModelStore';

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(0)} MB`;
}

export function EmbeddedModelBadge() {
  const { state, error, download, stats, modelName, init, startDownload, cleanup } =
    useEmbeddedModelStore();

  useEffect(() => {
    init();
    return () => cleanup();
  }, []);

  if (state === 'ready') {
    return (
      <div className="embedded-badge embedded-badge--ready" title="Embedded Qwen 2.5 1.5B is active">
        <span className="embedded-badge__dot" />
        <span className="embedded-badge__label">NYX Local AI — Ready</span>
        {stats && stats.training_examples > 0 && (
          <div style={{ display: 'flex', gap: '4px' }}>
            <span className="embedded-badge__stats" title={`Learned from ${stats.training_examples} interactions`}>
              🧠 {stats.training_examples}
            </span>
            <button 
              className="embedded-badge__btn"
              onClick={() => {
                useEmbeddedModelStore.getState().triggerFinetune();
              }}
              title="Consume training data to Fine-tune the model"
              style={{ fontSize: '10px', padding: '2px 6px' }}
            >
              Fine-tune
            </button>
          </div>
        )}
      </div>
    );
  }

  if (state === 'starting') {
    return (
      <div className="embedded-badge embedded-badge--starting" title="Loading model into memory...">
        <span className="embedded-badge__spinner" />
        <span className="embedded-badge__label">NYX Local AI — Starting…</span>
      </div>
    );
  }

  if (state === 'downloading' && download) {
    const pct = download.percent;
    const done = formatBytes(download.bytes_done);
    const total = download.total_bytes > 0 ? formatBytes(download.total_bytes) : '?';
    return (
      <div className="embedded-badge embedded-badge--downloading">
        <div className="embedded-badge__bar-track">
          <div className="embedded-badge__bar-fill" style={{ width: `${pct}%` }} />
        </div>
        <span className="embedded-badge__label">
          Downloading Qwen 2.5 1.5B — {pct}% ({done} / {total})
        </span>
      </div>
    );
  }

  if (state === 'model_missing') {
    return (
      <div className="embedded-badge embedded-badge--missing">
        <span className="embedded-badge__label">NYX Local AI — Not installed</span>
        <button
          className="embedded-badge__btn"
          onClick={startDownload}
          title="Download Qwen2.5-1.5B (1.1 GB) for free offline inference"
        >
          ↓ Download (1.1 GB)
        </button>
      </div>
    );
  }

  if (state === 'failed') {
    return (
      <div
        className="embedded-badge embedded-badge--failed"
        title={error ?? 'Embedded model failed to start'}
      >
        <span className="embedded-badge__label">NYX Local AI — Error</span>
        <button className="embedded-badge__btn" onClick={startDownload}>
          Retry
        </button>
      </div>
    );
  }

  // not_started — waiting for init
  return (
    <div className="embedded-badge embedded-badge--idle">
      <span className="embedded-badge__spinner" />
      <span className="embedded-badge__label">NYX Local AI — Checking…</span>
    </div>
  );
}
