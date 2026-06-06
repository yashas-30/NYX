import { useState, useMemo } from 'react';
import { useKeyboardShortcuts } from '../hooks/useKeyboardShortcuts';

interface Command {
  id: string;
  title: string;
  shortcut?: string;
  icon: React.ReactNode;
  action: () => void;
  category: string;
}

// Placeholders for icons
const SearchIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" /></svg>;
const PlusIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>;
const TrashIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>;
const DownloadIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>;
const SettingsIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /></svg>;
const DatabaseIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" /></svg>;
const SunIcon = ({ className }: { className?: string }) => <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" /></svg>;

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');

  useKeyboardShortcuts([
    { key: 'k', ctrl: true, handler: () => setOpen(true), description: 'Open command palette' }
  ]);

  const commands: Command[] = useMemo(() => [
    { id: 'new-chat', title: 'New Chat', shortcut: 'Ctrl+N', icon: <PlusIcon className="w-4 h-4" />, action: () => {}, category: 'Chat' },
    { id: 'clear-chat', title: 'Clear Chat', icon: <TrashIcon className="w-4 h-4" />, action: () => {}, category: 'Chat' },
    { id: 'export', title: 'Export Chat', shortcut: 'Ctrl+Shift+E', icon: <DownloadIcon className="w-4 h-4" />, action: () => {}, category: 'Chat' },
    { id: 'settings', title: 'Open Settings', icon: <SettingsIcon className="w-4 h-4" />, action: () => {}, category: 'App' },
    { id: 'models', title: 'Model Registry', icon: <DatabaseIcon className="w-4 h-4" />, action: () => {}, category: 'App' },
    { id: 'toggle-theme', title: 'Toggle Theme', icon: <SunIcon className="w-4 h-4" />, action: () => {}, category: 'Appearance' },
  ], []);

  const filtered = useMemo(() => {
    if (!search) return commands;
    const lower = search.toLowerCase();
    return commands.filter(c => 
      c.title.toLowerCase().includes(lower) ||
      c.category.toLowerCase().includes(lower)
    );
  }, [commands, search]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh]">
      <div className="absolute inset-0 bg-black/50" onClick={() => setOpen(false)} />
      <div className="relative w-full max-w-2xl bg-surface rounded-md shadow-sm border border-border border border-border overflow-hidden">
        <div className="flex items-center px-4 py-3 border-b border-border">
          <SearchIcon className="w-5 h-5 text-text-subtle" />
          <input
            autoFocus
            className="flex-1 ml-3 bg-transparent outline-none text-text placeholder:text-text-subtle"
            placeholder="Search commands..."
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
          <kbd className="px-2 py-1 rounded bg-surface-hover text-xs text-text-subtle">ESC</kbd>
        </div>
        <div className="max-h-[400px] overflow-y-auto py-2">
          {filtered.map((cmd) => (
            <button
              key={cmd.id}
              className="w-full flex items-center px-4 py-2.5 hover:bg-surface-hover transition-colors"
              onClick={() => { cmd.action(); setOpen(false); }}
            >
              <span className="text-text-subtle">{cmd.icon}</span>
              <span className="ml-3 text-sm text-text">{cmd.title}</span>
              <span className="ml-auto text-xs text-text-subtle">{cmd.category}</span>
              {cmd.shortcut && (
                <kbd className="ml-2 px-1.5 py-0.5 rounded bg-surface-hover text-xs text-text-subtle">
                  {cmd.shortcut}
                </kbd>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
