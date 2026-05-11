import { useEffect, useRef } from 'react';
import { ComparisonColumn } from '@/src/types';

export const useTerminalPolling = (
  columns: ComparisonColumn[],
  setColumns: React.Dispatch<React.SetStateAction<ComparisonColumn[]>>
) => {
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const terminalNodes = columns.filter(c => c.modelId === 'terminal-bridge' && c.status === 'loading');
    
    // Clear existing interval if no nodes need polling
    if (terminalNodes.length === 0) {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      return;
    }

    // Don't restart if already polling the same set of nodes
    if (pollingIntervalRef.current) return;

    pollingIntervalRef.current = setInterval(async () => {
      // Re-evaluate terminal nodes inside interval to stay fresh
      // but use a functional update to avoid stale closure on 'columns'
      for (const node of terminalNodes) {
        try {
          const res = await fetch(`/api/terminal/poll?nodeId=${node.id}`);
          if (!res.ok) continue;
          
          const data = await res.json();
          if (data.output) {
            setColumns(prev => prev.map(c => 
              c.id === node.id ? { ...c, output: data.output, status: 'success' } : c
            ));
          }
        } catch (e) {
          console.error("[Terminal] Polling error:", e);
        }
      }
    }, 1000); // 1s is safer for local bridges

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
  }, [columns, setColumns]);
};
