import React, { useState, useEffect, useCallback } from 'react';
import { PlusIcon as Plus, XIcon as X } from '@animateicons/react/lucide';
import { Keyboard } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';

interface Hotkey {
  id: string;
  action: string;
  keys: string;
}

const STORAGE_KEY = 'nyx_hotkeys';

const DEFAULT_HOTKEYS: Hotkey[] = [
  { id: 'builtin-sidebar', action: 'Toggle Sidebar', keys: 'ctrl+b' },
  { id: 'builtin-search', action: 'Global Search', keys: 'ctrl+p' },
  { id: 'builtin-run', action: 'Run Code', keys: 'ctrl+enter' },
];

function loadHotkeys(): Hotkey[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch {
    // ignore corrupt storage
  }
  return DEFAULT_HOTKEYS;
}

function saveHotkeys(hotkeys: Hotkey[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(hotkeys));
  } catch {
    // ignore quota errors
  }
}

export const HotkeyManager: React.FC = () => {
  const [hotkeys, setHotkeys] = useState<Hotkey[]>(loadHotkeys);
  const [newAction, setNewAction] = useState('');
  const [newKeys, setNewKeys] = useState('');

  // Wire built-in sidebar toggle to a custom DOM event that layout components can listen to.
  useHotkeys(
    'ctrl+b',
    () => window.dispatchEvent(new CustomEvent('nyx:toggle-sidebar')),
    { preventDefault: true }
  );

  const updateHotkeys = useCallback((next: Hotkey[]) => {
    setHotkeys(next);
    saveHotkeys(next);
  }, []);

  const addHotkey = () => {
    if (!newAction.trim() || !newKeys.trim()) return;
    const next: Hotkey[] = [
      ...hotkeys,
      { id: crypto.randomUUID(), action: newAction.trim(), keys: newKeys.trim() },
    ];
    updateHotkeys(next);
    setNewAction('');
    setNewKeys('');
  };

  const removeHotkey = (id: string) => {
    updateHotkeys(hotkeys.filter((h) => h.id !== id));
  };

  return (
    <div className="bg-card border border-border rounded-md p-6 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-4">
        <Keyboard size={16} className="text-accent" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">
          Global Hotkeys
        </h3>
      </div>

      <div className="space-y-3">
        {hotkeys.map((hk) => (
          <div
            key={hk.id}
            className="flex items-center justify-between bg-secondary/20 border border-border p-3 rounded-md"
          >
            <span className="text-xs font-semibold text-foreground">{hk.action}</span>
            <div className="flex items-center gap-3">
              <kbd className="px-2 py-1 bg-secondary/40 border border-border rounded font-mono text-[10px] text-accent uppercase">
                {hk.keys}
              </kbd>
              <button
                onClick={() => removeHotkey(hk.id)}
                className="text-muted-foreground hover:text-red-400 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
          </div>
        ))}

        <div className="flex items-center gap-2 pt-3 border-t border-border">
          <input
            placeholder="Action (e.g. Save File)"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent/50"
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHotkey()}
          />
          <input
            placeholder="Keys (e.g. ctrl+s)"
            className="flex-1 bg-background border border-border rounded-md px-3 py-2 text-xs text-foreground font-mono uppercase focus:outline-none focus:border-accent/50"
            value={newKeys}
            onChange={(e) => setNewKeys(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addHotkey()}
          />
          <button
            onClick={addHotkey}
            className="bg-secondary border border-border hover:bg-secondary/80 text-foreground p-2 rounded-md transition-all"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
