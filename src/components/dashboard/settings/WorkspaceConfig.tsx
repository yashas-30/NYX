import React from 'react';
import { motion } from 'motion/react';
import { Globe } from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

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
      const res = await fetch('/api/workspace/select', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        if (data.workspace) {
          setWorkspacePath(data.workspace);
          toast.success(`Active workspace updated: ${data.workspace}`);
        } else if (data.fallback) {
          toast.info('Please enter the workspace directory path in the text field.');
        }
      }
    } catch (e: any) {
      toast.error(`Directory selection failed: ${e.message}`);
    }
  };

  const handleInputWorkspace = async (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = e.currentTarget.value.trim();
      if (val) {
        try {
          const res = await fetch('/api/workspace', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: val })
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
        } catch (err: any) {
          toast.error(`Failed to update workspace: ${err.message}`);
        }
      }
    }
  };

  return (
    <div className="mt-6 group p-5 rounded-3xl bg-card border border-white/[0.04] hover:border-[#22D3EE]/25 transition-all duration-300 relative overflow-hidden shadow-lg">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#22D3EE]/20 via-[#22D3EE]/10 to-[#22D3EE]/20 opacity-70 group-hover:opacity-100 transition-opacity" />
      
      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#22D3EE]">WORKSPACE CONFIGURATOR</p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">Codebase Scanning Scope</h3>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-[#22D3EE] bg-[#22D3EE]/10 px-2 py-0.5 rounded-full border border-[#22D3EE]/20">
          File Index Target
        </span>
      </div>

      <div className="space-y-3">
        <div className="p-3 border border-white/10 rounded-xl bg-white/[0.01]">
          <div className="flex justify-between items-center mb-1 text-[9px] font-black uppercase tracking-wider text-muted-foreground/80">
            <span>Active Scanning Directory</span>
          </div>
          <div className="text-[11px] font-mono text-foreground/90 select-all break-all bg-black/30 border border-white/5 rounded-lg p-2.5 leading-normal">
            {workspacePath || 'Loading...'}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-2">
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={handleSelectWorkspace}
            className="flex-1 py-2 px-4 rounded-xl bg-[#22D3EE] hover:bg-[#22D3EE]/90 text-black text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer shadow-md flex items-center justify-center gap-1.5"
          >
            <Globe size={12} />
            Select Directory
          </motion.button>
          
          <input
            type="text"
            placeholder="Or paste absolute directory path..."
            onKeyDown={handleInputWorkspace}
            className="flex-[2] bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-[#22D3EE]/50 shadow-inner"
          />
        </div>
        
        <p className="text-[10px] text-muted-foreground/80 leading-relaxed mt-1">
          Specifies the root directory for RAG codebase search indexing and terminal execution. Clicking "Select Directory" opens the native OS folder picker.
        </p>
      </div>
    </div>
  );
};
