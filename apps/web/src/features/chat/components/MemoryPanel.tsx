import React from 'react';
import { Database, Clock, ArrowRight } from 'lucide-react';

interface MemoryItem {
  id: string;
  topic: string;
  snippet: string;
  timestamp: string;
}

interface MemoryPanelProps {
  memories: MemoryItem[];
}

export const MemoryPanel: React.FC<MemoryPanelProps> = ({ memories }) => {
  if (!memories || memories.length === 0) return null;

  return (
    <div className="flex flex-col bg-[#09090B] border border-[rgba(255,255,255,0.06)] rounded-md mb-4 overflow-hidden">
      <div className="flex items-center px-3 py-2 bg-[#0e1416] border-b border-[rgba(255,255,255,0.06)]">
        <Database className="w-3.5 h-3.5 text-primary mr-2" />
        <span className="text-[12px] font-mono text-[#F8FAFC]">Active Memory Context</span>
      </div>
      <div className="p-2 space-y-1 max-h-40 overflow-y-auto">
        {memories.map((mem) => (
          <div
            key={mem.id}
            className="flex items-start gap-2 p-2 hover:bg-[#18181B] rounded transition-colors group"
          >
            <Clock className="w-3 h-3 text-[#4A5059] mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between">
                <span className="text-[12px] font-medium text-[#dde4e5] truncate">{mem.topic}</span>
                <span className="text-[10px] text-[#4A5059] font-mono">{mem.timestamp}</span>
              </div>
              <p className="text-[11px] text-[#4A5059] truncate mt-0.5">{mem.snippet}</p>
            </div>
            <ArrowRight className="w-3 h-3 text-[#4A5059] opacity-0 group-hover:opacity-100 transition-opacity mt-0.5 shrink-0" />
          </div>
        ))}
      </div>
    </div>
  );
};
