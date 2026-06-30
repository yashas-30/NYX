// fallow-ignore-file code-duplication
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { KeyIcon as Key, ChevronUpIcon as ChevronUp, ChevronDownIcon as ChevronDown, Trash2Icon as Trash2, EyeIcon as Eye, EyeOffIcon as EyeOff, CheckIcon as Check, XIcon as X } from '@animateicons/react/lucide';
import { Network, Loader2 } from 'lucide-react';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';

interface ProviderConfig {
  id: string;
  name: string;
  hasModels: boolean;
  modelCount: number;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: 'gemini', name: 'Google Gemini', hasModels: true, modelCount: 0 },
  { id: 'openrouter', name: 'OpenRouter', hasModels: true, modelCount: 0 },
  { id: 'tavily', name: 'Tavily Search API', hasModels: false, modelCount: 0 },
  { id: 'jina', name: 'Jina Search API', hasModels: false, modelCount: 0 },
  {
    id: 'scrapling',
    name: 'Scrapling Search & Scraper (Local / Cloud)',
    hasModels: false,
    modelCount: 0,
  },
];

const DEFAULT_GATEWAY_URLS: Record<string, string> = {
  gemini: 'https://generativelanguage.googleapis.com/v1beta',
  scrapling: 'http://127.0.0.1:3002',
};

const getModelCountForProvider = (provider: string): number => {
  return AVAILABLE_MODELS.filter((m) => m.provider === provider).length;
};

interface ApiKeyVaultProps {
  apiKeys: Record<string, string>;
  vaultStatus: Record<string, boolean>;
  keysInput: Record<string, string>;
  setKeysInput: React.Dispatch<React.SetStateAction<Record<string, string>>>;
  expandedProvider: string | null;
  toggleExpanded: (providerId: string) => void;
  fetchVaultStatus: () => Promise<void>;
  clearApiKeys: () => void;
}

