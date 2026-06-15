import React, { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Brain, X, Plus, Check, RefreshCw, Eye, EyeOff } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface Memory {
  id: string;
  fact: string;
  category: string;
  createdAt: number;
  sessionId?: string;
}

interface MemoryPanelProps {
  isOpen: boolean;
  onClose: () => void;
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ isOpen, onClose }) => {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [newFact, setNewFact] = useState('');
  const [isAdding, setIsAdding] = useState(false);
  const [showDates, setShowDates] = useState(false);

  const fetchMemories = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetchWithAuth('/api/v1/memory');
      if (res.ok) {
        const data = await res.json();
        setMemories(data.memories || []);
      }
    } catch {
      toast.error('Failed to load memories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) fetchMemories();
  }, [isOpen, fetchMemories]);

  const deleteMemory = async (id: string) => {
    try {
      await fetchWithAuth(`/api/v1/memory/${id}`, { method: 'DELETE' });
      setMemories(prev => prev.filter(m => m.id !== id));
      toast.success('Memory removed');
    } catch {
      toast.error('Failed to remove memory');
    }
  };

  const addMemory = async () => {
    if (!newFact.trim()) return;
    try {
      const res = await fetchWithAuth('/api/v1/memory', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fact: newFact.trim(), category: 'manual' }),
      });
      if (res.ok) {
        const data = await res.json();
        setMemories(prev => [data.memory, ...prev]);
        setNewFact('');
        setIsAdding(false);
        toast.success('Memory saved');
      }
    } catch {
      toast.error('Failed to save memory');
    }
  };

  const clearAll = async () => {
    if (!confirm('Clear all memories? This cannot be undone.')) return;
    try {
      await fetchWithAuth('/api/v1/memory', { method: 'DELETE' });
      setMemories([]);
      toast.success('All memories cleared');
    } catch {
      toast.error('Failed to clear memories');
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 20 }}
          transition={{ duration: 0.2 }}
          className="absolute right-0 top-0 h-full w-[360px] bg-[#0e1416] border-l border-white/5 z-50 flex flex-col shadow-2xl"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/5">
            <div className="flex items-center gap-2">
              <Brain className="w-4 h-4 text-violet-400" />
              <span className="text-sm font-medium text-white">NYX Memory</span>
              {memories.length > 0 && (
                <span className="text-[10px] bg-white/5 text-white/40 px-1.5 py-0.5 rounded-full">
                  {memories.length}
                </span>
              )}
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowDates(!showDates)}
                className="p-1.5 text-white/30 hover:text-white/70 rounded transition-colors"
                title={showDates ? 'Hide dates' : 'Show dates'}
              >
                {showDates ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={fetchMemories}
                className="p-1.5 text-white/30 hover:text-white/70 rounded transition-colors"
                title="Refresh"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="p-1.5 text-white/30 hover:text-red-400 rounded transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Memory list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
            {isLoading ? (
              <div className="flex items-center justify-center h-32 text-white/20 text-sm">
                Loading memories...
              </div>
            ) : memories.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-32 gap-2">
                <Brain className="w-8 h-8 text-white/10" />
                <p className="text-xs text-white/30 text-center">
                  No memories yet. NYX will learn from your conversations automatically.
                </p>
              </div>
            ) : (
              <AnimatePresence initial={false}>
                {memories.map(mem => (
                  <motion.div
                    key={mem.id}
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="group flex items-start gap-2 p-2.5 rounded-lg bg-white/[0.03] border border-white/[0.04] hover:border-white/10 transition-colors"
                  >
                    <span className="text-violet-400 mt-0.5 shrink-0">✦</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white/80 leading-relaxed">{mem.fact}</p>
                      {showDates && (
                        <p className="text-[10px] text-white/20 mt-1">
                          {new Date(mem.createdAt).toLocaleDateString()} · {mem.category}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => deleteMemory(mem.id)}
                      className="p-1 text-white/0 group-hover:text-red-400/60 hover:!text-red-400 rounded transition-colors shrink-0"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </motion.div>
                ))}
              </AnimatePresence>
            )}
          </div>

          {/* Add memory */}
          <div className="p-3 border-t border-white/5 space-y-2">
            {isAdding ? (
              <div className="flex gap-2">
                <input
                  autoFocus
                  value={newFact}
                  onChange={e => setNewFact(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addMemory(); if (e.key === 'Escape') setIsAdding(false); }}
                  placeholder="e.g. User prefers TypeScript"
                  className="flex-1 bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-white/20 outline-none focus:border-violet-500/50"
                />
                <button onClick={addMemory} className="p-1.5 bg-violet-600/20 border border-violet-500/30 rounded text-violet-400 hover:bg-violet-600/30 transition-colors">
                  <Check className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsAdding(false)} className="p-1.5 text-white/30 hover:text-white/60 rounded transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => setIsAdding(true)}
                  className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs text-white/30 hover:text-white/60 border border-white/5 hover:border-white/10 rounded transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add memory
                </button>
                {memories.length > 0 && (
                  <button
                    onClick={clearAll}
                    className="px-3 py-1.5 text-xs text-red-400/50 hover:text-red-400 border border-white/5 hover:border-red-500/20 rounded transition-colors"
                  >
                    Clear all
                  </button>
                )}
              </div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
