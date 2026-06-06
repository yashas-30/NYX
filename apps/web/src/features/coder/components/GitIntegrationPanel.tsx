import React, { useState, useEffect } from 'react';
import { GitBranch, GitCommit, GitPullRequest, RefreshCw } from 'lucide-react';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

export const GitIntegrationPanel: React.FC = () => {
  const [branch, setBranch] = useState('loading...');
  const [status, setStatus] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [commitMessage, setCommitMessage] = useState('');

  const fetchGitStatus = async () => {
    setIsLoading(true);
    try {
      const branchRes = await fetchWithAuth('/api/v1/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'git rev-parse --abbrev-ref HEAD' }),
      });
      const branchData = await branchRes.json();
      setBranch((branchData.stdout || '').trim() || 'unknown');

      const statusRes = await fetchWithAuth('/api/v1/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: 'git status -s' }),
      });
      const statusData = await statusRes.json();
      const files = (statusData.stdout || '').trim().split('\n').filter(Boolean);
      setStatus(files);
    } catch (e) {
      console.error(e);
      setBranch('error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchGitStatus();
  }, []);

  const handleCommit = async () => {
    if (!commitMessage.trim()) return;
    setIsLoading(true);
    try {
      await fetchWithAuth('/api/v1/terminal/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          command: `git add . && git commit -m "${commitMessage.replace(/"/g, '\\"')}"`,
        }),
      });
      setCommitMessage('');
      await fetchGitStatus();
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#111622] border-t border-white/5 font-sans text-xs">
      <div className="flex items-center justify-between px-4 py-2 border-b border-white/5">
        <div className="flex items-center gap-2 font-bold uppercase tracking-wider text-zinc-400 text-[10px]">
          <GitBranch size={12} className="text-[#FF3366]" />
          <span>Git Management</span>
        </div>
        <button
          onClick={fetchGitStatus}
          className="p-1 rounded hover:bg-white/5 text-zinc-500 hover:text-cyan-400"
        >
          <RefreshCw size={12} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4">
        <div className="flex items-center gap-2 bg-white/[0.02] border border-white/5 p-2 rounded-md">
          <GitBranch size={14} className="text-zinc-500" />
          <span className="text-zinc-300 font-mono text-[11px]">{branch}</span>
        </div>

        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-zinc-500 mb-2">
            Changes
          </div>
          {status.length === 0 ? (
            <div className="text-zinc-600 italic text-xs">No changes detected</div>
          ) : (
            <div className="flex flex-col gap-1 max-h-32 overflow-y-auto custom-scrollbar">
              {status.map((file, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 font-mono text-[10px] text-zinc-400"
                >
                  <span className="text-[#FF3366]">{file.substring(0, 2)}</span>
                  <span>{file.substring(3)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-col gap-2 mt-auto">
          <input
            type="text"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Commit message..."
            className="w-full bg-black border border-white/5 rounded-md px-3 py-2 text-zinc-300 placeholder:text-zinc-700 outline-none focus:border-[#FF3366]/50 transition-colors"
          />
          <button
            onClick={handleCommit}
            disabled={isLoading || !commitMessage.trim()}
            className="flex items-center justify-center gap-2 w-full bg-[#FF3366] text-black font-bold uppercase tracking-wider text-[10px] py-2 rounded-md hover:bg-[#FF3366]/90 disabled:opacity-50 transition-colors"
          >
            <GitCommit size={14} />
            <span>Commit All</span>
          </button>
        </div>
      </div>
    </div>
  );
};
