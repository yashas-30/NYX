import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Brain, Plus, Trash2, Search, Sparkles, Database, RefreshCw, Tag, Clock, ArrowRight,
  Layers, Users, Activity, List
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

interface LongTermMemory {
  id: string;
  fact: string;
  category: string;
  embedding: string;
  created_at: number;
  similarity?: number;
}

interface EpisodicMemory {
  id: string;
  session_id: string;
  summary: string;
  key_topics: string; // JSON string array
  created_at: number;
}

interface MemoryEntity {
  id: string;
  entity_name: string;
  entity_type: string;
  description: string;
  confidence: number;
  last_seen: number;
  created_at: number;
}

const isTauriEnv = typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

async function tauriInvoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  if (!isTauriEnv) throw new Error(`Tauri not available for command: ${cmd}`);
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(cmd, args);
}

let embeddingWorker: Worker | null = null;
let messageIdCounter = 0;
const pendingResolvers = new Map<number, { resolve: (val: any) => void; reject: (err: any) => void }>();

function initWorker() {
  if (typeof window === 'undefined') return;
  if (!embeddingWorker) {
    embeddingWorker = new Worker(new URL('../../workers/embedding.worker.ts', import.meta.url), { type: 'module' });
    embeddingWorker.onmessage = (e) => {
      const { id, embedding, error } = e.data;
      const resolver = pendingResolvers.get(id);
      if (resolver) {
        if (error) resolver.reject(new Error(error));
        else resolver.resolve(embedding);
        pendingResolvers.delete(id);
      }
    };
  }
}

async function embedText(text: string): Promise<number[] | null> {
  initWorker();
  if (!embeddingWorker) return null;
  return new Promise((resolve, reject) => {
    const id = ++messageIdCounter;
    pendingResolvers.set(id, { resolve, reject });
    embeddingWorker!.postMessage({ id, text });
  });
}

