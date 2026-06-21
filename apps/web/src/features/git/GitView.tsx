import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  GitBranch, GitCommit, GitPullRequest, GitMerge, Circle, CheckCircle, AlertCircle,
  FileDiff, Folder, Clock, User, MessageSquare, ChevronRight, RefreshCw, Plus, Copy, ExternalLink
} from 'lucide-react';
import { useGitStatus, useGitLog, useGitBranches, useGitDiff, useGitActions, GitCommit as IGitCommit, GitBranchInfo } from './hooks/useGit';

export default function GitView() {
  const [activeTab, setActiveTab] = useState<'status' | 'commits' | 'branches' | 'diff'>('status');
  const [selectedCommit, setSelectedCommit] = useState<IGitCommit | null>(null);
  const [selectedBranch, setSelectedBranch] = useState<GitBranchInfo | null>(null);

  const { data: status, isFetching: isStatusFetching, refetch: refetchStatus } = useGitStatus();
  const { data: commits, isFetching: isCommitsFetching, refetch: refetchCommits } = useGitLog();
  const { data: branches, isFetching: isBranchesFetching, refetch: refetchBranches } = useGitBranches();
  
  // Example for diff fetching: right now just showing overall diff if no file selected
  const { data: diff, isFetching: isDiffFetching } = useGitDiff();

  const isRefreshing = isStatusFetching || isCommitsFetching || isBranchesFetching;

  const refresh = () => {
    refetchStatus();
    refetchCommits();
    refetchBranches();
  };

  const StatusBadge = ({ count, color }: { count: number; color: string }) => {
    if (count === 0) return null;
    const colorMap: Record<string, string> = {
      blue: 'bg-blue-500/15 text-blue-500',
      green: 'bg-green-500/15 text-green-500',
      red: 'bg-red-500/15 text-red-500',
      amber: 'bg-amber-500/15 text-amber-500',
    };
    return (
      <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${colorMap[color] || colorMap.blue}`}>
        {count}
      </span>
    );
  };

  const FileList = ({ files, color }: { files: string[]; color: string }) => {
    const colorMap: Record<string, string> = {
      blue: 'text-blue-400',
      green: 'text-green-400',
      red: 'text-red-400',
      amber: 'text-amber-400',
    };
    return (
      <div className="space-y-1">
        {files.map((file) => (
          <div key={file} className="flex items-center gap-2 text-xs">
            <AnimatedIcon icon={Circle} size={6} className={colorMap[color] || colorMap.blue} fill="currentColor" />
            <span className="text-foreground truncate">{file}</span>
          </div>
        ))}
      </div>
    );
  };

  if (!status) {
    return <div className="h-full flex items-center justify-center text-muted-foreground">Loading git status...</div>;
  }

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <AnimatedIcon icon={GitBranch} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Git Integration</h1>
              <p className="text-xs text-muted-foreground">
                On branch <span className="text-primary font-medium">{status.branch}</span>
                {status.ahead > 0 && <span className="text-green-500 ml-1">↑{status.ahead}</span>}
                {status.behind > 0 && <span className="text-red-500 ml-1">↓{status.behind}</span>}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={refresh}
              className={`p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-all ${isRefreshing ? 'animate-spin' : ''}`}
            >
              <AnimatedIcon icon={RefreshCw} size={14} />
            </button>
            <button className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all">
              <AnimatedIcon icon={GitCommit} size={12} /> Commit
            </button>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-6 border-b border-border flex items-center gap-1">
        {[
          { id: 'status', label: 'Status', icon: Circle },
          { id: 'commits', label: 'Commits', icon: GitCommit },
          { id: 'branches', label: 'Branches', icon: GitBranch },
          { id: 'diff', label: 'Diff', icon: FileDiff },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === tab.id
                ? 'text-primary border-primary'
                : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            <tab.icon size={12} />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {activeTab === 'status' && (
            <motion.div
              key="status"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-6 max-w-3xl"
            >
              {/* Summary */}
              <div className="grid grid-cols-4 gap-3">
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatedIcon icon={Circle} size={14} className="text-blue-400" fill="currentColor" />
                    <span className="text-xs font-medium text-muted-foreground">Modified</span>
                  </div>
                  <span className="text-2xl font-semibold text-foreground">{status.modified.length}</span>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatedIcon icon={Circle} size={14} className="text-green-400" fill="currentColor" />
                    <span className="text-xs font-medium text-muted-foreground">Added</span>
                  </div>
                  <span className="text-2xl font-semibold text-foreground">{status.added.length}</span>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatedIcon icon={Circle} size={14} className="text-red-400" fill="currentColor" />
                    <span className="text-xs font-medium text-muted-foreground">Deleted</span>
                  </div>
                  <span className="text-2xl font-semibold text-foreground">{status.deleted.length}</span>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatedIcon icon={Circle} size={14} className="text-amber-400" fill="currentColor" />
                    <span className="text-xs font-medium text-muted-foreground">Untracked</span>
                  </div>
                  <span className="text-2xl font-semibold text-foreground">{status.untracked.length}</span>
                </div>
              </div>

              {/* File Changes */}
              <div className="space-y-4">
                {status.modified.length > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <AnimatedIcon icon={Circle} size={10} className="text-blue-400" fill="currentColor" />
                      <h3 className="text-sm font-medium text-foreground">Modified</h3>
                      <StatusBadge count={status.modified.length} color="blue" />
                    </div>
                    <FileList files={status.modified} color="blue" />
                  </div>
                )}
                {status.added.length > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <AnimatedIcon icon={Circle} size={10} className="text-green-400" fill="currentColor" />
                      <h3 className="text-sm font-medium text-foreground">Added</h3>
                      <StatusBadge count={status.added.length} color="green" />
                    </div>
                    <FileList files={status.added} color="green" />
                  </div>
                )}
                {status.deleted.length > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <AnimatedIcon icon={Circle} size={10} className="text-red-400" fill="currentColor" />
                      <h3 className="text-sm font-medium text-foreground">Deleted</h3>
                      <StatusBadge count={status.deleted.length} color="red" />
                    </div>
                    <FileList files={status.deleted} color="red" />
                  </div>
                )}
                {status.untracked.length > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <div className="flex items-center gap-2 mb-3">
                      <AnimatedIcon icon={Circle} size={10} className="text-amber-400" fill="currentColor" />
                      <h3 className="text-sm font-medium text-foreground">Untracked</h3>
                      <StatusBadge count={status.untracked.length} color="amber" />
                    </div>
                    <FileList files={status.untracked} color="amber" />
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'commits' && (
            <motion.div
              key="commits"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl"
            >
              <div className="space-y-3">
                {commits?.map((commit, index) => (
                  <div
                    key={commit.hash}
                    onClick={() => setSelectedCommit(commit)}
                    className="p-4 bg-card border border-border rounded-xl hover:border-primary/30 cursor-pointer transition-all"
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-medium">
                          {commit.author.slice(0, 2).toUpperCase()}
                        </div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-medium text-foreground">{commit.message}</h3>
                        <div className="flex items-center gap-3 mt-1 text-[10px] text-muted-foreground">
                          <span className="flex items-center gap-1">
                            <AnimatedIcon icon={User} size={9} /> {commit.author}
                          </span>
                          <span className="flex items-center gap-1">
                            <AnimatedIcon icon={Clock} size={9} /> {commit.date}
                          </span>
                          <span className="font-mono text-primary/60">{commit.hash}</span>
                        </div>
                        <div className="flex items-center gap-1.5 mt-2">
                          {commit.files.slice(0, 3).map((file) => (
                            <span key={file} className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground truncate max-w-[200px]">
                              {file.split('/').pop()}
                            </span>
                          ))}
                          {commit.files.length > 3 && (
                            <span className="text-[10px] text-muted-foreground">+{commit.files.length - 3}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'branches' && (
            <motion.div
              key="branches"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl"
            >
              <div className="space-y-2">
                {branches?.map((branch) => (
                  <div
                    key={branch.name}
                    onClick={() => setSelectedBranch(branch)}
                    className={`p-4 bg-card border rounded-xl cursor-pointer transition-all ${
                      branch.current
                        ? 'border-primary/30'
                        : 'border-border hover:border-primary/20'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <AnimatedIcon icon={GitBranch} size={16} className={branch.current ? 'text-primary' : 'text-muted-foreground'} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`text-sm font-medium ${branch.current ? 'text-primary' : 'text-foreground'}`}>
                              {branch.name}
                            </span>
                            {branch.current && (
                              <span className="px-1.5 py-0.5 rounded bg-primary/10 text-[10px] text-primary font-medium">
                                Current
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-0.5">
                            {branch.lastCommit} · {branch.lastCommitDate}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {branch.ahead > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-green-500">
                            <AnimatedIcon icon={ChevronRight} size={10} /> {branch.ahead}
                          </span>
                        )}
                        {branch.behind > 0 && (
                          <span className="flex items-center gap-1 text-[10px] text-red-500">
                            <AnimatedIcon icon={ChevronRight} size={10} className="rotate-90" /> {branch.behind}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'diff' && (
            <motion.div
              key="diff"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl"
            >
              <div className="p-4 bg-card border border-border rounded-xl">
                <div className="flex items-center gap-2 mb-4">
                  <AnimatedIcon icon={FileDiff} size={14} className="text-primary" />
                  <span className="text-sm font-medium text-foreground">Current Diff</span>
                </div>
                <div className="font-mono text-xs leading-relaxed space-y-0.5 overflow-x-auto whitespace-pre">
                  {isDiffFetching ? 'Loading diff...' : diff || 'No changes to show.'}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
