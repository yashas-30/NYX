// src/features/hf-explorer/components/OnDeviceModelList.tsx
import React from 'react';
import { Desktop, Sparkle } from '@phosphor-icons/react';
import { formatSize } from '../lib/utils';
import { isModelLoaded } from '../../../shared/hooks/useLocalModels';

interface OnDeviceModelListProps {
  models: any[];
  selectedModelId: string | null;
  loadedModelId: string | null;
  searchQuery: string;
  onSelect: (model: any) => void;
  onReturnToHf: () => void;
}

export const OnDeviceModelList: React.FC<OnDeviceModelListProps> = ({
  models,
  selectedModelId,
  loadedModelId,
  searchQuery,
  onSelect,
  onReturnToHf,
}) => {
  const query = searchQuery.toLowerCase().trim();
  const filtered = models.filter(
    (m) =>
      !query ||
      (m.name && m.name.toLowerCase().includes(query)) ||
      (m.id && m.id.toLowerCase().includes(query)) ||
      (m.provider && m.provider.toLowerCase().includes(query))
  );

  if (filtered.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center gap-3">
        <Desktop size={32} weight="duotone" className="text-muted-foreground/40" />
        <div className="text-sm font-semibold text-foreground">
          {query ? `No on-device models matching "${query}"` : 'No On-Device Models Downloaded'}
        </div>
        <div className="text-xs text-muted-foreground max-w-[240px]">
          Download GGUF models from Hugging Face to run inference locally on your device.
        </div>
        <button
          onClick={onReturnToHf}
          className="mt-2 text-xs font-semibold text-primary hover:underline cursor-pointer"
        >
          Explore Hugging Face Models
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto overflow-x-hidden custom-scrollbar divide-y divide-border/40">
      {filtered.map((m) => {
        const isSelected = selectedModelId === m.id;
        const isLoaded = isModelLoaded(m.id, loadedModelId);

        return (
          <div
            key={m.id}
            onClick={() => onSelect(m)}
            className={`px-3.5 py-3 flex items-center justify-between gap-3 transition-all cursor-pointer select-none ${
              isSelected
                ? 'bg-primary/10 border-l-2 border-primary'
                : 'hover:bg-muted/40 border-l-2 border-transparent'
            }`}
          >
            <div
              className={`text-[13px] font-medium truncate font-mono min-w-0 flex-1 ${
                isSelected ? 'text-primary font-bold' : 'text-foreground'
              }`}
              title={m.name || m.id}
            >
              {m.name || m.id}
            </div>

            {isLoaded ? (
              <span className="shrink-0 flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                Active
              </span>
            ) : (
              <span className="shrink-0 text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-muted-foreground font-mono">
                Ready
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
};
