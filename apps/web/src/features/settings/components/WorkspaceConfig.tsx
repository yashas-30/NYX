// fallow-ignore-file code-duplication
import React from 'react';
import { motion } from 'framer-motion';
import { Globe } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface WorkspaceConfigProps {
  workspacePath: string;
  setWorkspacePath: React.Dispatch<React.SetStateAction<string>>;
}

export const WorkspaceConfig: React.FC<WorkspaceConfigProps> = ({
  workspacePath,
  setWorkspacePath,
}) => {
  const handleSelectWorkspace = async () => {
    try {
      const res = await fetchWithAuth('/api/v1/workspace/select', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setWorkspacePath(data.workspace);
          toast.success(`Active workspace updated: ${data.workspace}`);
        } else if (data.fallback) {
          toast.info('Please enter the workspace directory path in the text field.');
        }
      }
    } catch (error: any) {
      toast.error(`Directory selection failed: ${error.message}`);
    }
  };

  const handleInputWorkspace = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val) {
        try {
          const res = await fetchWithAuth('/api/v1/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: val }),
          });
          if (res.ok) {
            const data = await res.json();
            setWorkspacePath(data.workspace);
            toast.success(`Workspace updated to: ${data.workspace}`);
            e.currentTarget.value = '';
          } else {
            const err = await res.json();
            toast.error(`Error: ${err.error}`);
          }
        } catch (error: any) {
          toast.error(`Failed to update workspace: ${error.message}`);
        }
      }
    }
  };

  return (
    <div className="mt-6 group p-5 rounded-md bg-card border border-border hover:border-accent/25 transition-all duration-300 relative overflow-hidden shadow-sm border border-border">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            WORKSPACE CONFIGURATOR
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">Codebase Scanning Scope</h3>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
          File Index Target
        </span>
      </div>

      <div className="space-y-3">
        <div className="p-3 border border-border rounded-md bg-secondary/10">
          <div className="flex justify-between items-center mb-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground/80">
            <span>Active Scanning Directory</span>
          </div>
          <div className="text-[11px] font-mono text-foreground/90 select-all break-all bg-secondary/40 border border-border rounded-md p-2.5 leading-normal">
            {workspacePath || 'Loading...'}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSelectWorkspace}
            className="flex-1 py-2 px-4 rounded-md bg-accent hover:bg-accent/90 text-white text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-sm flex items-center justify-center gap-1.5"
          >
            <Globe size={12} />
            Select Directory
          </motion.button>

          <input
            type="text"
            placeholder="Or paste absolute directory path..."
            onKeyDown={handleInputWorkspace}
            className="flex-[2] bg-background border border-border rounded-md px-3.5 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-accent/50 shadow-inner"
          />
        </div>

        <p className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1">
          Specifies the root directory for RAG codebase search indexing and terminal execution.
          Clicking "Select Directory" opens the native OS folder picker.
        </p>
      </div>
    </div>
  );
};
