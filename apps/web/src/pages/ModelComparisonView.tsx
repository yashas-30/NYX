import React, { useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { AVAILABLE_MODELS } from '@src/shared/config/models';
import { useModelStore } from '@src/shared/store/useModelStore';
import { ArrowLeft, Plus, X, BarChart3, ShieldCheck } from 'lucide-react';

export default function ModelComparisonView() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const localLibraryModels = useModelStore((state) => state.localLibraryModels);

  // Combine available models and local library models
  const allModels = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...localLibraryModels, ...AVAILABLE_MODELS];
    return merged.filter((m) => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [localLibraryModels]);

  // Read compared model IDs from search params
  const comparedIds = useMemo(() => {
    const modelsParam = searchParams.get('models');
    if (!modelsParam) return ['gemini-3.5-flash', 'gemini-3.1-pro']; // default models to compare
    return modelsParam.split(',').filter(Boolean);
  }, [searchParams]);

  // Get active models to compare
  const comparedModels = useMemo(() => {
    return comparedIds
      .map((id) => allModels.find((m) => m.id === id))
      .filter(Boolean);
  }, [comparedIds, allModels]);

  // Update compared models search params
  const updateComparedModels = (ids: string[]) => {
    if (ids.length === 0) {
      searchParams.delete('models');
    } else {
      searchParams.set('models', ids.join(','));
    }
    setSearchParams(searchParams);
  };

  const handleAddModel = (id: string) => {
    if (comparedIds.includes(id)) return;
    updateComparedModels([...comparedIds, id]);
  };

  const handleRemoveModel = (id: string) => {
    updateComparedModels(comparedIds.filter((mId) => mId !== id));
  };

  const availableToSelect = useMemo(() => {
    return allModels.filter((m) => !comparedIds.includes(m.id));
  }, [allModels, comparedIds]);

  return (
    <div className="h-full flex flex-col bg-background text-foreground overflow-y-auto p-6 scrollbar-none">
      {/* Header */}
      <div className="flex items-center justify-between mb-8 pb-4 border-b border-white/[0.04]">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            className="p-2 rounded-lg hover:bg-white/5 text-zinc-400 hover:text-white transition-all cursor-pointer"
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <h1 className="text-xl font-bold tracking-tight bg-gradient-to-r from-white via-zinc-200 to-zinc-500 bg-clip-text text-transparent">
              Model Comparison
            </h1>
            <p className="text-xs text-zinc-500 mt-0.5">
              Compare speed, capabilities, and token windows side-by-side.
            </p>
          </div>
        </div>

        {/* Add Model Dropdown */}
        {availableToSelect.length > 0 && (
          <div className="relative">
            <select
              value=""
              onChange={(e) => {
                if (e.target.value) {
                  handleAddModel(e.target.value);
                }
              }}
              className="bg-zinc-900 border border-white/10 rounded-lg px-3 py-1.5 text-xs text-zinc-300 focus:outline-none focus:border-primary/50 cursor-pointer appearance-none pr-8 relative"
            >
              <option value="" disabled>+ Add Model to Compare</option>
              {availableToSelect.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
            <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-400">
              <Plus size={12} />
            </div>
          </div>
        )}
      </div>

      {comparedModels.length === 0 ? (
        <div className="flex flex-col items-center justify-center flex-1 py-12 text-center">
          <BarChart3 size={48} className="text-zinc-600 mb-4" />
          <h3 className="text-sm font-semibold text-zinc-300">No models selected</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-sm">
            Select at least one model from the registry or dropdown above to start comparing.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 items-start">
          {comparedModels.map((model) => {
            if (!model) return null;
            return (
              <div
                key={model.id}
                className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-5 hover:border-white/[0.08] transition-all relative group flex flex-col min-h-[400px] backdrop-blur-md"
              >
                {/* Remove button */}
                <button
                  onClick={() => handleRemoveModel(model.id)}
                  className="absolute top-4 right-4 p-1 rounded-md hover:bg-red-500/10 text-zinc-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all cursor-pointer"
                >
                  <X size={14} />
                </button>

                <div className="mb-4">
                  <span className="text-[9px] uppercase tracking-widest font-black text-primary px-2 py-0.5 rounded-full bg-primary/10 border border-primary/20">
                    {model.provider}
                  </span>
                  <h3 className="text-md font-bold mt-2.5 text-zinc-200">{model.name}</h3>
                  <p className="text-xs text-zinc-500 mt-1.5 line-clamp-2 min-h-[2rem]">
                    {model.description}
                  </p>
                </div>

                <div className="space-y-4 flex-1 border-t border-white/[0.04] pt-4">
                  {/* Context Window */}
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                      Context Window
                    </span>
                    <p className="text-sm font-semibold text-zinc-300 mt-0.5">
                      {model.specs?.contextWindow || 'N/A'}
                    </p>
                  </div>

                  {/* Modality */}
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                      Modality
                    </span>
                    <p className="text-sm font-semibold text-zinc-300 mt-0.5">
                      {model.specs?.modality || 'Text Only'}
                    </p>
                  </div>

                  {/* Max Output */}
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                      Max Output Limit
                    </span>
                    <p className="text-sm font-semibold text-zinc-300 mt-0.5">
                      {model.specs?.maxOutput || 'N/A'}
                    </p>
                  </div>

                  {/* Status / Deployability */}
                  <div>
                    <span className="text-[10px] text-zinc-500 font-bold uppercase tracking-wider">
                      Status
                    </span>
                    <div className="flex items-center gap-1.5 mt-0.5">
                      <ShieldCheck size={12} className="text-emerald-400" />
                      <span className="text-xs font-medium text-zinc-300">
                        {model.provider === 'nyx-native' ? (model.status || 'Active') : 'Cloud API Ready'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


