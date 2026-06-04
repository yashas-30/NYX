import React, { useState } from 'react';
import { Keyboard, Plus, X } from 'lucide-react';
import { useHotkeys } from 'react-hotkeys-hook';

interface Hotkey {
  id: string;
  action: string;
  keys: string;
}

export const HotkeyManager: React.FC = () => {
  const [hotkeys, setHotkeys] = useState<Hotkey[]>([
    { id: '1', action: 'Toggle Sidebar', keys: 'ctrl+b' },
    { id: '2', action: 'Global Search', keys: 'ctrl+p' },
    { id: '3', action: 'Run Code', keys: 'ctrl+enter' },
  ]);

  const [newAction, setNewAction] = useState('');
  const [newKeys, setNewKeys] = useState('');

  // Register hotkeys globally inside the manager for demonstration (in a real app, you'd register these in a root provider)
  useHotkeys('ctrl+b', () => console.log('Toggled Sidebar!'), { preventDefault: true });

  const addHotkey = () => {
    if (newAction && newKeys) {
      setHotkeys([...hotkeys, { id: Date.now().toString(), action: newAction, keys: newKeys }]);
      setNewAction('');
      setNewKeys('');
    }
  };

  const removeHotkey = (id: string) => {
    setHotkeys(hotkeys.filter((h) => h.id !== id));
  };

  return (
    <div className="bg-card border border-border rounded-3xl p-6 shadow-sm mb-4">
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
            className="flex items-center justify-between bg-secondary/20 border border-border p-3 rounded-xl"
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
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground focus:outline-none focus:border-accent/50"
            value={newAction}
            onChange={(e) => setNewAction(e.target.value)}
          />
          <input
            placeholder="Keys (e.g. ctrl+s)"
            className="flex-1 bg-background border border-border rounded-xl px-3 py-2 text-xs text-foreground font-mono uppercase focus:outline-none focus:border-accent/50"
            value={newKeys}
            onChange={(e) => setNewKeys(e.target.value)}
          />
          <button
            onClick={addHotkey}
            className="bg-secondary border border-border hover:bg-secondary/80 text-foreground p-2 rounded-xl transition-all"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};
