import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { useLocalModels } from '@src/shared/hooks/useLocalModels';
import { 
  Scale, 
  Cpu, 
  Globe, 
  Zap, 
  Check, 
  X, 
  Activity, 
  FileText, 
  Coins, 
  Clock,
  Sparkles
} from 'lucide-react';

interface ModelComparisonViewProps {
  sidebarOpen?: boolean;
  activeMode?: string;
  setActiveMode?: (mode: string) => void;
}

export const ModelComparisonView: React.FC<ModelComparisonViewProps> = ({
  sidebarOpen = true,
  activeMode,
  setActiveMode,
}) => {
  const [modelAId, setModelAId] = useState<string>('gemini-3.5-flash');
  const [modelBId, setModelBId] = useState<string>('nyx-gemma-4-e2b-it');

  // Load local models to include in comparison choices
  const localModelsQuery = useLocalModels(true);
  
  const allModels = useMemo(() => {
    const localModels = [
      ...(localModelsQuery.data?.ollamaModels || []),
      ...(localModelsQuery.data?.lmstudioModels || []),
    ];
    // Deduplicate models combined with static AVAILABLE_MODELS
    const combined = [...AVAILABLE_MODELS, ...localModels];
    const seen = new Set<string>();
    return combined.filter(m => {
      if (seen.has(m.id)) return false;
      seen.add(m.id);
      return true;
    });
  }, [localModelsQuery.data]);

  const modelA = useMemo(() => allModels.find(m => m.id === modelAId) || allModels[0], [allModels, modelAId]);
  const modelB = useMemo(() => allModels.find(m => m.id === modelBId) || allModels[1] || allModels[0], [allModels, modelBId]);

  // Utility to parse context size for comparison bar
  const getContextSizeNumeric = (ctxStr: string | number | undefined): number => {
    if (!ctxStr) return 4096;
    if (typeof ctxStr === 'number') return ctxStr;
    const clean = String(ctxStr).toUpperCase().trim();
    const val = parseInt(clean);
    if (isNaN(val)) return 4096;
    if (clean.includes('M')) return val * 1000000;
    if (clean.includes('K')) return val * 1000;
    return val;
  };

  const getOutputSizeNumeric = (outStr: string | number | undefined): number => {
    if (!outStr) return 2048;
    if (typeof outStr === 'number') return outStr;
    const clean = String(outStr).toUpperCase().trim();
    const val = parseInt(clean);
    if (isNaN(val)) return 2048;
    if (clean.includes('K')) return val * 1000;
    return val;
  };

  const modelACtx = getContextSizeNumeric(modelA?.specs?.contextWindow);
  const modelBCtx = getContextSizeNumeric(modelB?.specs?.contextWindow);
  const maxCtx = Math.max(modelACtx, modelBCtx, 2000000); // at least 2M for scale

  const modelAOut = getOutputSizeNumeric(modelA?.specs?.maxOutput);
  const modelBOut = getOutputSizeNumeric(modelB?.specs?.maxOutput);
  const maxOut = Math.max(modelAOut, modelBOut, 32000); // scale

  return (
    <motion.div
      key="compare"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden bg-background"
    >
      <header
        className={`flex items-center justify-between py-3 px-4 ${
          !sidebarOpen ? 'pl-14' : ''
        } border-b border-border shrink-0 select-none bg-card transition-all duration-300`}
      >
        <div className="flex items-center gap-2">
          <AnimatedIcon icon={Scale} size={16} className="text-primary" />
          <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">
            Model Comparison
          </h2>
        </div>
      </header>

      <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6 max-w-7xl mx-auto w-full">
        {/* Model Selectors Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center bg-card border border-border p-6 rounded-2xl shadow-sm">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Compare Model A</label>
            <select
              value={modelAId}
              onChange={(e) => setModelAId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-all cursor-pointer font-medium"
            >
              {allModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider.toUpperCase()})
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">Compare Model B</label>
            <select
              value={modelBId}
              onChange={(e) => setModelBId(e.target.value)}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm text-foreground outline-none focus:border-primary/50 transition-all cursor-pointer font-medium"
            >
              {allModels.map(m => (
                <option key={m.id} value={m.id}>
                  {m.name} ({m.provider.toUpperCase()})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Side by side comparison cards */}
        {modelA && modelB && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Card A */}
            <div className="bg-card border border-border p-6 rounded-2xl space-y-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full flex items-center justify-center pointer-events-none">
                {modelA.provider === 'gemini' ? <AnimatedIcon icon={Globe} size={24} className="text-primary/20" /> : <AnimatedIcon icon={Cpu} size={24} className="text-primary/20" />}
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-widest font-bold text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                  Model A
                </span>
                <h3 className="text-xl font-bold mt-2 text-foreground">{modelA.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{modelA.description}</p>
              </div>

              <hr className="border-border" />

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><AnimatedIcon icon={Globe} size={13} /> Provider</span>
                  <span className="font-semibold capitalize text-foreground">{modelA.provider}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><AnimatedIcon icon={Activity} size={13} /> Tier Status</span>
                  <span className="font-semibold uppercase tracking-wider text-[10px] bg-muted px-2 py-0.5 rounded text-foreground">{modelA.status}</span>
                </div>
                {modelA.shutdownDate && (
                  <div className="flex justify-between items-center text-xs text-amber-500">
                    <span className="flex items-center gap-1.5"><AnimatedIcon icon={Clock} size={13} /> Deprecated date</span>
                    <span className="font-bold">{modelA.shutdownDate}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Card B */}
            <div className="bg-card border border-border p-6 rounded-2xl space-y-4 shadow-sm relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-primary/5 rounded-bl-full flex items-center justify-center pointer-events-none">
                {modelB.provider === 'gemini' ? <AnimatedIcon icon={Globe} size={24} className="text-primary/20" /> : <AnimatedIcon icon={Cpu} size={24} className="text-primary/20" />}
              </div>
              <div>
                <span className="text-[9px] uppercase tracking-widest font-bold text-sky-500 bg-sky-500/10 px-2 py-0.5 rounded-full">
                  Model B
                </span>
                <h3 className="text-xl font-bold mt-2 text-foreground">{modelB.name}</h3>
                <p className="text-xs text-muted-foreground mt-1 min-h-[32px]">{modelB.description}</p>
              </div>

              <hr className="border-border" />

              <div className="space-y-3">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><AnimatedIcon icon={Globe} size={13} /> Provider</span>
                  <span className="font-semibold capitalize text-foreground">{modelB.provider}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-muted-foreground flex items-center gap-1.5"><AnimatedIcon icon={Activity} size={13} /> Tier Status</span>
                  <span className="font-semibold uppercase tracking-wider text-[10px] bg-muted px-2 py-0.5 rounded text-foreground">{modelB.status}</span>
                </div>
                {modelB.shutdownDate && (
                  <div className="flex justify-between items-center text-xs text-amber-500">
                    <span className="flex items-center gap-1.5"><AnimatedIcon icon={Clock} size={13} /> Deprecated date</span>
                    <span className="font-bold">{modelB.shutdownDate}</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Feature comparison dashboard */}
        {modelA && modelB && (
          <div className="bg-card border border-border rounded-2xl p-6 space-y-6 shadow-sm">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground">Capabilities & Specs</h3>

            <div className="space-y-6">
              {/* Context Window Scale */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground flex items-center gap-1.5"><AnimatedIcon icon={FileText} size={13} /> Context Window</span>
                  <div className="space-x-4">
                    <span className="text-primary">Model A: {modelA.specs?.contextWindow || 'Unknown'}</span>
                    <span className="text-sky-500">Model B: {modelB.specs?.contextWindow || 'Unknown'}</span>
                  </div>
                </div>
                <div className="space-y-1.5 bg-background border border-border/50 p-3 rounded-xl">
                  {/* Model A Bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(modelACtx / maxCtx) * 100}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full bg-primary" 
                    />
                  </div>
                  {/* Model B Bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(modelBCtx / maxCtx) * 100}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full bg-sky-500" 
                    />
                  </div>
                </div>
              </div>

              {/* Output Limit Scale */}
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-semibold">
                  <span className="text-muted-foreground flex items-center gap-1.5"><AnimatedIcon icon={Zap} size={13} /> Max Output Limit</span>
                  <div className="space-x-4">
                    <span className="text-primary">Model A: {modelA.specs?.maxOutput || 'Unknown'}</span>
                    <span className="text-sky-500">Model B: {modelB.specs?.maxOutput || 'Unknown'}</span>
                  </div>
                </div>
                <div className="space-y-1.5 bg-background border border-border/50 p-3 rounded-xl">
                  {/* Model A Bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(modelAOut / maxOut) * 100}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full bg-primary" 
                    />
                  </div>
                  {/* Model B Bar */}
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${(modelBOut / maxOut) * 100}%` }}
                      transition={{ duration: 0.8 }}
                      className="h-full bg-sky-500" 
                    />
                  </div>
                </div>
              </div>

              {/* Grid features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 pt-4">
                {/* Cost Estimate */}
                <div className="border border-border/60 bg-muted/20 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <AnimatedIcon icon={Coins} size={14} className="text-amber-500" />
                    <span>Cost Tier</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Model A</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {modelA.provider === 'ollama' || modelA.provider === 'lmstudio' ? 'Free (Local)' : 'Cloud Tier'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Model B</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {modelB.provider === 'ollama' || modelB.provider === 'lmstudio' ? 'Free (Local)' : 'Cloud Tier'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Speed / Latency Indicator */}
                <div className="border border-border/60 bg-muted/20 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <AnimatedIcon icon={Zap} size={14} className="text-cyan-500" />
                    <span>Speed / Latency</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Model A</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {modelA.id.includes('flash') || modelA.id.includes('lite') ? 'Ultra Fast' : 'High Quality'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Model B</p>
                      <p className="font-semibold text-foreground mt-0.5">
                        {modelB.id.includes('flash') || modelB.id.includes('lite') ? 'Ultra Fast' : 'High Quality'}
                      </p>
                    </div>
                  </div>
                </div>

                {/* Modality Comparison */}
                <div className="border border-border/60 bg-muted/20 p-4 rounded-xl space-y-2">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
                    <AnimatedIcon icon={Sparkles} size={14} className="text-purple-500" />
                    <span>Native Modality</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Model A</p>
                      <p className="font-semibold text-foreground mt-0.5">{modelA.specs?.modality || 'Text Only'}</p>
                    </div>
                    <div>
                      <p className="text-[10px] text-muted-foreground uppercase font-bold">Model B</p>
                      <p className="font-semibold text-foreground mt-0.5">{modelB.specs?.modality || 'Text Only'}</p>
                    </div>
                  </div>
                </div>
              </div>

            </div>
          </div>
        )}

        {/* Feature Checklists Matrix */}
        {modelA && modelB && (
          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm overflow-x-auto">
            <h3 className="text-xs font-black uppercase tracking-wider text-muted-foreground mb-4">Core Feature Matrix</h3>
            
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/80 text-muted-foreground">
                  <th className="py-2.5 font-bold uppercase tracking-wider">Feature Option</th>
                  <th className="py-2.5 font-bold uppercase tracking-wider text-primary">{modelA.name}</th>
                  <th className="py-2.5 font-bold uppercase tracking-wider text-sky-500">{modelB.name}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40 font-medium">
                <tr>
                  <td className="py-3 text-foreground font-semibold">Zero-key Local Running</td>
                  <td className="py-3">
                    {modelA.provider === 'ollama' || modelA.provider === 'lmstudio' ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                  <td className="py-3">
                    {modelB.provider === 'ollama' || modelB.provider === 'lmstudio' ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-foreground font-semibold">Multimodal Inputs (Images)</td>
                  <td className="py-3">
                    {modelA.specs?.modality?.toLowerCase().includes('multi') ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                  <td className="py-3">
                    {modelB.specs?.modality?.toLowerCase().includes('multi') ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-foreground font-semibold">High Context Window (100k+)</td>
                  <td className="py-3">
                    {modelACtx >= 100000 ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                  <td className="py-3">
                    {modelBCtx >= 100000 ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-foreground font-semibold">Offline Execution Capable</td>
                  <td className="py-3">
                    {modelA.provider === 'ollama' || modelA.provider === 'lmstudio' ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                  <td className="py-3">
                    {modelB.provider === 'ollama' || modelB.provider === 'lmstudio' ? (
                      <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                    ) : (
                      <AnimatedIcon icon={X} className="w-4 h-4 text-red-500" />
                    )}
                  </td>
                </tr>
                <tr>
                  <td className="py-3 text-foreground font-semibold">Structured Agent Task Routing</td>
                  <td className="py-3">
                    <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                  </td>
                  <td className="py-3">
                    <AnimatedIcon icon={Check} className="w-4 h-4 text-emerald-500" />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </motion.div>
  );
};
