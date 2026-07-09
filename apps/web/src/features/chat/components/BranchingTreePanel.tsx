/**
 * @file BranchingTreePanel.tsx
 * @description Premium visual branching tree panel, split-pane comparison view, and step-by-step merge wizard.
 */

import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  GitBranch, 
  GitMerge, 
  Columns, 
  X, 
  Check, 
  ArrowRight, 
  ChevronRight, 
  Layers, 
  MessageSquare,
  ArrowLeft,
  ChevronDown
} from 'lucide-react';
import { ChatSession } from '@src/shared/hooks/useChatSessions';
import { ChatMessage } from '@src/infrastructure/types';

interface BranchingTreePanelProps {
  sessions: ChatSession[];
  activeSid: string | null;
  onSwitchSession: (sid: string) => void;
  onCreateSession: (messages: ChatMessage[]) => string;
  onClose: () => void;
}

export const BranchingTreePanel: React.FC<BranchingTreePanelProps> = ({
  sessions,
  activeSid,
  onSwitchSession,
  onCreateSession,
  onClose,
}) => {
  const [viewMode, setViewMode] = useState<'tree' | 'compare' | 'merge'>('tree');
  const [compareSid, setCompareSid] = useState<string | null>(null);

  // --- Merge Mode State ---
  const [mergeSelected, setMergeSelected] = useState<Array<{ sid: string; message: ChatMessage; checked: boolean }>>([]);
  const [mergeTitle, setMergeTitle] = useState('Merged Session');

  // Find active session
  const activeSession = useMemo(() => sessions.find(s => s.id === activeSid), [sessions, activeSid]);

  // Find all related sessions in the same branching family tree
  // A family tree is defined by tracing the parent links (branchOf) to the root, 
  // then finding all sessions that descend from that root or any of its ancestors.
  const familySessions = useMemo(() => {
    if (!activeSession) return [];

    // Find the root session
    let rootSid = activeSession.id;
    let curr = activeSession;
    const visited = new Set<string>();

    while (curr && curr.branchOf && !visited.has(curr.branchOf)) {
      visited.add(curr.id);
      const parent = sessions.find(s => s.id === curr.branchOf);
      if (parent) {
        rootSid = parent.id;
        curr = parent;
      } else {
        break;
      }
    }

    // Now gather all descendants of that root (and root itself)
    const familyMap = new Map<string, ChatSession>();
    const rootSession = sessions.find(s => s.id === rootSid) || activeSession;
    familyMap.set(rootSession.id, rootSession);

    // Iteratively find children
    let added = true;
    while (added) {
      added = false;
      for (const s of sessions) {
        if (s.branchOf && familyMap.has(s.branchOf) && !familyMap.has(s.id)) {
          familyMap.set(s.id, s);
          added = true;
        }
      }
    }

    return Array.from(familyMap.values());
  }, [sessions, activeSession]);

  // Tree nodes construction
  const rootNode = useMemo(() => {
    const roots = familySessions.filter(s => !s.branchOf || !familySessions.some(p => p.id === s.branchOf));
    return roots[0] || familySessions[0];
  }, [familySessions]);

  // Build sibling/child relationships
  const childrenMap = useMemo(() => {
    const map = new Map<string, ChatSession[]>();
    for (const s of familySessions) {
      if (s.branchOf) {
        const list = map.get(s.branchOf) || [];
        list.push(s);
        map.set(s.branchOf, list);
      }
    }
    return map;
  }, [familySessions]);

  // Initialize merge selections when entering merge mode
  const handleEnterMerge = () => {
    if (!activeSession) return;
    const activeMsgs = activeSession.messages.map(m => ({ sid: activeSession.id, message: m, checked: true }));
    let compareMsgs: Array<{ sid: string; message: ChatMessage; checked: boolean }> = [];
    if (compareSid) {
      const compSess = sessions.find(s => s.id === compareSid);
      if (compSess) {
        compareMsgs = compSess.messages.map(m => ({ sid: compSess.id, message: m, checked: false }));
      }
    }
    
    // Interleave user and assistant messages sorted by timestamp
    const combined = [...activeMsgs, ...compareMsgs].sort(
      (a, b) => (a.message.timestamp || 0) - (b.message.timestamp || 0)
    );
    setMergeSelected(combined);
    setViewMode('merge');
  };

  const handleMergeSubmit = () => {
    const selectedMessages = mergeSelected
      .filter(item => item.checked)
      .map(item => ({ ...item.message }));

    if (selectedMessages.length === 0) {
      alert('Please select at least one message to merge.');
      return;
    }

    const newSid = onCreateSession(selectedMessages);
    onSwitchSession(newSid);
    setViewMode('tree');
    onClose();
  };

  // Render visual tree helper
  const renderTreeNode = (session: ChatSession, depth = 0) => {
    if (!session) return null;
    const isCurrent = session.id === activeSid;
    const children = childrenMap.get(session.id) || [];

    return (
      <div key={session.id} className="flex flex-col ml-6 relative">
        {/* Connection line */}
        {depth > 0 && (
          <div 
            className="absolute -left-4 top-0 bottom-6 w-0.5 border-l border-dashed border-white/20"
            style={{ height: '24px' }}
          />
        )}
        {depth > 0 && (
          <div 
            className="absolute -left-4 top-6 w-4 h-0.5 border-t border-dashed border-white/20"
          />
        )}

        <div className="flex items-center gap-3 py-1.5">
          <div 
            onClick={() => onSwitchSession(session.id)}
            className={`flex flex-col p-3 rounded-xl border text-left cursor-pointer transition-all w-80 max-w-sm ${
              isCurrent 
                ? 'bg-indigo-600/15 border-indigo-500 text-indigo-200 shadow-[0_0_15px_rgba(99,102,241,0.15)]' 
                : 'bg-white/5 border-white/10 hover:border-white/20 hover:bg-white/10 text-white/80'
            }`}
          >
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] font-mono opacity-40 truncate max-w-[150px]">
                {session.id}
              </span>
              {session.branchAtIndex !== undefined && session.branchAtIndex !== null && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60 font-medium">
                  branched @ msg {session.branchAtIndex + 1}
                </span>
              )}
            </div>
            <p className="text-xs font-medium line-clamp-1">
              {session.title || 'Untitled Session'}
            </p>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-white/5 text-[10px] opacity-60">
              <span>{session.messages.length} messages</span>
              <span>{new Date(session.updatedAt).toLocaleDateString()}</span>
            </div>
          </div>

          {/* Quick actions if not current */}
          {!isCurrent && (
            <div className="flex gap-1.5 opacity-0 group-hover:opacity-100 hover:opacity-100 transition-opacity">
              <button
                onClick={() => {
                  setCompareSid(session.id);
                  setViewMode('compare');
                }}
                title="Compare side-by-side"
                className="p-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 text-white/80 transition-colors cursor-pointer"
              >
                <Columns size={13} />
              </button>
            </div>
          )}
        </div>

        {/* Children nodes */}
        {children.length > 0 && (
          <div className="flex flex-col mt-1">
            {children.map(child => renderTreeNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.98 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.98 }}
      className="fixed inset-0 z-[60] bg-background/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-200"
    >
      <div className="flex flex-col w-full h-full max-w-[95vw] bg-card border border-border rounded-2xl shadow-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border shrink-0 bg-muted/20">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary/10 text-primary rounded-xl">
              <GitBranch size={18} />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-foreground/90">
                Conversation Branch Manager
              </h2>
              <p className="text-xs text-muted-foreground/80">
                Explore history, compare different branches, or merge ideas together.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* View Mode Switchers */}
            <div className="flex items-center bg-muted/40 p-1 rounded-lg border border-border">
              <button
                onClick={() => setViewMode('tree')}
                className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                  viewMode === 'tree' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Tree View
              </button>
              {compareSid && (
                <button
                  onClick={() => setViewMode('compare')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                    viewMode === 'compare' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Side-by-Side
                </button>
              )}
            </div>

            <button 
              onClick={onClose}
              className="p-1.5 rounded-lg hover:bg-muted/40 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              <X size={16} />
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto p-6 min-h-0 bg-background">
          {viewMode === 'tree' && (
            <div className="flex flex-col h-full items-start justify-start overflow-auto">
              {rootNode ? (
                <div className="group relative">
                  {renderTreeNode(rootNode)}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center w-full h-64 text-white/30">
                  <GitBranch size={40} strokeWidth={1} className="mb-4" />
                  <p className="text-sm">No branching history found for this session.</p>
                </div>
              )}
            </div>
          )}

          {viewMode === 'compare' && compareSid && activeSession && (
            <div className="grid grid-cols-2 gap-4 h-full min-h-0">
              {/* Left Pane (Active Session) */}
              <div className="flex flex-col border border-border bg-muted/25 rounded-xl overflow-hidden min-h-0">
                <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between shrink-0">
                  <span className="text-xs font-semibold text-primary">
                    Active Session (Trunk)
                  </span>
                  <span className="text-[10px] text-muted-foreground">
                    {activeSession.messages.length} messages
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {activeSession.messages.map((m, i) => (
                    <div 
                      key={i} 
                      className={`p-3 rounded-lg text-xs ${
                        m.role === 'user' ? 'bg-muted/40 text-foreground/90 ml-6' : 'bg-primary/5 text-foreground/90 mr-6 border border-primary/10'
                      }`}
                    >
                      <p className="font-semibold text-[10px] opacity-40 uppercase tracking-wider mb-1">
                        {m.role}
                      </p>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Right Pane (Compared Session) */}
              <div className="flex flex-col border border-border bg-muted/25 rounded-xl overflow-hidden min-h-0">
                <div className="px-4 py-3 bg-muted border-b border-border flex items-center justify-between shrink-0">
                  <select 
                    value={compareSid} 
                    onChange={(e) => setCompareSid(e.target.value)}
                    className="text-xs font-semibold text-accent bg-transparent outline-none cursor-pointer border-none p-0"
                  >
                    {familySessions
                      .filter(s => s.id !== activeSid)
                      .map(s => (
                        <option key={s.id} value={s.id} className="bg-popover text-foreground">
                          {s.title || s.id}
                        </option>
                      ))
                    }
                  </select>
                  <span className="text-[10px] text-white/40">
                    {sessions.find(s => s.id === compareSid)?.messages.length} messages
                  </span>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                  {sessions.find(s => s.id === compareSid)?.messages.map((m, i) => (
                    <div 
                      key={i} 
                      className={`p-3 rounded-lg text-xs ${
                        m.role === 'user' ? 'bg-white/5 text-white/90 ml-6' : 'bg-emerald-600/5 text-emerald-200/90 mr-6 border border-emerald-500/10'
                      }`}
                    >
                      <p className="font-semibold text-[10px] opacity-40 uppercase tracking-wider mb-1">
                        {m.role}
                      </p>
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {viewMode === 'merge' && (
            <div className="flex flex-col h-full min-h-0">
              <div className="mb-4 flex items-center gap-3 shrink-0">
                <input
                  type="text"
                  value={mergeTitle}
                  onChange={(e) => setMergeTitle(e.target.value)}
                  className="bg-input border border-border rounded-lg px-3 py-1.5 text-xs text-foreground/90 outline-none focus:border-primary w-80"
                  placeholder="Enter merged chat title"
                />
                <span className="text-xs text-muted-foreground/80">
                  Select which messages to consolidate into the new timeline.
                </span>
              </div>

              {/* Interleaved messages checklist */}
              <div className="flex-1 overflow-y-auto border border-border bg-muted/20 rounded-xl p-4 space-y-3">
                {mergeSelected.map((item, index) => {
                  const isUser = item.message.role === 'user';
                  const sourceSession = sessions.find(s => s.id === item.sid);
                  const sourceLabel = sourceSession?.id === activeSid ? 'Trunk' : 'Branch';

                  return (
                    <div 
                      key={index}
                      onClick={() => {
                        const updated = [...mergeSelected];
                        updated[index].checked = !updated[index].checked;
                        setMergeSelected(updated);
                      }}
                      className={`flex items-start gap-4 p-4 rounded-xl border cursor-pointer select-none transition-all ${
                        item.checked 
                          ? 'bg-primary/10 border-primary' 
                          : 'bg-muted/30 border-border opacity-50 hover:opacity-80'
                      }`}
                    >
                      <div className="pt-0.5 shrink-0">
                        <div className={`w-5 h-5 rounded flex items-center justify-center border transition-all ${
                          item.checked 
                            ? 'bg-primary border-primary text-primary-foreground' 
                            : 'border-border'
                        }`}>
                          {item.checked && <Check size={12} strokeWidth={3} />}
                        </div>
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className={`text-[9px] px-1.5 py-0.5 rounded font-mono font-bold uppercase tracking-wider ${
                            isUser ? 'bg-muted text-foreground/80' : 'bg-primary/10 text-primary'
                          }`}>
                            {item.message.role}
                          </span>
                          <span className="text-[10px] text-muted-foreground/80 font-medium">
                            Source: {sourceLabel} ({item.sid.slice(-6)})
                          </span>
                        </div>
                        <p className="text-xs text-foreground/80 whitespace-pre-wrap line-clamp-4">
                          {item.message.content}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border bg-card flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            {viewMode === 'tree' && familySessions.length > 1 && (
              <button
                onClick={() => {
                  // Find first sibling that isn't active
                  const other = familySessions.find(s => s.id !== activeSid);
                  if (other) {
                    setCompareSid(other.id);
                    setViewMode('compare');
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <Columns size={14} />
                Compare Branches
              </button>
            )}

            {viewMode === 'compare' && (
              <button
                onClick={handleEnterMerge}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-colors cursor-pointer"
              >
                <GitMerge size={14} />
                Consolidate & Merge Messages
              </button>
            )}

            {viewMode === 'merge' && (
              <button
                onClick={() => setViewMode('compare')}
                className="flex items-center gap-1.5 px-4 py-2 text-xs font-semibold rounded-xl bg-muted border border-border text-foreground hover:bg-muted/80 transition-colors cursor-pointer"
              >
                <ArrowLeft size={14} />
                Back to Comparison
              </button>
            )}
          </div>

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-muted hover:bg-muted/80 text-foreground transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {viewMode === 'merge' && (
              <button
                onClick={handleMergeSubmit}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground transition-colors cursor-pointer shadow-md"
              >
                Consolidate & Open
              </button>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
};
