import { useEffect, useRef, useCallback, useState } from 'react';
import { useAppStore } from '@src/stores/useAppStore';

export type WebSocketNamespace = 'ai' | 'downloads' | 'terminal' | '';

interface UseWebSocketOptions {
  namespace?: WebSocketNamespace;
  autoConnect?: boolean;
  authToken?: string;
}

interface UseWebSocketReturn {
  socket: any | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (data: any) => void) => () => void;
  off: (event: string, handler?: (data: any) => void) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const [isConnected, setIsConnected] = useState(false);

  const connect = useCallback(() => {}, []);
  const disconnect = useCallback(() => {}, []);
  const emit = useCallback(() => {}, []);
  const on = useCallback(() => () => {}, []);
  const off = useCallback(() => {}, []);

  return {
    socket: null,
    isConnected,
    connect,
    disconnect,
    emit,
    on,
    off,
  };
}

export function useAIWebSocket() {
  return useWebSocket({ namespace: 'ai' });
}

export function useDownloadWebSocket() {
  return useWebSocket({ namespace: 'downloads' });
}

export function useTerminalWebSocket(options?: { autoConnect?: boolean }) {
  return useWebSocket({ namespace: 'terminal', ...options });
}
