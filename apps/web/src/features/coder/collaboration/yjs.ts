/**
 * Collaboration stub — real-time YJS collaboration.
 * Provides a no-op implementation so CodeEditor loads without a YJS server.
 */

interface CollaborationHandle {
  ydoc: { destroy: () => void };
  provider: { destroy: () => void };
}

const noop = () => {};

export function initCollaboration(_roomName: string): CollaborationHandle {
  // No-op until a collaboration server is configured
  return {
    ydoc: { destroy: noop },
    provider: { destroy: noop },
  };
}
