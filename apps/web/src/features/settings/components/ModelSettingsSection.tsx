import React, { useState, useEffect } from 'react';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { AlertTriangle } from 'lucide-react';
import { LazyStore as Store } from '@tauri-apps/plugin-store';

const settingsStore = new Store('nyx_settings.bin');

const QUANT_TIERS = [
  {
    id: 'Q4_K_M',
    label: 'Speed',
    badge: '3–4× faster',
    quality: '95%',
    vram: '~3.9 GB',
    warn: 'Higher hallucination risk for complex code.',
  },
  {
    id: 'Q5_K_M',
    label: 'Balanced',
    badge: 'Recommended',
    quality: '98%',
    vram: '~4.8 GB',
    warn: null,
  },
  {
    id: 'Q6_K',
    label: 'Quality',
    badge: 'Best output',
    quality: '99%',
    vram: '~5.7 GB',
    warn: null,
  },
] as const;

type QuantTierId = (typeof QUANT_TIERS)[number]['id'];

interface ModelSettingsSectionProps {
  selectedQuant: QuantTierId;
  setSelectedQuant: (quant: QuantTierId) => void;
}

export const ModelSettingsSection: React.FC<ModelSettingsSectionProps> = ({
  selectedQuant,
  setSelectedQuant,
}) => {
  const [quantSaving, setQuantSaving] = useState(false);
  
  const currentModelId = useNyxStore((state) => state.models.nyx);
  const [systemPrompt, setSystemPrompt] = useState('');
  const [promptSaving, setPromptSaving] = useState(false);

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  useEffect(() => {
    if (!currentModelId) return;
    const loadPrompt = async () => {
      try {
        let prompts: Record<string, string> = {};
        if (isTauri) {
          prompts = await settingsStore.get<Record<string, string>>('modelSystemPrompts') || {};
        } else {
          const stored = localStorage.getItem('nyx_model_prompts');
          if (stored) {
            try { prompts = JSON.parse(stored); } catch (e) {}
          }
        }
        setSystemPrompt(prompts[currentModelId] || '');
      } catch (e) {
        console.error('Failed to load system prompt:', e);
      }
    };
    loadPrompt();
  }, [currentModelId, isTauri]);

  const handlePromptChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setSystemPrompt(e.target.value);
  };

  const saveSystemPrompt = async () => {
    if (!currentModelId) return;
    setPromptSaving(true);
    try {
      let prompts: Record<string, string> = {};
      if (isTauri) {
        prompts = await settingsStore.get<Record<string, string>>('modelSystemPrompts') || {};
        prompts[currentModelId] = systemPrompt;
        await settingsStore.set('modelSystemPrompts', prompts);
        await settingsStore.save();
      } else {
        const stored = localStorage.getItem('nyx_model_prompts');
        if (stored) {
          try { prompts = JSON.parse(stored); } catch (e) {}
        }
        prompts[currentModelId] = systemPrompt;
        localStorage.setItem('nyx_model_prompts', JSON.stringify(prompts));
      }
      toast.success('System prompt saved for ' + currentModelId);
    } catch (e) {
      console.error('Failed to save system prompt:', e);
      toast.error('Failed to save system prompt');
    } finally {
      setPromptSaving(false);
    }
  };

  const handleQuantChange = async (quantId: QuantTierId) => {
    setSelectedQuant(quantId);
    localStorage.setItem('nyx_quant', quantId);
    setQuantSaving(true);
    try {
      await fetchWithAuth('/api/v1/nyx/local-models/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quantization: quantId }),
      });
      toast.success(`Quantization set to ${quantId} — takes effect on next model load.`);
    } catch {
      toast.info(`Quantization saved locally: ${quantId}`);
    } finally {
      setQuantSaving(false);
    }
  };

  const activeQuantInfo = QUANT_TIERS.find((t) => t.id === selectedQuant);

  return (
    <div className="mt-6 group p-5 rounded-md bg-card border border-border hover:border-accent/25 transition-all duration-300 relative overflow-hidden shadow-sm border border-border">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/50 via-accent/30 to-accent/50 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            LOCAL INFERENCE ENGINE
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">Quantization Quality / Speed</h3>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border ${quantSaving ? 'text-accent/80 bg-accent/5 border-accent/15' : 'text-accent bg-accent/10 border-accent/20'}`}
        >
          {quantSaving ? 'Saving...' : selectedQuant}
        </span>
      </div>

      <div className="grid grid-cols-3 gap-2 mb-4">
        {QUANT_TIERS.map((tier) => {
          const isSelected = selectedQuant === tier.id;
          return (
            <button
              key={tier.id}
              onClick={() => handleQuantChange(tier.id)}
              className={`relative p-3 rounded-md border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-accent/10 border-accent/40 shadow-sm shadow-accent/5'
                  : 'bg-background/60 border-border hover:border-border/60 hover:bg-secondary/40'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-md bg-accent animate-pulse" />
              )}
              <div
                className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isSelected ? 'text-accent' : 'text-muted-foreground/80'}`}
              >
                {tier.label}
              </div>
              <div
                className={`text-[11px] font-bold font-mono mb-2 ${isSelected ? 'text-foreground' : 'text-foreground/70'}`}
              >
                {tier.id}
              </div>
              <div className="space-y-1">
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                  <span className="text-muted-foreground/60">Quality</span>
                  <span className={isSelected ? 'text-emerald-400' : 'text-muted-foreground/80'}>
                    {tier.quality}
                  </span>
                </div>
                <div className="flex justify-between text-[9px] font-bold uppercase tracking-wider">
                  <span className="text-muted-foreground/60">VRAM</span>
                  <span className={isSelected ? 'text-accent' : 'text-muted-foreground/80'}>
                    {tier.vram}
                  </span>
                </div>
              </div>
              <span
                className={`mt-2 inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-md ${
                  isSelected
                    ? 'bg-accent/20 text-accent border border-accent/30'
                    : 'bg-secondary text-muted-foreground/60 border border-border'
                }`}
              >
                {tier.badge}
              </span>
            </button>
          );
        })}
      </div>

      {activeQuantInfo?.warn && (
        <div className="mb-3 px-3 py-2 rounded-md bg-accent/5 border border-accent/20 text-[10px] text-accent/90 flex items-center gap-2">
          <AlertTriangle className="w-3.5 h-3.5 text-accent shrink-0" />
          {activeQuantInfo.warn}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/80 leading-relaxed mb-8">
        Quantization controls model weight precision. Higher quality tiers reduce hallucinations in
        code generation. Q5_K_M is the recommended minimum for coding tasks. Takes effect on next
        model load.
      </p>

      {/* Per-model System Prompts */}
      <div className="pt-4 border-t border-white/[0.05]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
              MODEL BEHAVIOR
            </p>
            <h3 className="text-xs font-bold text-foreground mt-0.5">Custom System Prompt</h3>
          </div>
          {currentModelId && (
            <span className="text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-md border border-accent/20 text-accent bg-accent/10">
              {currentModelId}
            </span>
          )}
        </div>
        
        {currentModelId ? (
          <div className="flex flex-col gap-2">
            <textarea
              className="w-full bg-background border border-border rounded-md p-3 text-sm min-h-[120px] focus:outline-none focus:border-accent/50 text-foreground resize-y custom-scrollbar"
              placeholder="Enter specific instructions to always prepend for this model..."
              value={systemPrompt}
              onChange={handlePromptChange}
            />
            <div className="flex justify-end">
              <button
                onClick={saveSystemPrompt}
                disabled={promptSaving}
                className="px-4 py-1.5 text-xs font-bold rounded-md bg-accent/20 hover:bg-accent/30 text-accent transition-colors disabled:opacity-50"
              >
                {promptSaving ? 'Saving...' : 'Save Instructions'}
              </button>
            </div>
          </div>
        ) : (
          <div className="p-4 rounded-md border border-border/50 bg-background/50 text-xs text-muted-foreground text-center">
            Select a model first to configure its system prompt.
          </div>
        )}
      </div>
    </div>
  );
};
