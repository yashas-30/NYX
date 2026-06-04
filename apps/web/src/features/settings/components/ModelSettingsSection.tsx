import React, { useState } from 'react';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

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
    <div className="mt-6 group p-5 rounded-3xl bg-card border border-border hover:border-accent/25 transition-all duration-300 relative overflow-hidden shadow-lg">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/50 via-accent/30 to-accent/50 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            LOCAL INFERENCE ENGINE
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">Quantization Quality / Speed</h3>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${quantSaving ? 'text-accent/80 bg-accent/5 border-accent/15' : 'text-accent bg-accent/10 border-accent/20'}`}
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
              className={`relative p-3 rounded-2xl border text-left transition-all duration-200 cursor-pointer ${
                isSelected
                  ? 'bg-accent/10 border-accent/40 shadow-md shadow-accent/5'
                  : 'bg-background/60 border-border hover:border-border/60 hover:bg-secondary/40'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-accent animate-pulse" />
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
                className={`mt-2 inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
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
        <div className="mb-3 px-3 py-2 rounded-xl bg-accent/5 border border-accent/20 text-[10px] text-accent/90 flex items-center gap-2">
          <span className="text-accent shrink-0">⚠</span>
          {activeQuantInfo.warn}
        </div>
      )}

      <p className="text-[10px] text-muted-foreground/80 leading-relaxed">
        Quantization controls model weight precision. Higher quality tiers reduce hallucinations in
        code generation. Q5_K_M is the recommended minimum for coding tasks. Takes effect on next
        model load.
      </p>
    </div>
  );
};
