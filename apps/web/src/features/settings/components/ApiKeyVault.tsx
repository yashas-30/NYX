// fallow-ignore-file code-duplication
import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  KeyIcon as Key,
  Trash2Icon as Trash2,
  EyeIcon as Eye,
  EyeOffIcon as EyeOff,
  CheckIcon as Check,
  XIcon as X,
  ExternalLinkIcon as ExternalLink,
} from '@animateicons/react/lucide';
import { Loader2, ChevronDown, Sparkles, BookOpen, Layers, ShieldCheck } from 'lucide-react';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { toast } from '@src/shared/components/ui/sonner';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { invoke } from '@tauri-apps/api/core';
import { confirm } from '@tauri-apps/plugin-dialog';

interface ProviderGuide {
  id: string;
  name: string;
  badge: string;
  signupUrl: string;
  urlLabel: string;
  freeTierInfo: string;
  keyPrefixHint: string;
  instructions: string[];
}

const PROVIDER_GUIDES: Record<string, ProviderGuide> = {
  gemini: {
    id: 'gemini',
    name: 'Google Gemini',
    badge: 'Official Free Tier',
    signupUrl: 'https://aistudio.google.com/app/apikey',
    urlLabel: 'aistudio.google.com/app/apikey',
    freeTierInfo:
      'Generous Free Tier: Up to 15 Requests Per Minute (RPM) & 1,500 Requests Per Day (RPD) with no credit card required.',
    keyPrefixHint: 'Starts with AIzaSy...',
    instructions: [
      'Navigate to Google AI Studio API Key Manager.',
      'Sign in with your standard Google / Gmail account.',
      'Click "+ Create API key" and select "Create key in new project" (or select an existing project).',
      'Copy the generated key string and paste it into the Google Gemini field above.',
    ],
  },
  openrouter: {
    id: 'openrouter',
    name: 'OpenRouter',
    badge: 'Aggregator & Free Tier',
    signupUrl: 'https://openrouter.ai/keys',
    urlLabel: 'openrouter.ai/keys',
    freeTierInfo:
      'Free Access: Includes free models (Llama 3.3 70B, DeepSeek R1, Gemini 2.0 Flash) with $0 credit balance required.',
    keyPrefixHint: 'Starts with sk-or-v1-...',
    instructions: [
      'Visit OpenRouter API Keys Console.',
      'Sign in with Google, GitHub, or Email.',
      'Click "Create Key", give it any name (e.g. "NYX"), and click "Create".',
      'Copy the full key immediately and paste it into the OpenRouter field above.',
    ],
  },
  'nvidia-nim': {
    id: 'nvidia-nim',
    name: 'NVIDIA NIM',
    badge: '1,000 Free Credits',
    signupUrl: 'https://build.nvidia.com/',
    urlLabel: 'build.nvidia.com',
    freeTierInfo:
      'Free Developer Credits: Grants 1,000 free API invocation credits upon signing up with an NVIDIA Developer account.',
    keyPrefixHint: 'Starts with nvapi-...',
    instructions: [
      'Go to the NVIDIA API Catalog (build.nvidia.com).',
      'Sign in or create a free NVIDIA Developer account.',
      'Select any model card (e.g. Llama 3.3 70B, DeepSeek R1, Mistral Large) and click "Get API Key".',
      'Generate and copy the nvapi-... key, then paste it into the NVIDIA NIM field above.',
    ],
  },
  groq: {
    id: 'groq',
    name: 'Groq Cloud',
    badge: '100% Free Ultra-Fast LPU',
    signupUrl: 'https://console.groq.com/keys',
    urlLabel: 'console.groq.com/keys',
    freeTierInfo:
      'Lightning-Fast Free Tier: Ultra-high speed LPU inference with generous free rate limits for Llama 3.3 70B, Gemma 2, and Whisper.',
    keyPrefixHint: 'Starts with gsk_...',
    instructions: [
      'Visit the Groq Cloud Developer Console.',
      'Log in with your Google or GitHub account.',
      'Go to "API Keys" in the navigation menu and click "Create API Key".',
      'Copy the gsk_... secret key and paste it into the Groq Cloud field above.',
    ],
  },
  mistral: {
    id: 'mistral',
    name: 'Mistral AI',
    badge: 'Free Experimentation Tier',
    signupUrl: 'https://console.mistral.ai/api-keys/',
    urlLabel: 'console.mistral.ai/api-keys',
    freeTierInfo:
      'Free Experimentation Tier: Access Mistral Large, Codestral, and Pixtral with free trial tokens.',
    keyPrefixHint: 'Standard Mistral API key token',
    instructions: [
      'Navigate to Mistral AI Console (La Plateforme).',
      'Create a free account or sign in.',
      'Select "API Keys" from the left sidebar and click "Create new key".',
      'Copy the API secret key and paste it into the Mistral AI field above.',
    ],
  },
  huggingface: {
    id: 'huggingface',
    name: 'HuggingFace Hub',
    badge: '100% Free Open Source',
    signupUrl: 'https://huggingface.co/settings/tokens',
    urlLabel: 'huggingface.co/settings/tokens',
    freeTierInfo:
      'Free Community Access: Unlimited read & inference access to thousands of open-source models, embeddings, and datasets.',
    keyPrefixHint: 'Starts with hf_...',
    instructions: [
      'Go to Hugging Face Access Tokens Settings.',
      'Sign in or register a free Hugging Face account.',
      'Click "Create new token", name it (e.g. "NYX"), set Type to "Read", and click "Create token".',
      'Copy the hf_... token and paste it into the Hugging Face field above.',
    ],
  },
};

