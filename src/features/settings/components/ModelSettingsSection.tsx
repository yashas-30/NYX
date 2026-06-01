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
      await fetchWithAuth('/api/nyx/local-models/settings', {
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
    <div className="mt-6 group p-5 rounded-3xl bg-card border border-white/[0.04] hover:border-[#FF3366]/25 transition-all duration-300 relative overflow-hidden shadow-lg">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-[#FF3366]/50 via-[#FF3366]/30 to-[#FF3366]/50 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-[#FF3366]">
            LOCAL INFERENCE ENGINE
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">Quantization Quality / Speed</h3>
        </div>
        <span
          className={`text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${quantSaving ? 'text-[#FF3366]/80 bg-[#FF3366]/5 border-[#FF3366]/15' : 'text-[#FF3366] bg-[#FF3366]/10 border-[#FF3366]/20'}`}
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
                  ? 'bg-[#FF3366]/10 border-[#FF3366]/40 shadow-md shadow-[#FF3366]/5'
                  : 'bg-background/60 border-white/[0.04] hover:border-white/20 hover:bg-white/[0.04]'
              }`}
            >
              {isSelected && (
                <div className="absolute top-2 right-2 w-1.5 h-1.5 rounded-full bg-[#FF3366] animate-pulse" />
              )}
              <div
                className={`text-[10px] font-black uppercase tracking-wider mb-1 ${isSelected ? 'text-[#FF3366]' : 'text-muted-foreground/80'}`}
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
                  <span className={isSelected ? 'text-[#FF3366]' : 'text-muted-foreground/80'}>
                    {tier.vram}
                  </span>
                </div>
              </div>
              <span
                className={`mt-2 inline-block text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded-full ${
                  isSelected
                    ? 'bg-[#FF3366]/20 text-[#FF3366] border border-[#FF3366]/30'
                    : 'bg-white/5 text-muted-foreground/60 border border-white/10'
                }`}
              >
                {tier.badge}
              </span>
            </button>
          );
        })}
      </div>

      {activeQuantInfo?.warn && (
        <div className="mb-3 px-3 py-2 rounded-xl bg-[#FF3366]/5 border border-[#FF3366]/20 text-[10px] text-[#FF3366]/90 flex items-center gap-2">
          <span className="text-[#FF3366] shrink-0">⚠</span>
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
