import { useState, useEffect } from 'react';
import { Terminal } from './Terminal';
import { FileBrowser } from './FileBrowser';

function cn(...classes: (string | undefined | null | false)[]) {
  return classes.filter(Boolean).join(' ');
}

export function ClinePanel() {
  const [activeTab, setActiveTab] = useState<'terminal' | 'files' | 'git'>('terminal');

  return (
    <div className="flex flex-col h-full border-l border-border">
      <div className="flex border-b border-border">
        {['terminal', 'files', 'git'].map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab as any)}
            className={cn(
              'px-4 py-2 text-sm font-medium capitalize',
              activeTab === tab ? 'border-b-2 border-primary-500 text-primary-500' : 'text-text-subtle'
            )}
          >
            {tab}
          </button>
        ))}
      </div>
      <div className="flex-1 overflow-hidden">
        {activeTab === 'terminal' && <Terminal />}
        {activeTab === 'files' && <FileBrowser />}
      </div>
    </div>
  );
}