export default function MemoryView() {
  const [activeTab, setActiveTab] = useState<'facts' | 'episodes' | 'entities'>('facts');
  
  const [memories, setMemories] = useState<LongTermMemory[]>([]);
  const [episodes, setEpisodes] = useState<EpisodicMemory[]>([]);
  const [entities, setEntities] = useState<MemoryEntity[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<LongTermMemory[] | null>(null);
  const [isSearching, setIsSearching] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isAdding, setIsAdding] = useState(false);

  const [newFact, setNewFact] = useState('');
  const [newCategory, setNewCategory] = useState('Preference');

  const fetchMemories = async () => {
    setIsLoading(true);
    try {
      if (isTauriEnv) {
        // Fetch all 3 tiers in parallel
        const [mems, eps, ents] = await Promise.all([
          tauriInvoke<LongTermMemory[]>('db_get_memories').catch(() => []),
          tauriInvoke<EpisodicMemory[]>('get_episodic_memories', { limit: 50 }).catch(() => []),
          tauriInvoke<MemoryEntity[]>('get_memory_entities', { limit: 100 }).catch(() => [])
        ]);
        setMemories(mems);
        setEpisodes(eps);
        setEntities(ents);
      } else {
        setMemories([]);
        setEpisodes([]);
        setEntities([]);
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
    if (activeTab !== 'facts') {
        // Just local filter for other tabs for now
        return;
    }
    
    setIsSearching(true);
    try {
      if (isTauriEnv) {
        const embedding = await embedText(searchQuery);
        if (!embedding) {
          throw new Error('Local embedding generation failed. Model may still be downloading.');
        }
        const results = await tauriInvoke<any[]>('db_search_memories', {
          queryEmbedding: embedding,
          topK: 5
        });
        setSearchResults(results.map(r => ({
          id: r.id, fact: r.fact, category: r.category, embedding: '[]', created_at: r.created_at, similarity: r.similarity
        })));
      } else {
        setSearchResults([]);
      }
    } catch (err: any) {
      toast.error(`Vector search failed: ${err.message}`);
    } finally {
      setIsSearching(false);
    }
  };

  const handleAddMemory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFact.trim()) return;
    try {
      const id = crypto.randomUUID();
      let embeddingStr = '[]';
      if (isTauriEnv) {
        const embedding = await embedText(newFact.trim());
        if (!embedding) {
           throw new Error('Embedding failed to generate.');
        }
        embeddingStr = JSON.stringify(embedding);
        await tauriInvoke('db_add_memory', { id, fact: newFact.trim(), category: newCategory, embedding: embeddingStr });
      }
      toast.success('Successfully remembered fact!');
      setNewFact('');
      setIsAdding(false);
      fetchMemories();
    } catch (err: any) {
      toast.error(`Failed to save memory: ${err.message}`);
    }
  };

  const handleDeleteMemory = async (id: string) => {
    try {
      if (isTauriEnv) {
        await tauriInvoke('db_delete_memory', { id });
      }
      toast.success('Fact forgotten.');
      fetchMemories();
    } catch (err: any) {
      toast.error(`Failed to delete memory: ${err.message}`);
    }
  };
  
  const handleDeleteEntity = async (id: string) => {
      try {
          if (isTauriEnv) {
              await tauriInvoke('delete_entity', { id });
          }
          toast.success('Entity forgotten.');
          fetchMemories();
      } catch (err: any) {
          toast.error(`Failed to delete entity: ${err.message}`);
      }
  };

  const activeMemories = searchResults || memories;

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-background text-foreground overflow-y-auto custom-scrollbar p-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-border/60 pb-5 mb-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Brain className="text-primary w-6 h-6 animate-pulse" />
            <span>Multi-Tier Memory Engine</span>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            NYX extracts facts, summarizes sessions (episodes), and graphs entities automatically.
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
      
      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-border/40 pb-1">
          <button 
            onClick={() => setActiveTab('facts')} 
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg flex items-center gap-2 ${activeTab === 'facts' ? 'bg-card border border-border border-b-0 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
              <List size={16} /> Semantic Facts
          </button>
          <button 
            onClick={() => setActiveTab('episodes')} 
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg flex items-center gap-2 ${activeTab === 'episodes' ? 'bg-card border border-border border-b-0 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
              <Activity size={16} /> Episodic Summaries
          </button>
          <button 
            onClick={() => setActiveTab('entities')} 
            className={`px-4 py-2 text-sm font-semibold rounded-t-lg flex items-center gap-2 ${activeTab === 'entities' ? 'bg-card border border-border border-b-0 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
              <Users size={16} /> Entity Graph
          </button>
      </div>

      {activeTab === 'facts' && (
          <>
          <form onSubmit={handleSearch} className="mb-6 flex gap-3">
            <div className="flex-1 relative">
              <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search semantic facts using vector similarity..."
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

          {isLoading ? (
            <div className="flex-1 flex items-center justify-center min-h-[300px]">
              <RefreshCw size={24} className="animate-spin text-primary" />
            </div>
          ) : activeMemories.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] border border-dashed border-border/80 rounded-2xl bg-card/10">
              <Database size={32} className="text-muted-foreground/40 mb-3" />
              <h3 className="text-sm font-semibold text-foreground/90">No facts stored</h3>
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
                    className="flex flex-col p-4 rounded-xl border border-border bg-card hover:shadow-md hover:border-primary/30 transition-all relative"
                  >
                    <div className="flex items-center gap-2 mb-3">
                      <span className="text-[10px] px-2 py-0.5 rounded-full font-bold bg-primary/10 text-primary uppercase tracking-wider flex items-center gap-1">
                        <Tag size={8} /> {m.category}
                      </span>
                      {m.similarity !== undefined && (
                        <span className="text-[9px] font-mono font-extrabold text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full ml-auto">
                          {(m.similarity * 100).toFixed(1)}% Match
                        </span>
                      )}
                    </div>
                    <p className="text-sm leading-relaxed text-foreground/90 mb-4 flex-1">{m.fact}</p>
                    <div className="flex items-center justify-between text-[11px] text-muted-foreground/60 border-t border-border/40 pt-3">
                      <span className="flex items-center gap-1"><Clock size={10} />{new Date(m.created_at).toLocaleDateString()}</span>
                      <button onClick={() => handleDeleteMemory(m.id)} className="p-1 hover:text-red-400 hover:bg-red-500/10 rounded"><Trash2 size={13} /></button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
          </>
      )}

      {activeTab === 'episodes' && (
          <div className="space-y-4">
              {episodes.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] border border-dashed border-border/80 rounded-2xl bg-card/10">
                      <Activity size={32} className="text-muted-foreground/40 mb-3" />
                      <h3 className="text-sm font-semibold text-foreground/90">No episodes yet</h3>
                      <p className="text-xs text-muted-foreground mt-1">Episodes are summarized automatically after a chat session completes.</p>
                  </div>
              ) : (
                  episodes.map(e => {
                      let topics = [];
                      try { topics = JSON.parse(e.key_topics); } catch(_) {}
                      return (
                          <div key={e.id} className="p-4 bg-card border border-border rounded-xl shadow-sm">
                              <div className="flex items-center justify-between mb-2">
                                  <span className="text-xs font-mono text-muted-foreground">Session: {e.session_id.substring(0,8)}...</span>
                                  <span className="text-xs text-muted-foreground">{new Date(e.created_at).toLocaleString()}</span>
                              </div>
                              <p className="text-sm text-foreground/90 mb-3">{e.summary}</p>
                              {topics.length > 0 && (
                                  <div className="flex gap-2 flex-wrap">
                                      {topics.map((t: string, i: number) => (
                                          <span key={i} className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded-full">{t}</span>
                                      ))}
                                  </div>
                              )}
                          </div>
                      )
                  })
              )}
          </div>
      )}

      {activeTab === 'entities' && (
          <div className="space-y-4">
              {entities.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center min-h-[200px] border border-dashed border-border/80 rounded-2xl bg-card/10">
                      <Users size={32} className="text-muted-foreground/40 mb-3" />
                      <h3 className="text-sm font-semibold text-foreground/90">No entities extracted</h3>
                  </div>
              ) : (
                  <div className="overflow-x-auto rounded-xl border border-border">
                      <table className="w-full text-sm text-left">
                          <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold">
                              <tr>
                                  <th className="px-4 py-3">Entity Name</th>
                                  <th className="px-4 py-3">Type</th>
                                  <th className="px-4 py-3">Description</th>
                                  <th className="px-4 py-3">Confidence</th>
                                  <th className="px-4 py-3">Last Seen</th>
                                  <th className="px-4 py-3 text-right">Actions</th>
                              </tr>
                          </thead>
                          <tbody>
                              {entities.map(ent => (
                                  <tr key={ent.id} className="border-b border-border/50 hover:bg-muted/20">
                                      <td className="px-4 py-3 font-semibold text-primary">{ent.entity_name}</td>
                                      <td className="px-4 py-3"><span className="text-[10px] bg-primary/10 text-primary px-2 py-0.5 rounded-full">{ent.entity_type}</span></td>
                                      <td className="px-4 py-3 text-muted-foreground truncate max-w-[200px]" title={ent.description}>{ent.description}</td>
                                      <td className="px-4 py-3 font-mono">{(ent.confidence * 100).toFixed(0)}%</td>
                                      <td className="px-4 py-3 text-xs text-muted-foreground">{new Date(ent.last_seen).toLocaleDateString()}</td>
                                      <td className="px-4 py-3 text-right">
                                          <button onClick={() => handleDeleteEntity(ent.id)} className="text-muted-foreground hover:text-red-400 p-1">
                                              <Trash2 size={14} />
                                          </button>
                                      </td>
                                  </tr>
                              ))}
                          </tbody>
                      </table>
                  </div>
              )}
          </div>
      )}
    </div>
  );
}
