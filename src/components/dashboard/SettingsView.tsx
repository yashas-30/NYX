import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { ShieldCheck, X, Key, Trash2 } from 'lucide-react';
import { Tooltip } from '../Tooltip';
import { UI_TEXT } from '../../lib/design-system/copy';
import { useTokenUsage } from '../../context/TokenUsageContext';

interface SettingsViewProps {
  apiKeys: Record<string, string>;
  updateApiKey: (provider: string, key: string) => void;
  unlockedKeys: Set<string>;
  securityPin: string | null;
  setPinModal: (val: any) => void;
  pinModal: { open: boolean; targetKey: string | null; mode: 'verify' | 'set'; value: string };
  handlePinInput: (digit: string) => void;
  lockAllKeys: () => void;
  toggleKeyLock: (provider: string) => void;
  clearApiKeys: () => void;
  ollamaBaseUrl: string;
  setOllamaBaseUrl: (url: string) => void;
  lmStudioBaseUrl: string;
  setLmStudioBaseUrl: (url: string) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  apiKeys,
  updateApiKey,
  unlockedKeys,
  securityPin,
  setPinModal,
  pinModal,
  handlePinInput,
  lockAllKeys,
  toggleKeyLock,
  clearApiKeys,
  ollamaBaseUrl,
  setOllamaBaseUrl,
  lmStudioBaseUrl,
  setLmStudioBaseUrl
}) => {
  const { usage, resetUsage, refreshProviderQuota } = useTokenUsage();
  const providers = ['gemini', 'openrouter', 'nvidia', 'opencode'];

  useEffect(() => {
    // Refresh quota whenever a key is unlocked and has a value
    unlockedKeys.forEach(provider => {
      const key = apiKeys[provider];
      if (key && key.length > 5) {
        refreshProviderQuota(provider, key);
      }
    });
  }, [unlockedKeys, apiKeys, refreshProviderQuota]);

  useEffect(() => {
    return () => {
      lockAllKeys();
      setPinModal({ open: false, targetKey: null, mode: 'verify', value: '' });
    };
  }, [lockAllKeys, setPinModal]);

  useEffect(() => {
    if (!pinModal.open) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        handlePinInput(e.key);
      } else if (e.key === 'Backspace') {
        setPinModal((prev: any) => ({ ...prev, value: prev.value.slice(0, -1) }));
      } else if (e.key === 'Escape') {
        setPinModal({ open: false, targetKey: null, mode: 'verify', value: '' });
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pinModal.open, handlePinInput, setPinModal]);

  const handleToggleLock = (provider: string) => {
    if (unlockedKeys.has(provider)) {
      toggleKeyLock(provider);
      return;
    }

    setPinModal({
      open: true,
      targetKey: provider,
      mode: securityPin ? 'verify' : 'set',
      value: ''
    });
  };

  return (
    <motion.div 
      key="settings" 
      initial={{ opacity: 0, y: 15 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -15 }} 
      className="h-full w-full overflow-y-auto custom-scrollbar pt-2 px-4 pb-20"
    >
      <div className="max-w-xl mx-auto">
        <header className="mb-4">
          <h2 className="text-base font-bold tracking-tight text-foreground mb-0.5">{UI_TEXT.settings.title}</h2>
          <p className="text-muted-foreground text-[6px] font-black uppercase tracking-[0.2em] opacity-40">Credentials</p>
        </header>

        <div className="space-y-2 pb-6">
          {providers.map(p => {
            const isUnlocked = unlockedKeys.has(p);
            const isPendingPin = pinModal.open && pinModal.targetKey === p;
            
            return (
              <div key={p} className="group p-2.5 rounded-[12px] bg-card border border-border-strong/50 flex items-center gap-3 hover:bg-card/80 transition-all shadow-sm">
                <div className={`w-7 h-7 shrink-0 rounded-[10px] flex items-center justify-center text-[8px] font-black uppercase transition-all ${
                  isUnlocked ? 'bg-primary text-white shadow-lg shadow-primary/20' : 'bg-muted/30 text-muted-foreground/40'
                }`}>
                  {p[0]}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1.5">
                    <p className="text-[7px] font-black uppercase tracking-[0.1em] text-muted-foreground/30">{p} secure_socket</p>
                    <div className="flex items-center gap-2">
                      {usage[p] && apiKeys[p] && apiKeys[p].trim().length > 0 && (
                        <div className="flex items-center gap-2 mr-2">
                          {usage[p].totalUSD !== undefined && (
                            <div className="flex flex-col items-end px-1.5 border-r border-border-strong/20">
                              <span className="text-[4px] font-black uppercase tracking-widest text-primary/30">USD</span>
                              <span className="text-[7px] font-mono text-primary font-bold tracking-tight">${(usage[p].totalUSD - (usage[p].usedUSD || 0)).toFixed(2)}</span>
                            </div>
                          )}
                          <div className="flex flex-col items-end px-1.5 border-r border-border-strong/20">
                            <span className="text-[4px] font-black uppercase tracking-widest text-muted-foreground/20">USED</span>
                            <span className="text-[7px] font-mono text-foreground/50 font-bold tracking-tight">{(usage[p].used / 1000).toFixed(1)}K</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[4px] font-black uppercase tracking-widest text-muted-foreground/20">REM</span>
                            <span className="text-[7px] font-mono text-emerald-500/50 font-bold tracking-tight">{(usage[p].remaining / 1000).toFixed(1)}K</span>
                          </div>
                            <button 
                            onClick={() => resetUsage(p)}
                            className="text-[4px] font-black uppercase tracking-widest text-muted-foreground/10 hover:text-destructive transition-colors ml-1.5"
                          >
                            PURGE
                          </button>
                        </div>
                      )}
                      {isUnlocked && (
                        <div className="flex items-center gap-1.5 text-emerald-500/60">
                          <ShieldCheck size={7} strokeWidth={1.5} />
                          <span className="text-[7px] font-black uppercase tracking-[0.1em]">Active</span>
                        </div>
                      )}
                    </div>
                    {isPendingPin && (
                      <span className="text-[7px] font-black uppercase tracking-[0.2em] text-primary animate-pulse">AUTHORIZING...</span>
                    )}
                  </div>
                  
                  <div className="relative group/input">
                    {isPendingPin ? (
                      <div className="flex items-center gap-2">
                        <div className="flex-1 bg-muted/10 border border-primary/20 rounded-[14px] px-3 py-2 flex items-center justify-center gap-2">
                          {[0, 1, 2, 3, 4, 5].map(i => (
                            <div 
                              key={i} 
                              className={`w-4 h-6 rounded-[8px] border flex items-center justify-center transition-all ${
                                pinModal.value.length > i 
                                  ? 'bg-primary/10 border-primary/40' 
                                  : 'bg-background/50 border-border/10'
                              }`}
                            >
                              <div className={`w-1 h-1 rounded-full ${pinModal.value.length > i ? 'bg-primary' : 'bg-muted/20'}`} />
                            </div>
                          ))}
                        </div>
                        <button 
                          onClick={() => setPinModal({ open: false, targetKey: null, mode: 'verify', value: '' })}
                          className="p-2 rounded-[14px] bg-muted/10 text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-all active:scale-95"
                        >
                          <X size={12} strokeWidth={1.5} />
                        </button>
                      </div>
                    ) : (
                      <div className="relative flex items-center group/input w-full">
                        <input 
                          type={isUnlocked ? "text" : "password"} 
                          value={apiKeys[p] || ''} 
                          readOnly={!isUnlocked}
                          onClick={() => !isUnlocked && handleToggleLock(p)}
                          onChange={e => isUnlocked && updateApiKey(p, e.target.value)} 
                          placeholder={isUnlocked ? `Enter ${p} key` : "••••••••••••••••••••••••"}
                          className={`w-full bg-muted/10 border rounded-full px-3 py-1.5 text-[8px] font-mono transition-all outline-none ${
                            isUnlocked 
                              ? 'border-primary/20 text-primary focus:border-primary/40 shadow-inner' 
                              : 'border-border text-muted-foreground/20 cursor-pointer hover:border-primary/20 hover:bg-muted/20'
                          }`} 
                        />
                        
                        <div className="absolute right-2.5 flex items-center pointer-events-auto">
                          <Tooltip content={isUnlocked ? "Lock Key" : "Unlock Credentials"}>
                            <button 
                              onClick={() => handleToggleLock(p)}
                              className={`p-1.5 rounded-full transition-all active:scale-90 ${
                                isUnlocked 
                                  ? 'bg-primary/10 text-primary shadow-sm' 
                                  : 'bg-muted/20 text-muted-foreground hover:bg-primary hover:text-white shadow-sm'
                              }`}
                            >
                               {isUnlocked ? <ShieldCheck size={10} strokeWidth={1.5} /> : <Key size={10} strokeWidth={1.5} />}
                            </button>
                          </Tooltip>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <div className="p-2.5 rounded-[12px] bg-card border border-border-strong/50 flex items-center justify-between shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-[10px] bg-primary/10 flex items-center justify-center text-primary border border-primary/10 shadow-inner">
              <ShieldCheck size={14} strokeWidth={1.5} />
            </div>
            <div>
              <h4 className="text-[10px] font-bold text-foreground">Hardware Security PIN</h4>
              <p className="text-[7px] font-mono text-muted-foreground uppercase tracking-[0.1em] mt-0.5 opacity-50">
                {securityPin ? 'Decryption key active' : 'Encryption system uninitialized'}
              </p>
            </div>
          </div>
          <button 
            onClick={() => setPinModal({ open: true, targetKey: 'GLOBAL', mode: 'set', value: '' })}
            className="px-5 py-1.5 rounded-full bg-foreground text-background text-[7px] font-black uppercase tracking-[0.1em] hover:opacity-90 transition-all active:scale-95 shadow-lg"
          >
            {securityPin ? 'Update' : 'Initialize'}
          </button>
        </div>

        {/* Local Servers Configuration */}
        <div className="mt-8 space-y-4">
          <header className="mb-4">
            <h2 className="text-base font-bold tracking-tight text-foreground mb-0.5">Local Servers</h2>
            <p className="text-muted-foreground text-[6px] font-black uppercase tracking-[0.2em] opacity-40">Local Instance Connectivity</p>
          </header>

          <div className="grid grid-cols-1 gap-4">
            {/* Ollama Base URL */}
            <div className="p-4 rounded-xl border border-border/20 bg-card/50 backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-foreground/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold">O</span>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold">Ollama API</h3>
                    <p className="text-[9px] text-muted-foreground">Base URL for local inference</p>
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={ollamaBaseUrl}
                onChange={(e) => setOllamaBaseUrl(e.target.value)}
                placeholder="http://localhost:11434"
                className="w-full bg-muted/20 border border-border/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>

            {/* LM Studio Base URL */}
            <div className="p-4 rounded-xl border border-border/20 bg-card/50 backdrop-blur-md">
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                  <div className="w-6 h-6 rounded-lg bg-foreground/10 flex items-center justify-center">
                    <span className="text-[10px] font-bold">L</span>
                  </div>
                  <div>
                    <h3 className="text-xs font-bold">LM Studio API</h3>
                    <p className="text-[9px] text-muted-foreground">Local server endpoint</p>
                  </div>
                </div>
              </div>
              <input
                type="text"
                value={lmStudioBaseUrl}
                onChange={(e) => setLmStudioBaseUrl(e.target.value)}
                placeholder="http://localhost:1234/v1"
                className="w-full bg-muted/20 border border-border/10 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-primary/50 transition-colors"
              />
            </div>
          </div>
        </div>

        <div className="mt-10 flex justify-center">
          <button 
            onClick={() => {
              if (confirm("Delete all keys?")) {
                clearApiKeys();
              }
            }}
            className="px-6 py-2.5 rounded-full bg-destructive/5 border border-destructive/10 text-destructive text-[7px] font-black uppercase tracking-[0.3em] hover:bg-destructive hover:text-white transition-all group active:scale-95"
          >
            <span className="opacity-40 group-hover:opacity-100 flex items-center gap-2">
              <Trash2 size={12} strokeWidth={1.5} />
              PURGE CORE
            </span>
          </button>
        </div>
      </div>

      <AnimatePresence>
        {pinModal.open && pinModal.targetKey === 'GLOBAL' && (
          <div className="fixed inset-0 z-[300] flex items-center justify-center bg-background/90 backdrop-blur-3xl">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.9 }}
              className="bg-card border border-border rounded-[20px] p-6 flex flex-col items-center max-w-[240px] shadow-2xl relative overflow-hidden"
            >
               <div className="mb-6 text-center">
                <h3 className="text-[8px] font-black uppercase tracking-[0.3em] text-primary mb-1">Authorize</h3>
                <p className="text-[7px] font-mono text-muted-foreground uppercase tracking-[0.1em] opacity-40">Enter 6-digit decryption key</p>
              </div>
              <div className="flex gap-1.5 mb-6">
                {[0, 1, 2, 3, 4, 5].map(i => (
                  <div key={i} className={`w-7 h-10 rounded-[10px] border flex items-center justify-center transition-all ${pinModal.value.length > i ? 'bg-primary/10 border-primary/40' : 'bg-muted/10 border-border/10'}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${pinModal.value.length > i ? 'bg-primary' : 'bg-muted-foreground/10'}`} />
                  </div>
                ))}
              </div>
               <div className="grid grid-cols-3 gap-2 w-full">
                {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'RST', 0, 'ESC'].map(n => (
                  <button 
                    key={n} 
                    onClick={() => { 
                      if(n === 'RST') setPinModal((prev: any) => ({ ...prev, value: '' }));
                      else if(n === 'ESC') setPinModal((prev: any) => ({ ...prev, open: false }));
                      else handlePinInput(n.toString());
                    }} 
                    className={`h-10 rounded-[10px] text-xs font-bold transition-all active:scale-90 ${
                      typeof n === 'number' ? 'bg-muted/10 border border-border-strong/50 text-foreground hover:bg-primary/10 hover:border-primary/20' : 'text-[6px] font-black uppercase tracking-widest text-muted-foreground/30 hover:text-foreground'
                    }`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
