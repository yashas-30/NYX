import { useState, useCallback, useEffect, useRef } from 'react';
import { useTerminalWebSocket as useBaseTerminalWebSocket } from './useWebSocket';

export interface TerminalOutput {
  output: string;
  done: boolean;
  timestamp: number;
}

export function useTerminalWebSocket(sessionId?: string) {
  const [output, setOutput] = useState<string>('');
  const [isConnected, setIsConnected] = useState(false);
  const outputRef = useRef<string>('');
  const sessionRef = useRef<string>(sessionId || `term-${Date.now()}`);

  if (sessionId) {
    sessionRef.current = sessionId;
  }

  const {
    on,
    off,
    emit,
    connect,
    disconnect,
    isConnected: wsConnected,
  } = useBaseTerminalWebSocket({ autoConnect: false });

  useEffect(() => {
    setIsConnected(wsConnected);
  }, [wsConnected]);

  useEffect(() => {
    if (!sessionRef.current) return;

    const cleanup = on('output', (data: TerminalOutput) => {
      outputRef.current += data.output;
      setOutput(outputRef.current);
    });

    connect();
    emit('join-terminal', { sessionId: sessionRef.current });

    return () => {
      cleanup();
      emit('leave-terminal', { sessionId: sessionRef.current });
    };
  }, [on, off, emit, connect, wsConnected]);

  const sendCommand = useCallback(
    (command: string, cols?: number, rows?: number) => {
      emit('terminal-command', {
        sessionId: sessionRef.current,
        command,
        cols,
        rows,
      });
    },
    [emit]
  );

  const clearOutput = useCallback(() => {
    outputRef.current = '';
    setOutput('');
  }, []);

  const resize = useCallback(
    (cols: number, rows: number) => {
      emit('terminal-resize', { sessionId: sessionRef.current, cols, rows });
    },
    [emit]
  );

  return {
    output,
    isConnected,
    sendCommand,
    clearOutput,
    resize,
    sessionId: sessionRef.current,
    connect,
    disconnect,
  };
}

export function createTerminalSession(): string {
  return `term-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}