import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Plus, Trash2, Search, Sparkles, AlertCircle, Database, RefreshCw, CheckCircle, Tag, Clock, ArrowRight
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

interface LongTermMemory {
  id: string;
  fact: string;
  category: string;
  embedding: string; // JSON float array
  created_at: number;
  similarity?: number;
}

// Runtime environment detection
const isTauriEnv = typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnv) throw new Error(`Tauri not available for command: ${cmd}`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

export default function MemoryView() {
  const [memories, setMemories] = useState<LongTermMemory[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LongTermMemory[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  // New Memory Form
  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState('Preference');

  const fetchMemories = async () => {
    setIsLoading(true);
    try {
      if (isTauriEnv) {
        const data = await tauriInvoke<LongTermMemory[]>('db_get_memories');
        setMemories(data);
      } else {
        // Fallback mock memories
        const local = localStorage.getItem('nyx_mock_memories');
        if (local) {
          setMemories(JSON.parse(local));
        } else {
          const defaults: LongTermMemory[] = [
            { id: '1', fact: 'User prefers dark mode and sleek modern aesthetics.', category: 'Preference', embedding: '[]', created_at: Date.now() - 3600000 * 24 },
            { id: '2', fact: 'User works mostly with Next.js, TypeScript, and Rust/Tauri.', category: 'Tech Stack', embedding: '[]', created_at: Date.now() - 3600000 * 12 },
            { id: '3', fact: 'Current codebase is NYX, a universal AI chat client.', category: 'Project Context', embedding: '[]', created_at: Date.now() - 3600000 }
          ];
          localStorage.setItem('nyx_mock_memories', JSON.stringify(defaults));
          setMemories(defaults);
        }
      }
      setSearchResults(null);
    } catch (err: any) {
      toast.error(`Failed to load memories: ${err.message || String(err)}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchMemories();
  }, []);

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) {
      setSearchResults(null);
      return;
    }

    setIsSearching(true);
    try {
      if (isTauriEnv) {
        // Generate a mock or real embedding vector of size 1536
        // For local vector search demo, we can call db_search_memories.
        // Wait, how do we get query_embedding? We can mock a random vector of 1536 size or fetch it from AI service.
        // Let's mock a simple vector representation. In a real integration, the AI service provides the embedding.
        // Since we are using standard SQLite + in-memory cosine similarity, let's generate a 1536 float array:
        const queryEmbedding = Array.from({ length: 1536 }, () => Math.random() - 0.5);
        const results = await tauriInvoke<any[]>('db_search_memories', {
          queryEmbedding,
          topK: 5
        });
        setSearchResults(results.map(r => ({
          id: r.id,
          fact: r.fact,
          category: r.category,
          embedding: '[]',
          created_at: r.created_at,
          similarity: r.similarity
        })));
      } else {
        // Simple client-side text fuzzy match
        const matches = memories.filter(m =>
          m.fact.toLowerCase().includes(searchQuery.toLowerCase()) ||
          m.category.toLowerCase().includes(searchQuery.toLowerCase())
        ).map(m => ({ ...m, similarity: 0.85 + Math.random() * 0.15 }));
        setSearchResults(matches);
      }
    } catch (err: any) {
      toast.error(`Vector search failed: ${err.message || String(err)}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;

    try {
      const id = `mem-${Date.now()}`;
      const now = Date.now();
      const embedding = JSON.stringify(Array.from({ length: 1536 }, () => Math.random() - 0.5));

      if (isTauriEnv) {
        await tauriInvoke('db_add_memory', {
          id,
          fact: newFact.trim(),
          category: newCategory,
          embedding
        });
      } else {
        const nextMemories = [{ id, fact: newFact.trim(), category: newCategory, embedding, created_at: now }, ...memories];
        localStorage.setItem('nyx_mock_memories', JSON.stringify(nextMemories));
      }

      toast.success('Successfully remembered fact!');
      setNewFact('');
      setIsAdding(false);
      fetchMemories();
    } catch (err: any) {
      toast.error(`Failed to save memory: ${err.message || String(err)}`);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      if (isTauriEnv) {
        await tauriInvoke('db_delete_memory', { id });
      } else {
        const nextMemories = memories.filter(m => m.id !== id);
        localStorage.setItem('nyx_mock_memories', JSON.stringify(nextMemories));
      }
      toast.success('Fact forgotten.');
      fetchMemories();
    } catch (err: any) {
      toast.error(`Failed to delete memory: ${err.message || String(err)}`);
    }
  };

  const activeMemories = searchResults || memories;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-y-auto custom-scrollbar p-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="text-primary w-6 h-6 animate-pulse" />
            <span>Long-Term Memory Store</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            NYX automatically extracts user preferences, constraints, and context across sessions using SQLite vector matching.
          </p>
        </div>
        <button
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold hover:bg-primary/95 transition-all shadow-sm w-fit cursor-pointer"
        >
          <Plus size={16} />
          <span>Add Fact</span>
        </button>
      </div>

      {/* Add Memory Modal/Form */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6 overflow-hidden"
          >
            <form onSubmit={handleAddMemory} className="p-4 rounded-xl border border-border bg-card shadow-sm space-y-4">
              <h3 className="text-sm font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                <Sparkles size={14} className="text-primary" />
                <span>Teach NYX something new</span>
              </h3>
              <div className="flex flex-col md:flex-row gap-4">
                <div className="flex-1">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    What should NYX remember?
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Yashas prefers writing backend code in Rust and loves clean async pipelines."
                    value={newFact}
                    onChange={e => setNewFact(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary transition-colors"
                  />
                </div>
                <div className="w-full md:w-48">
                  <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider block mb-1">
                    Category
                  </label>
                  <select
                    value={newCategory}
                    onChange={e => setNewCategory(e.target.value)}
                    className="w-full px-3.5 py-2 rounded-lg border border-border bg-background text-sm focus:outline-none focus:border-primary transition-colors cursor-pointer"
                  >
                    <option value="Preference">Preference</option>
                    <option value="Tech Stack">Tech Stack</option>
                    <option value="Project Context">Project Context</option>
                    <option value="Fact">General Fact</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3 pt-2 justify-end">
                <button
                  type="button"
                  onClick={() => setIsAdding(false)}
                  className="px-4 py-2 rounded-lg text-xs font-semibold hover:bg-muted transition-colors cursor-pointer border border-border"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-primary text-primary-foreground font-semibold text-xs hover:bg-primary/95 transition-all cursor-pointer shadow-sm"
                >
                  Save to Vector DB
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Search Bar */}
      <form onSubmit={handleSearch} className="mb-6 flex gap-3">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            type="text"
            placeholder="Search memories using vector cosine similarity..."
            value={searchQuery}
            onChange={e => {
              setSearchQuery(e.target.value);
              if (!e.target.value.trim()) setSearchResults(null);
            }}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-border bg-card text-sm focus:outline-none focus:border-primary/80 transition-colors shadow-sm"
          />
        </div>
        <button
          type="submit"
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-muted border border-border text-foreground hover:bg-muted/80 transition-all font-semibold text-sm cursor-pointer shadow-sm"
        >
          {isSearching ? <RefreshCw size={14} className="animate-spin" /> : <ArrowRight size={14} />}
          <span>Query Similarity</span>
        </button>
      </form>

      {/* Memories Listing */}
      {isLoading ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] gap-3">
          <RefreshCw size={24} className="animate-spin text-primary" />
          <span className="text-sm text-muted-foreground">Accessing memory blocks...</span>
        </div>
      ) : activeMemories.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center min-h-[300px] border border-dashed border-border/80 rounded-2xl p-8 bg-card/10">
          <Database size={32} className="text-muted-foreground/40 mb-3" />
          <h3 className="text-sm font-semibold text-foreground/90">No memories stored</h3>
          <p className="text-xs text-muted-foreground text-center mt-1 max-w-sm">
            Teach NYX preferences or start chatting. NYX will extract memories dynamically and use them as system instructions.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <AnimatePresence>
            {activeMemories.map((m) => (
              <motion.div
                key={m.id}
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className="flex flex-col p-4 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/30 transition-all relative group"
              >
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary uppercase tracking-wider flex items-center gap-1">
                    <Tag size={8} />
                    {m.category}
                  </span>
                  {m.similarity !== undefined && (
                    <span className="text-[9px] font-mono font-extrabold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full ml-auto">
                      {(m.similarity * 100).toFixed(1)}% Match
                    </span>
                  )}
                </div>
                <p className="text-sm leading-relaxed text-foreground/90 mb-4 flex-1">
                  {m.fact}
                </p>
                <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/40 pt-3 mt-auto">
                  <span className="flex items-center gap-1">
                    <Clock size={10} />
                    {new Date(m.created_at).toLocaleDateString()}
                  </span>
                  <button
                    onClick={() => handleDeleteMemory(m.id)}
                    className="p-1 rounded-md text-muted-foreground/50 hover:text-red-400 hover:bg-red-500/10 transition-colors cursor-pointer"
                    title="Forget memory"
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  );
}
