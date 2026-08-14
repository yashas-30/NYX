import React, { memo, useState } from 'react';
import { ChevronDownIcon as ChevronDown } from '@animateicons/react/lucide';

interface CollapsibleUserTextProps {
  content: string;
}

/**
 * Renders user message text with optional collapse/expand for messages > 350 chars.
 * Extracted from the IIFE in MessageBubble's user branch.
 */
export const CollapsibleUserText: React.FC<CollapsibleUserTextProps> = memo(({ content }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const shouldCollapse = content.length > 350;
  const displayText =
    shouldCollapse && !isExpanded ? content.slice(0, 300) + '...' : content;

  return (
    <>
      <div className="text-[14.5px] font-sans font-normal leading-relaxed text-slate-200 dark:text-slate-100 select-text whitespace-pre-wrap tracking-tight">
        {displayText}
      </div>
      {shouldCollapse && (
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="mt-2 text-[10px] font-mono font-bold uppercase tracking-wider text-accent hover:text-accent/80 transition-all cursor-pointer flex items-center gap-1.5 outline-none select-none"
        >
          <span>{isExpanded ? 'Show Less' : 'Show More'}</span>
          <ChevronDown
            size={10}
            className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180' : 'rotate-0'}`}
          />
        </button>
      )}
    </>
  );
});
CollapsibleUserText.displayName = 'CollapsibleUserText';
