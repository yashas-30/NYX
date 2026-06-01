import React, { useState } from 'react';
import { ChevronDown, ChevronRight, Brain } from 'lucide-react';

interface ThinkingBlockProps {
  content: string;
  isComplete?: boolean;
}

export const ThinkingBlock: React.FC<ThinkingBlockProps> = ({ content, isComplete = true }) => {
  const [isExpanded, setIsExpanded] = useState(!isComplete);

  if (!content) return null;

  return (
    <div className="my-2 border border-[rgba(255,255,255,0.06)] rounded bg-[#09090B] overflow-hidden">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between px-3 py-2 text-left bg-[#0e1416] hover:bg-[#18181B] transition-colors"
      >
        <div className="flex items-center gap-2">
          <Brain className={`w-4 h-4 ${!isComplete ? 'text-[#FF3366] animate-pulse' : 'text-[#4A5059]'}`} />
          <span className={`text-[13px] font-mono font-medium ${!isComplete ? 'text-[#F8FAFC]' : 'text-[#4A5059]'}`}>
            {!isComplete ? 'Agent is thinking...' : 'Reasoning Process'}
          </span>
        </div>
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-[#4A5059]" />
        ) : (
          <ChevronRight className="w-4 h-4 text-[#4A5059]" />
        )}
      </button>

      {isExpanded && (
        <div className="p-3 border-t border-[rgba(255,255,255,0.06)] bg-[#09090B]">
          <pre className="text-[13px] text-[#4A5059] font-mono whitespace-pre-wrap leading-relaxed">
            {content}
          </pre>
        </div>
      )}
    </div>
  );
};
