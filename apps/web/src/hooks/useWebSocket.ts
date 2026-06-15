import { useEffect, useRef, useCallback, useState } from 'react';
import { io, Socket } from 'socket.io-client';
import { useAppStore } from '@src/stores/useAppStore';

export type WebSocketNamespace = 'ai' | 'downloads' | 'terminal' | '';

interface UseWebSocketOptions {
  namespace?: WebSocketNamespace;
  autoConnect?: boolean;
  authToken?: string;
}

interface UseWebSocketReturn {
  socket: Socket | null;
  isConnected: boolean;
  connect: () => void;
  disconnect: () => void;
  emit: (event: string, data: any) => void;
  on: (event: string, handler: (data: any) => void) => () => void;
  off: (event: string, handler?: (data: any) => void) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}): UseWebSocketReturn {
  const {
    namespace = '',
    autoConnect = true,
    authToken,
  } = options;

  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { apiKeys } = useAppStore();

  const getToken = useCallback(() => {
    return authToken || localStorage.getItem('nyx_session_token') || '';
  }, [authToken]);

  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    const token = getToken();
    const base = (window as any).__NYX_BACKEND_URL__ || window.location.origin;
    const socket = io(`${base}${namespace ? `/${namespace}` : ''}`, {
      path: '/ws/socket.io',
      auth: (cb) => {
        cb({ token: getToken() });
      },
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 5,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      timeout: 20000,
      autoConnect: false,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      console.log(`[WS${namespace ? `:${namespace}` : ''}] Connected`);
      setIsConnected(true);
    });

    socket.on('connect_error', (err) => {
      console.error(`[WS${namespace ? `:${namespace}` : ''}] Connection error:`, err.message);
      setIsConnected(false);
    });

    socket.on('disconnect', (reason) => {
      console.log(`[WS${namespace ? `:${namespace}` : ''}] Disconnected:`, reason);
      setIsConnected(false);
    });

    socket.on('reconnect', (attemptNumber) => {
      console.log(`[WS${namespace ? `:${namespace}` : ''}] Reconnected after ${attemptNumber} attempts`);
      setIsConnected(true);
    });

    socket.on('reconnect_attempt', (attemptNumber) => {
      console.log(`[WS${namespace ? `:${namespace}` : ''}] Reconnection attempt ${attemptNumber}`);
    });

    socket.connect();
  }, [namespace, getToken]);

  const disconnect = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
  }, []);

  const emit = useCallback((event: string, data: any) => {
    socketRef.current?.emit(event, data);
  }, []);

  const on = useCallback((event: string, handler: (data: any) => void) => {
    socketRef.current?.on(event, handler);
    return () => {
      socketRef.current?.off(event, handler);
    };
  }, []);

  const off = useCallback((event: string, handler?: (data: any) => void) => {
    socketRef.current?.off(event, handler);
  }, []);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }
    return () => {
      disconnect();
    };
  }, [autoConnect, connect, disconnect]);

  return {
    socket: socketRef.current,
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