export const ApiKeyVault: React.FC<ApiKeyVaultProps> = ({
  apiKeys,
  vaultStatus,
  keysInput,
  setKeysInput,
  expandedProvider,
  toggleExpanded,
  fetchVaultStatus,
  clearApiKeys,
}) => {
  const { usage, resetUsage } = useTokenUsage();
  const rememberKeys = useNyxStore((state) => state.rememberKeys);
  const setRememberKeys = useNyxStore((state) => state.setRememberKeys);
  const updateApiKey = useNyxStore((state) => state.updateApiKey);

  const [visibleKeys, setVisibleKeys] = React.useState<Record<string, boolean>>({});

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const [validationStatus, setValidationStatus] = React.useState<Record<string, 'idle' | 'loading' | 'valid' | 'invalid'>>({});
  const validationTimeoutRef = React.useRef<Record<string, NodeJS.Timeout>>({});
  const revertTimeoutRef = React.useRef<Record<string, NodeJS.Timeout>>({});

  const providers = PROVIDER_CONFIGS.map((p) => ({
    ...p,
    modelCount: getModelCountForProvider(p.id),
  }));

  const getGatewayUrl = (provider: string): string => {
    return DEFAULT_GATEWAY_URLS[provider] || '';
  };

  const validateGeminiKey = async (key: string): Promise<{ valid: boolean; error?: string }> => {
    try {
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`, {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        return { valid: false, error: data.error?.message || `Server returned status ${res.status}` };
      }
      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Network error' };
    }
  };
  const triggerValidation = (provider: string, key: string) => {
    if (!key) {
      setValidationStatus(prev => ({ ...prev, [provider]: 'idle' }));
      return;
    }
    
    if (validationTimeoutRef.current[provider]) {
      clearTimeout(validationTimeoutRef.current[provider]);
    }
    if (revertTimeoutRef.current[provider]) {
      clearTimeout(revertTimeoutRef.current[provider]);
    }

    setValidationStatus(prev => ({ ...prev, [provider]: 'loading' }));

    validationTimeoutRef.current[provider] = setTimeout(async () => {
      let isValid = true;
      if (provider === 'gemini') {
        const result = await validateGeminiKey(key);
        isValid = result.valid;
      }
      
      setValidationStatus(prev => ({ ...prev, [provider]: isValid ? 'valid' : 'invalid' }));

      revertTimeoutRef.current[provider] = setTimeout(() => {
        setValidationStatus(prev => ({ ...prev, [provider]: 'idle' }));
      }, 2000);
    }, 800);
  };

  const handleSaveToVault = async () => {
    // Validate Gemini key if it's being updated
    const geminiKey = keysInput['gemini'];
    let isGeminiValid = true;
    let validationError = '';
    if (geminiKey && geminiKey.trim().length > 0) {
      toast.info('Validating Gemini API Key...');
      const result = await validateGeminiKey(geminiKey);
      isGeminiValid = result.valid;
      validationError = result.error || '';

      if (!isGeminiValid) {
        const isNetworkErr = 
          validationError.toLowerCase().includes('connection') || 
          validationError.toLowerCase().includes('fetch') || 
          validationError.toLowerCase().includes('unreachable') ||
          validationError.toLowerCase().includes('timeout') ||
          validationError.toLowerCase().includes('starting') ||
          validationError.toLowerCase().includes('retry') ||
          validationError.toLowerCase().includes('status 5');

        if (isNetworkErr) {
          toast.warning(`Could not reach validation server (${validationError}). Saving key anyway...`);
          isGeminiValid = true; // Allow saving since it's a network issue, not necessarily a bad key
        } else {
          const forceSave = await confirm(
            `Gemini API Key validation failed: ${validationError}\n\nDo you want to save this key anyway? (It might be valid but unreachable from the server, or restricted by region/permissions)`,
            { title: 'Validation Failed', kind: 'warning' }
          );
          if (forceSave) {
            isGeminiValid = true;
            toast.warning('Saving API Key despite validation failure.');
          } else {
            toast.error(`Invalid Gemini API Key: ${validationError}. It will not be saved.`);
          }
        }
      } else {
        toast.success('Gemini API Key validated successfully.');
      }
    }

    const keysToSave = { ...keysInput };
    if (!isGeminiValid) {
      delete keysToSave['gemini'];
      // Clear the invalid key from input so it doesn't keep triggering on subsequent applies
      setKeysInput((prev) => {
        const next = { ...prev };
        delete next['gemini'];
        return next;
      });
    }

    if (Object.keys(keysToSave).filter((k) => keysToSave[k]?.trim().length > 0).length === 0) {
      return;
    }

    if (!rememberKeys) {
      // Save keys ephemerally to Zustand in-memory state
      for (const provider of Object.keys(keysToSave)) {
        const val = keysToSave[provider];
        if (val !== undefined && val.trim().length > 0) {
          await updateApiKey(provider, val);
        }
      }
      toast.success('API keys applied ephemerally (memory-only)!');
      setKeysInput((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(keysToSave)) delete next[k];
        return next;
      });
      return;
    }

    try {
      let allSuccess = true;
      for (const provider of Object.keys(keysToSave)) {
        const val = keysToSave[provider];
        if (val !== undefined && val.trim().length > 0) {
          const res: any = await invoke('vault:store-key', { payload: { provider, key: val } });
          if (res.success) {
            await updateApiKey(provider, val);
          } else {
            allSuccess = false;
            toast.error(`Failed to save ${provider} key: ${res.error}`);
          }
        } else if (val === '') {
          await invoke('vault:delete-key', { payload: { provider } });
        }
      }

      if (allSuccess) {
        toast.success('API keys successfully saved to secure server vault!');
        setKeysInput((prev) => {
          const next = { ...prev };
          for (const k of Object.keys(keysToSave)) delete next[k];
          return next;
        });
        await fetchVaultStatus();
      }
    } catch (error: any) {
      toast.error(`Error saving keys: ${error.message}`);
    }
  };

  const handlePurgeVault = async () => {
    const shouldDelete = await confirm('Delete all keys from server vault?', { title: 'Confirm Deletion', kind: 'warning' });
    if (shouldDelete) {
      try {
        const allProviders = ['gemini', 'openrouter', 'tavily', 'jina', 'scrapling', 'scrapling_url'];
        for (const provider of allProviders) {
          await invoke('vault:delete-key', { payload: { provider } });
        }
        toast.success('All API keys removed from server vault');
        await fetchVaultStatus();
        clearApiKeys();
      } catch (error: any) {
        toast.error(`Error: ${error.message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Remember Keys Opt-in */}
      <div className="p-4 rounded-xl bg-secondary/40 border border-border flex items-center justify-between gap-4 select-none">
        <div className="flex-1">
          <p className="text-[10px] font-black uppercase tracking-[0.1em] text-foreground/80">
            Remember Keys on this Device
          </p>
          <p className="text-[8px] text-muted-foreground/50 mt-0.5 leading-normal">
            Encrypts and persists keys in local system keychain using Native safeStorage
            (DPAPI/TPM). If disabled, keys are kept ephemerally in RAM and wiped on close.
          </p>
        </div>
        <label className="relative inline-flex items-center cursor-pointer">
          <input
            type="checkbox"
            checked={rememberKeys}
            onChange={(e) => {
              setRememberKeys(e.target.checked);
              if (e.target.checked) {
                toast.success('Safe Storage Enabled: API keys will be secured in device keychain.');
              } else {
                toast.info('Safe Storage Disabled: API keys will be ephemeral (memory only).');
              }
            }}
            className="sr-only peer"
          />
          <div className="w-9 h-5 bg-muted peer-focus:outline-none rounded-md peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-muted-foreground/60 after:border-border after:border after:rounded-md after:h-4 after:w-4 after:transition-all peer-checked:bg-accent peer-checked:after:bg-card" />
        </label>
      </div>

      <div className="space-y-2">
        {providers.map((p) => {
          const hasKey = vaultStatus[p.id] || !!(apiKeys[p.id] && apiKeys[p.id].trim().length > 0);
          const isExpanded = expandedProvider === p.id;
          const providerUsage = usage[p.id];

          return (
            <div
              key={p.id}
              className="group p-4 rounded-xl bg-card border border-border hover:border-accent/30 transition-all duration-300 shadow-sm hover:shadow-sm"
            >
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 shrink-0 rounded-[10px] flex items-center justify-center text-[10px] font-black uppercase bg-accent/10 text-accent border border-accent/20">
                  {p.name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-muted-foreground/80">
                        {p.name}
                      </p>
                      {hasKey && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-1.5 py-0.5 rounded-md border border-accent/20">
                          {vaultStatus[p.id] ? 'Vault Locked' : 'In Memory'}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {providerUsage && hasKey && (
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-[10px] font-bold">
                          <button
                            onClick={() => resetUsage(p.id)}
                            className="px-2 py-0.5 rounded bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 text-[9px] font-black uppercase tracking-widest transition-colors cursor-pointer"
                          >
                            PURGE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    {p.id === 'scrapling' ? (
                      <div className="flex flex-col gap-2.5 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black uppercase text-muted-foreground/60 w-16 shrink-0">
                            API Key:
                          </span>
                          <div className="relative flex-1 flex items-center">
                            <input
                              type={visibleKeys['scrapling'] ? 'text' : 'password'}
                              value={keysInput['scrapling'] ?? apiKeys['scrapling'] ?? ''}
                              onChange={(e) => {
                                setKeysInput((prev) => ({ ...prev, scrapling: e.target.value }));
                                triggerValidation('scrapling', e.target.value);
                              }}
                              placeholder={
                                vaultStatus['scrapling']
                                  ? '•••••••••••••••• (Optional for Local)'
                                  : 'Enter Scrapling API Key (Optional for Local)'
                              }
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  e.currentTarget.blur();
                                }
                              }}
                              className="w-full bg-background border border-border rounded-md pl-3.5 pr-10 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-accent/50 shadow-inner"
                            />
                            <button
                              type="button"
                              onClick={() => {
                                if ((validationStatus['scrapling'] || 'idle') === 'idle') {
                                  toggleVisibility('scrapling');
                                }
                              }}
                              className={`absolute right-2.5 transition-colors ${(validationStatus['scrapling'] || 'idle') === 'idle' ? 'text-muted-foreground/80 hover:text-foreground cursor-pointer' : 'text-muted-foreground/40 cursor-default'}`}
                              title={(validationStatus['scrapling'] || 'idle') === 'idle' ? (visibleKeys['scrapling'] ? 'Hide API key' : 'Show API key') : undefined}
                            >
                              {(validationStatus['scrapling'] || 'idle') === 'loading' && <Loader2 size={12} className="animate-spin text-accent" />}
                              {(validationStatus['scrapling'] || 'idle') === 'valid' && <Check size={12} className="text-emerald-400" />}
                              {(validationStatus['scrapling'] || 'idle') === 'invalid' && <X size={12} className="text-red-400" />}
                              {(validationStatus['scrapling'] || 'idle') === 'idle' && (visibleKeys['scrapling'] ? <EyeOff size={12} /> : <Eye size={12} />)}
                            </button>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[8px] font-black uppercase text-muted-foreground/60 w-16 shrink-0">
                            Service URL:
                          </span>
                          <input
                            type="text"
                            value={keysInput['scrapling_url'] ?? apiKeys['scrapling_url'] ?? ''}
                            onChange={(e) =>
                              setKeysInput((prev) => ({ ...prev, scrapling_url: e.target.value }))
                            }
                            placeholder="http://127.0.0.1:3002"
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                e.currentTarget.blur();
                              }
                            }}
                            className="flex-1 bg-background border border-border rounded-md px-3.5 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-accent/50 shadow-inner"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="relative flex-1 flex items-center">
                        <input
                          type={visibleKeys[p.id] ? 'text' : 'password'}
                          value={keysInput[p.id] ?? apiKeys[p.id] ?? ''}
                          onChange={(e) => {
                            setKeysInput((prev) => ({ ...prev, [p.id]: e.target.value }));
                            triggerValidation(p.id, e.target.value);
                          }}
                          placeholder={hasKey ? '••••••••••••••••' : `Enter ${p.name} API key`}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              e.currentTarget.blur();
                            }
                          }}
                          className="w-full bg-background border border-border rounded-md pl-3.5 pr-10 py-2 text-[10px] font-mono transition-all outline-none text-foreground/80 focus:border-accent/50 shadow-inner"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if ((validationStatus[p.id] || 'idle') === 'idle') {
                              toggleVisibility(p.id);
                            }
                          }}
                          className={`absolute right-2.5 transition-colors ${(validationStatus[p.id] || 'idle') === 'idle' ? 'text-muted-foreground/80 hover:text-foreground cursor-pointer' : 'text-muted-foreground/40 cursor-default'}`}
                          title={(validationStatus[p.id] || 'idle') === 'idle' ? (visibleKeys[p.id] ? 'Hide API key' : 'Show API key') : undefined}
                        >
                          {(validationStatus[p.id] || 'idle') === 'loading' && <Loader2 size={12} className="animate-spin text-accent" />}
                          {(validationStatus[p.id] || 'idle') === 'valid' && <Check size={12} className="text-emerald-400" />}
                          {(validationStatus[p.id] || 'idle') === 'invalid' && <X size={12} className="text-red-400" />}
                          {(validationStatus[p.id] || 'idle') === 'idle' && (visibleKeys[p.id] ? <EyeOff size={12} /> : <Eye size={12} />)}
                        </button>
                      </div>
                    )}
                    {p.hasModels && (
                      <button
                        type="button"
                        onClick={() => toggleExpanded(p.id)}
                        className={`p-2 rounded-xl border transition-all cursor-pointer ${
                          isExpanded
                            ? 'bg-accent/10 border-accent/40 text-accent'
                            : 'bg-secondary border-border text-muted-foreground/40 hover:text-foreground'
                        }`}
                      >
                        <ChevronDown
                          size={14}
                          className={`transform transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    )}
                  </div>
                </div>
              </div>

              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="mt-3 pt-3 border-t border-border overflow-hidden"
                  >
                    <div className="flex items-center gap-2 mb-2.5">
                      <Key size={10} className="text-accent/60" />
                      <span className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/80">
                        {p.modelCount} Models Available
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto custom-scrollbar">
                      {AVAILABLE_MODELS.filter((m) => m.provider === p.id)
                        .slice(0, 20)
                        .map((m) => (
                          <span
                            key={m.id}
                            className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-accent/5 text-accent/80 border border-accent/10"
                          >
                            {m.name.length > 25 ? m.name.slice(0, 25) + '...' : m.name}
                          </span>
                        ))}
                      {p.modelCount > 20 && (
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-secondary text-muted-foreground/80 border border-border">
                          +{p.modelCount - 20} more
                        </span>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>


            </div>
          );
        })}
      </div>

      {Object.keys(keysInput).some((k) => keysInput[k].trim().length > 0) && (
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={handleSaveToVault}
          className="w-full mt-2 py-2.5 rounded-md bg-accent hover:bg-accent/90 text-white text-[11px] font-bold uppercase tracking-[0.2em] transition-all cursor-pointer shadow-sm hover:shadow-sm border border-border active:scale-95"
        >
          {rememberKeys ? 'Save to Secure Device Vault' : 'Apply Ephemerally (In-Memory Only)'}
        </motion.button>
      )}

      <div className="mt-6 flex justify-center">
        <button
          onClick={handlePurgeVault}
          className="px-6 py-2.5 rounded-md bg-destructive/5 border border-destructive/10 text-destructive text-[11px] font-black uppercase tracking-[0.3em] hover:bg-destructive hover:text-white transition-all group active:scale-95 cursor-pointer"
        >
          <span className="opacity-40 group-hover:opacity-100 flex items-center gap-2">
            <Trash2 size={12}  />
            PURGE SERVER VAULT
          </span>
        </button>
      </div>
    </div>
  );
};