interface ProviderConfig {
  id: string;
  name: string;
  hasModels: boolean;
  modelCount: number;
}

const PROVIDER_CONFIGS: ProviderConfig[] = [
  { id: 'gemini', name: 'Google Gemini', hasModels: true, modelCount: 0 },
  { id: 'openrouter', name: 'OpenRouter', hasModels: true, modelCount: 0 },
  { id: 'nvidia-nim', name: 'NVIDIA NIM', hasModels: true, modelCount: 0 },
  { id: 'groq', name: 'Groq Cloud', hasModels: true, modelCount: 0 },
  { id: 'mistral', name: 'Mistral AI', hasModels: true, modelCount: 0 },
  { id: 'huggingface', name: 'HuggingFace Hub', hasModels: false, modelCount: 0 },
];

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
  const { usage, feedback, resetUsage } = useTokenUsage();
  const rememberKeys = useNyxStore((state) => state.rememberKeys);
  const setRememberKeys = useNyxStore((state) => state.setRememberKeys);
  const updateApiKey = useNyxStore((state) => state.updateApiKey);

  const [visibleKeys, setVisibleKeys] = React.useState<Record<string, boolean>>({});

  const toggleVisibility = (id: string) => {
    setVisibleKeys((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const handleOpenUrl = async (url: string) => {
    try {
      await invoke('app_open_external', { url });
    } catch {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  const [validationStatus, setValidationStatus] = React.useState<
    Record<string, 'idle' | 'loading' | 'valid' | 'invalid'>
  >({});
  const validationTimeoutRef = React.useRef<Record<string, NodeJS.Timeout>>({});
  const revertTimeoutRef = React.useRef<Record<string, NodeJS.Timeout>>({});

  const providers = PROVIDER_CONFIGS.map((p) => ({
    ...p,
    modelCount: getModelCountForProvider(p.id),
  }));

  const validateProviderKey = async (
    provider: string,
    key: string
  ): Promise<{ valid: boolean; error?: string }> => {
    try {
      if (provider === 'gemini') {
        const res = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`,
          {
            method: 'GET',
            headers: { 'Content-Type': 'application/json' },
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          return {
            valid: false,
            error: data.error?.message || `Server returned status ${res.status}`,
          };
        }
        return { valid: true };
      }

      if (provider === 'openrouter') {
        const res = await fetch('https://openrouter.ai/api/v1/auth/key', {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          if (res.status === 429) return { valid: true };
          return { valid: false, error: `Invalid OpenRouter API Key (${res.status})` };
        }
        return { valid: true };
      }

      if (provider === 'nvidia-nim' || provider === 'nvidia') {
        const res = await fetch('https://integrate.api.nvidia.com/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          if (res.status === 429) return { valid: true };
          return { valid: false, error: `Invalid NVIDIA NIM Key (${res.status})` };
        }
        return { valid: true };
      }

      if (provider === 'groq') {
        const res = await fetch('https://api.groq.com/openai/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          if (res.status === 429) return { valid: true };
          return { valid: false, error: `Invalid Groq API Key (${res.status})` };
        }
        return { valid: true };
      }

      if (provider === 'mistral') {
        const res = await fetch('https://api.mistral.ai/v1/models', {
          method: 'GET',
          headers: { Authorization: `Bearer ${key}` },
        });
        if (!res.ok) {
          if (res.status === 429) return { valid: true };
          return { valid: false, error: `Invalid Mistral API Key (${res.status})` };
        }
        return { valid: true };
      }

      return { valid: true };
    } catch (err: any) {
      return { valid: false, error: err.message || 'Network error' };
    }
  };

  const triggerValidation = (provider: string, key: string) => {
    if (!key) {
      setValidationStatus((prev) => ({ ...prev, [provider]: 'idle' }));
      return;
    }

    if (validationTimeoutRef.current[provider]) {
      clearTimeout(validationTimeoutRef.current[provider]);
    }
    if (revertTimeoutRef.current[provider]) {
      clearTimeout(revertTimeoutRef.current[provider]);
    }

    setValidationStatus((prev) => ({ ...prev, [provider]: 'loading' }));

    validationTimeoutRef.current[provider] = setTimeout(async () => {
      const result = await validateProviderKey(provider, key);

      setValidationStatus((prev) => ({ ...prev, [provider]: result.valid ? 'valid' : 'invalid' }));

      revertTimeoutRef.current[provider] = setTimeout(() => {
        setValidationStatus((prev) => ({ ...prev, [provider]: 'idle' }));
      }, 2500);
    }, 800);
  };

  const handleSaveToVault = async () => {
    // Validate Gemini key if it's being updated
    const geminiKey = keysInput['gemini'];
    let isGeminiValid = true;
    let validationError = '';
    if (geminiKey && geminiKey.trim().length > 0) {
      toast.info('Validating Gemini API Key...');
      const result = await validateProviderKey('gemini', geminiKey);
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
          toast.warning(
            `Could not reach validation server (${validationError}). Saving key anyway...`
          );
          isGeminiValid = true;
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
      setKeysInput((prev) => {
        const next = { ...prev };
        delete next['gemini'];
        return next;
      });
    }

    if (Object.keys(keysToSave).filter((k) => keysToSave[k]?.trim().length > 0).length === 0) {
      return;
    }

    try {
      for (const provider of Object.keys(keysToSave)) {
        const val = keysToSave[provider];
        if (val !== undefined) {
          await updateApiKey(provider, val);
        }
      }

      toast.success('API keys successfully encrypted & saved to device vault!');

      setKeysInput((prev) => {
        const next = { ...prev };
        for (const k of Object.keys(keysToSave)) delete next[k];
        return next;
      });
      await fetchVaultStatus();
    } catch (error: any) {
      toast.error(`Error saving keys: ${error.message}`);
    }
  };

  const handlePurgeVault = async () => {
    const shouldDelete = await confirm('Delete all keys from secure device vault?', {
      title: 'Confirm Deletion',
      kind: 'warning',
    });
    if (shouldDelete) {
      try {
        await clearApiKeys();
        toast.success('All API keys removed from device vault and RAM');
        await fetchVaultStatus();
      } catch (error: any) {
        toast.error(`Error: ${error.message}`);
      }
    }
  };

  return (
    <div className="space-y-4">
      {/* Remember Keys Opt-in */}
      <div className="p-4 rounded-xl bg-card border border-border flex items-center justify-between gap-4 select-none">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <ShieldCheck size={14} className="text-emerald-400" />
            <p className="text-[11px] font-bold uppercase tracking-[0.1em] text-foreground">
              Secure Device Key Storage
            </p>
          </div>
          <p className="text-[9px] text-muted-foreground/70 mt-1 leading-normal">
            Encrypts and persists keys in your local device keychain (DPAPI/TPM) and encrypted
            AppData vault. Keys remain permanently available across restarts and complete PC
            reboots.
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

      <div className="space-y-2.5">
        {providers.map((p) => {
          const hasKey = vaultStatus[p.id] || !!(apiKeys[p.id] && apiKeys[p.id].trim().length > 0);
          const isExpanded = expandedProvider === p.id;
          const providerUsage = usage[p.id];
          const guide = PROVIDER_GUIDES[p.id];

          return (
            <div
              key={p.id}
              className={`group p-4 rounded-xl bg-card border transition-all duration-300 shadow-sm ${
                isExpanded
                  ? 'border-accent/40 bg-card/90 ring-1 ring-accent/15'
                  : 'border-border hover:border-accent/30'
              }`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 shrink-0 rounded-lg flex items-center justify-center text-[11px] font-black uppercase bg-accent/10 text-accent border border-accent/20">
                  {p.name[0]}
                </div>

                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
                    <div className="flex items-center gap-2">
                      <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-foreground/90">
                        {p.name}
                      </p>
                      {guide && (
                        <span className="text-[9px] font-mono px-2 py-0.5 rounded-full bg-accent/10 text-accent border border-accent/20">
                          {guide.badge}
                        </span>
                      )}
                      {hasKey && (
                        <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 px-1.5 py-0.5 rounded-md border border-emerald-500/20">
                          {vaultStatus[p.id] ? 'Vault Locked' : 'Active'}
                        </span>
                      )}
                      {feedback?.[p.id] &&
                        (feedback[p.id].thumbsUp > 0 || feedback[p.id].thumbsDown > 0) && (
                          <span
                            className="text-[9px] font-mono font-medium text-muted-foreground/90 bg-secondary/80 px-2 py-0.5 rounded-md border border-border flex items-center gap-1.5"
                            title="User Feedback Rating"
                          >
                            <span className="text-emerald-400 font-semibold">
                              👍 {feedback[p.id].thumbsUp}
                            </span>
                            <span className="text-white/20">|</span>
                            <span className="text-red-400 font-semibold">
                              👎 {feedback[p.id].thumbsDown}
                            </span>
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
                            PURGE USAGE
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1 flex items-center">
                      <input
                        type={visibleKeys[p.id] ? 'text' : 'password'}
                        value={keysInput[p.id] ?? apiKeys[p.id] ?? ''}
                        onChange={(e) => {
                          setKeysInput((prev) => ({ ...prev, [p.id]: e.target.value }));
                          triggerValidation(p.id, e.target.value);
                        }}
                        placeholder={
                          hasKey ? '••••••••••••••••••••••••••••••••' : `Enter ${p.name} API key`
                        }
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            e.currentTarget.blur();
                          }
                        }}
                        className="w-full bg-background border border-border rounded-lg pl-3.5 pr-10 py-2.5 text-[11px] font-mono transition-all outline-none text-foreground/90 focus:border-accent/60 shadow-inner"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if ((validationStatus[p.id] || 'idle') === 'idle') {
                            toggleVisibility(p.id);
                          }
                        }}
                        className={`absolute right-2.5 transition-colors ${(validationStatus[p.id] || 'idle') === 'idle' ? 'text-muted-foreground/80 hover:text-foreground cursor-pointer' : 'text-muted-foreground/40 cursor-default'}`}
                        title={
                          (validationStatus[p.id] || 'idle') === 'idle'
                            ? visibleKeys[p.id]
                              ? 'Hide API key'
                              : 'Show API key'
                            : undefined
                        }
                      >
                        {(validationStatus[p.id] || 'idle') === 'loading' && (
                          <Loader2 size={13} className="animate-spin text-accent" />
                        )}
                        {(validationStatus[p.id] || 'idle') === 'valid' && (
                          <Check size={13} className="text-emerald-400" />
                        )}
                        {(validationStatus[p.id] || 'idle') === 'invalid' && (
                          <X size={13} className="text-red-400" />
                        )}
                        {(validationStatus[p.id] || 'idle') === 'idle' &&
                          (visibleKeys[p.id] ? <EyeOff size={13} /> : <Eye size={13} />)}
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={() => toggleExpanded(p.id)}
                      className={`p-2.5 rounded-lg border transition-all cursor-pointer flex items-center gap-1 text-[10px] font-mono ${
                        isExpanded
                          ? 'bg-accent/15 border-accent/50 text-accent shadow-sm'
                          : 'bg-secondary/70 border-border text-muted-foreground hover:text-foreground hover:bg-secondary'
                      }`}
                      title={
                        isExpanded
                          ? 'Hide instructions & model info'
                          : 'Show free API key link & instructions'
                      }
                    >
                      <ChevronDown
                        size={14}
                        className={`transform transition-transform duration-200 ${isExpanded ? 'rotate-180 text-accent' : ''}`}
                      />
                    </button>
                  </div>
                </div>
              </div>

              {/* Expandable Free Key Generation Guide, Web Links & Available Models */}
              <AnimatePresence>
                {isExpanded && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2 }}
                    className="mt-4 pt-4 border-t border-border/80 overflow-hidden space-y-4"
                  >
                    {guide && (
                      <div className="space-y-3 bg-background/60 p-3.5 rounded-lg border border-border/60">
                        {/* Direct Link Banner */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 pb-2.5 border-b border-border/40">
                          <div className="flex items-center gap-2">
                            <Sparkles size={13} className="text-accent" />
                            <span className="text-[11px] font-bold text-foreground">
                              Get Free {guide.name} API Key
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleOpenUrl(guide.signupUrl)}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-accent text-white text-[10px] font-bold uppercase tracking-wider hover:bg-accent/90 transition-all cursor-pointer shadow-sm active:scale-95"
                          >
                            <span>Open {guide.urlLabel}</span>
                            <ExternalLink size={12} />
                          </button>
                        </div>

                        {/* Free Tier Details */}
                        <div className="p-2.5 rounded-md bg-accent/5 border border-accent/15 flex items-start gap-2">
                          <BookOpen size={13} className="text-accent shrink-0 mt-0.5" />
                          <div className="text-[10px] text-muted-foreground leading-relaxed">
                            <span className="text-foreground font-semibold">
                              {guide.freeTierInfo}
                            </span>
                            <span className="block mt-0.5 text-accent/80 font-mono text-[9px]">
                              {guide.keyPrefixHint}
                            </span>
                          </div>
                        </div>

                        {/* Step-by-Step Instructions */}
                        <div className="space-y-1.5 pt-1">
                          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/90">
                            How to Create Your Free Key:
                          </p>
                          <ol className="space-y-1 text-[10px] text-muted-foreground/80 pl-1">
                            {guide.instructions.map((step, idx) => (
                              <li key={idx} className="flex items-start gap-2">
                                <span className="w-4 h-4 rounded-full bg-secondary border border-border text-foreground flex items-center justify-center text-[9px] font-bold shrink-0 mt-0.5">
                                  {idx + 1}
                                </span>
                                <span className="leading-snug">{step}</span>
                              </li>
                            ))}
                          </ol>
                        </div>
                      </div>
                    )}

                    {/* Available Models List */}
                    {p.hasModels && (
                      <div className="space-y-2 pt-1">
                        <div className="flex items-center gap-2">
                          <Layers size={12} className="text-accent/70" />
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/80">
                            {p.modelCount} Available Models
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto custom-scrollbar">
                          {AVAILABLE_MODELS.filter((m) => m.provider === p.id).map((m) => (
                            <span
                              key={m.id}
                              className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-secondary/80 text-foreground/80 border border-border flex items-center gap-1.5"
                            >
                              <span className="w-1.5 h-1.5 rounded-full bg-accent/60" />
                              <span>{m.name}</span>
                              {m.specs?.contextWindow && (
                                <span className="text-[8px] text-muted-foreground/60">
                                  ({m.specs.contextWindow})
                                </span>
                              )}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
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
          className="w-full mt-2 py-3 rounded-lg bg-accent hover:bg-accent/90 text-white text-[11px] font-bold uppercase tracking-[0.2em] transition-all cursor-pointer shadow-sm hover:shadow-sm border border-border active:scale-95"
        >
          Save to Secure Device Vault
        </motion.button>
      )}

      <div className="mt-6 flex justify-center">
        <button
          onClick={handlePurgeVault}
          className="px-6 py-2.5 rounded-lg bg-destructive/5 border border-destructive/10 text-destructive text-[10px] font-bold uppercase tracking-[0.2em] hover:bg-destructive hover:text-white transition-all group active:scale-95 cursor-pointer"
        >
          <span className="opacity-60 group-hover:opacity-100 flex items-center gap-2">
            <Trash2 size={12} />
            PURGE DEVICE VAULT
          </span>
        </button>
      </div>
    </div>
  );
};
