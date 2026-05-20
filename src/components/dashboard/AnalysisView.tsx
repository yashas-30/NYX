import React, { useState, useRef, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Loader2, MessageSquare, 
  Sparkles, RefreshCw, Zap, Brain, Layout, Sliders, Activity,
  Trophy, AlertCircle, Code, FileCode,
  ShieldCheck, HelpCircle, Gauge, ChevronDown, Check
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { AnalysisJudgement, ModelOption, OllamaModel, CodeAnalysisResult } from '@/src/types';
import { isCodePrompt } from '@/src/lib/api/inferenceClient';
import { AVAILABLE_MODELS } from '@/src/config/models';
import { UI_TEXT } from '../../lib/design-system/copy';

interface AnalysisViewProps {
  isAnalyzing: boolean;
  analysisOutput: AnalysisJudgement | null;
  setActiveMode: (mode: 'grid' | 'analysis' | 'history' | 'settings' | 'registry' | 'coder') => void;
  runAnalysis: () => void;
  allModels: ModelOption[];
  ollamaModels: OllamaModel[];
  lmStudioModels: any[];
  analysisTab: 'standard' | 'code';
  setAnalysisTab: (tab: 'standard' | 'code') => void;
  codeAnalysisOutput: CodeAnalysisResult | null;
  isCodeAnalyzing: boolean;
  isCodeSession: boolean;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  columns?: any[];
  ollamaBaseUrl: string;
  lmStudioBaseUrl: string;
  globalPrompt: string;
  gatewayUrls?: Record<string, string>;
  localModelsEnabled: boolean;
  setLocalModelsEnabled: (enabled: boolean) => void;
  analysisModel: string;
  setAnalysisModel: (model: string) => void;
}

const AnalysisViewComponent: React.FC<AnalysisViewProps> = ({
   isAnalyzing,
   analysisOutput,
   setActiveMode,
   runAnalysis,
   allModels,
   ollamaModels,
   lmStudioModels,
   analysisTab,
   setAnalysisTab,
   codeAnalysisOutput,
   isCodeAnalyzing,
   isCodeSession,
   columns = [],
   providerStatuses,
   ollamaBaseUrl,
   lmStudioBaseUrl,
   globalPrompt,
   gatewayUrls = {},
   localModelsEnabled,
   setLocalModelsEnabled,
   analysisModel,
   setAnalysisModel
}) => {
   const [modelSelectorOpen, setModelSelectorOpen] = useState(false);
   const selectorRef = useRef<HTMLDivElement>(null);

   // Click-outside to close
   useEffect(() => {
     const handler = (e: MouseEvent) => {
       if (selectorRef.current && !selectorRef.current.contains(e.target as Node)) {
         setModelSelectorOpen(false);
       }
     };
     document.addEventListener('mousedown', handler);
     return () => document.removeEventListener('mousedown', handler);
   }, []);

   const hasSuccessfulModels = useMemo(
     () => columns.some(c => c.status === 'success'),
     [columns]
   );

   // Build model list for analysis selector — no opencode
   const analysisModels = useMemo(() => {
     return AVAILABLE_MODELS.filter(m => m.provider !== 'opencode');
   }, []);

   const selectedModelName = useMemo(() => {
     if (!analysisModel) return 'Select Model';
     const found = analysisModels.find(m => m.id === analysisModel);
     return found?.name || analysisModel;
   }, [analysisModel, analysisModels]);

  const pillars = [
    { id: 'Memory',    icon: Brain,    label: 'Architecture', color: 'text-primary' },
    { id: 'Formatting', icon: Layout,   label: 'Cohesion',     color: 'text-primary' },
    { id: 'Nuance',    icon: Activity, label: 'Execution',    color: 'text-primary' },
    { id: 'Logic',     icon: Sliders,  label: 'Precision',    color: 'text-primary' },
    { id: 'Efficiency', icon: Zap,      label: 'Performance',  color: 'text-primary' },
  ];

  const canRunCodeAnalysis = useMemo(() => {
    // Check if the prompt itself is code
    if (isCodePrompt(globalPrompt)) return true;

    return (columns || []).some(col => 
      col.status === 'success' && 
      (col.output.includes('```') || (col.localPrompt && isCodePrompt(col.localPrompt)))
    );
  }, [columns, globalPrompt]);

  const hasTextContent = useMemo(() => {
    return (columns || []).some(col => 
      col.status === 'success' && col.output.trim().length > 0
    );
  }, [columns]);

  const hasCodeContent = useMemo(() => {
    return (columns || []).some(col => 
      col.status === 'success' && col.output.includes('```')
    );
  }, [columns]);

  const isLoading = isAnalyzing || isCodeAnalyzing;

  const pillarsMemo = useMemo(() => pillars, [pillars]);

  return (
    <motion.div 
      key="analysis" 
      initial={{ opacity: 0, y: 20 }} 
      animate={{ opacity: 1, y: 0 }} 
      exit={{ opacity: 0, y: -20 }} 
      className="h-full w-full p-[2vw] flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col bg-white/30 dark:bg-zinc-900/20 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-3xl overflow-hidden shadow-xl relative">
        <header className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 border-b border-white/10 dark:border-white/5 shrink-0 select-none bg-white/10 dark:bg-black/10 backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-4">
            <div>
              <h2 className="text-sm font-bold tracking-tight text-foreground">{UI_TEXT.analysis.title}</h2>
              <p className="text-muted-foreground text-[8px] font-black uppercase tracking-[0.2em] opacity-40">Compare model performance</p>
            </div>

            <div className="flex bg-white/30 dark:bg-zinc-900/30 backdrop-blur-sm p-1 rounded-full border border-white/15 dark:border-white/5">
              <button
                onClick={() => setAnalysisTab('standard')}
                className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-tight transition-all flex items-center gap-1.5 ${
                  analysisTab === 'standard' 
                    ? 'bg-primary text-white shadow-lg' 
                    : 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <Activity size={9} strokeWidth={1.5} />
                {UI_TEXT.analysis.tabs.standard}
              </button>
              <button
                onClick={() => setAnalysisTab('code')}
                disabled={!hasCodeContent}
                className={`px-3 py-1 rounded-full text-[8px] font-bold uppercase tracking-tight transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed ${
                  analysisTab === 'code' 
                    ? 'bg-primary text-white shadow-lg' 
                    : 'text-muted-foreground/60 hover:text-foreground hover:bg-foreground/5'
                }`}
              >
                <Code size={9} strokeWidth={1.5} />
                {UI_TEXT.analysis.tabs.code}
              </button>
            </div>


            <div className="flex items-center gap-2 px-2.5 py-1 rounded-lg bg-muted/20 border border-border-strong/30">
              <span className="text-[6px] font-black uppercase tracking-widest text-muted-foreground/40">Local</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setLocalModelsEnabled(!localModelsEnabled);
                }}
                className={`
                  w-6 h-3 rounded-full transition-colors duration-200 relative flex items-center px-0.5
                  ${localModelsEnabled ? 'bg-primary' : 'bg-muted-foreground/20'}
                `}
              >
                <div className={`
                  w-2 h-2 rounded-full bg-background shadow-sm transition-transform duration-200
                  ${localModelsEnabled ? 'translate-x-3' : 'translate-x-0'}
                `} />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              {/* Analysis Model Selector */}
              <div className="relative" ref={selectorRef}>
                <button
                  onClick={() => setModelSelectorOpen(v => !v)}
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border transition-all ${
                    modelSelectorOpen 
                      ? 'bg-primary/10 border-primary/40 ring-1 ring-primary/10'
                      : 'bg-white/30 dark:bg-zinc-900/30 border-white/20 dark:border-white/5 hover:border-primary/20'
                  }`}
                >
                  {analysisModel && (() => {
                    const m = analysisModels.find(x => x.id === analysisModel);
                    const p = m?.provider || '';
                    const st = providerStatuses?.[p];
                    return (
                      <div className={`w-1.5 h-1.5 rounded-full ${
                        st === 'online' ? 'bg-primary shadow-[0_0_8px_rgba(var(--primary-rgb),0.4)]' :
                        st === 'no-key' ? 'bg-amber-500' : 'bg-muted-foreground/30'
                      }`} />
                    );
                  })()}
                  <span className={`text-[10px] font-bold tracking-tight ${
                    analysisModel ? 'text-foreground/90' : 'text-muted-foreground/50'
                  }`}>{selectedModelName}</span>
                  <ChevronDown size={10} strokeWidth={2} className={`text-muted-foreground/40 transition-transform ${
                    modelSelectorOpen ? 'rotate-180' : ''
                  }`} />
                </button>

                <AnimatePresence>
                  {modelSelectorOpen && (
                    <motion.div
                      initial={{ opacity: 0, y: -4, scale: 0.98 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: -4, scale: 0.98 }}
                      transition={{ duration: 0.15 }}
                      className="absolute right-0 top-full mt-1.5 w-64 bg-white/95 dark:bg-zinc-900/95 backdrop-blur-xl border border-white/20 dark:border-white/5 rounded-xl shadow-[0_0_40px_rgba(0,0,0,0.15)] dark:shadow-[0_0_40px_rgba(0,0,0,0.5)] overflow-hidden z-50"
                    >
                      <div className="p-2 border-b border-border-strong/30">
                        <span className="text-[7px] font-black uppercase tracking-[0.2em] text-muted-foreground/40 px-2">Evaluation Judge</span>
                      </div>
                      <div className="max-h-60 overflow-y-auto custom-scrollbar p-1.5 space-y-0.5">
                        {analysisModels.map(m => (
                          <button
                            key={m.id}
                            onClick={() => {
                              setAnalysisModel(m.id);
                              setModelSelectorOpen(false);
                            }}
                            className={`w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all ${
                              analysisModel === m.id
                                ? 'bg-primary/10 border border-primary/30'
                                : 'hover:bg-muted/30 border border-transparent'
                            }`}
                          >
                            <div className="flex-1 min-w-0">
                              <span className={`text-[10px] font-bold truncate block ${
                                analysisModel === m.id ? 'text-primary' : 'text-foreground/80'
                              }`}>{m.name}</span>
                              <span className="text-[7px] text-muted-foreground/40 uppercase tracking-wider font-bold">{m.provider}</span>
                            </div>
                            {analysisModel === m.id && (
                              <Check size={10} strokeWidth={2.5} className="text-primary shrink-0" />
                            )}
                          </button>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
              
              <button 
                onClick={() => runAnalysis()}
                disabled={isLoading || !hasSuccessfulModels || !analysisModel || (analysisTab === 'code' && !canRunCodeAnalysis)}
                className="p-2 rounded-full bg-muted/10 border border-border/20 hover:bg-primary/5 transition-all text-muted-foreground hover:text-primary group shadow-sm active:scale-90 disabled:opacity-30 disabled:cursor-not-allowed"
              >
                <RefreshCw size={12} className={isLoading ? 'animate-spin' : 'group-hover:rotate-180 transition-transform duration-500'} />
              </button>
            </div>

            <button 
              onClick={() => {
                if (!hasSuccessfulModels) {
                  setActiveMode('grid');
                  return;
                }
                runAnalysis();
              }}
              disabled={isLoading || !hasSuccessfulModels || !analysisModel || (analysisTab === 'code' && !canRunCodeAnalysis)}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary text-white text-[8px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 disabled:opacity-50 active:scale-95 group"
            >
              <Zap size={10} strokeWidth={1.5} className={isLoading ? 'animate-pulse' : ''} />
              {UI_TEXT.analysis.button}
            </button>
          </div>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-6">
          {!hasSuccessfulModels && !isLoading ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-20 opacity-60">
              <div className="w-20 h-20 rounded-2xl bg-white/20 dark:bg-white/5 border border-white/15 dark:border-white/5 flex items-center justify-center mb-8">
                <AlertCircle size={40} strokeWidth={1.5} className="text-amber-500" />
              </div>
              <h3 className="text-xl font-bold tracking-tight text-foreground mb-2">No Model Outputs</h3>
              <p className="text-[11px] font-medium text-muted-foreground/70 max-w-md leading-relaxed mb-6">
                Switch to the Compare tab and run a comparison to generate model responses. Then return here to evaluate the results.
              </p>
              <button
                onClick={() => setActiveMode('grid')}
                className="px-6 py-2 rounded-full bg-primary text-white text-[9px] font-bold uppercase tracking-widest hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
              >
                Go to Compare
              </button>
            </div>
          ) : isLoading ? (
            <div className="py-40 flex flex-col items-center gap-6">
              <div className="relative">
                <Loader2 size={48} className="animate-spin text-primary" />
                <motion.div 
                  animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.6, 0.3] }}
                  transition={{ duration: 2, repeat: Infinity }}
                  className="absolute inset-0 rounded-full bg-primary/20 blur-xl"
                />
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground animate-pulse">
                {UI_TEXT.analysis.loading}
              </p>
            </div>
          ) : analysisTab === 'standard' ? (
            /* Standard Analysis Report */
            analysisOutput ? (
              <div className="max-w-5xl ml-0 space-y-8 pb-20">
                {/* Best Model Hero */}
                {analysisOutput.bestResponseId && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative p-5 rounded-[16px] bg-primary/5 border border-primary/10 overflow-hidden flex flex-col md:flex-row items-center gap-6 group shadow-inner"
                  >
                    <div className="w-20 h-20 rounded-[16px] bg-primary flex items-center justify-center shadow-2xl shrink-0 transition-transform group-hover:scale-105 duration-700">
                      <Trophy size={28} strokeWidth={1.5} className="text-white" />
                    </div>
                    <div className="text-center md:text-left relative z-10">
                      <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-primary mb-1 block">Top Performance</span>
                      <h3 className="text-2xl font-bold tracking-tight text-foreground mb-1">{analysisOutput.bestResponseId}</h3>
                      <p className="text-[10px] text-muted-foreground max-w-xl font-medium leading-relaxed">
                        This model provided the most accurate and useful response for this task.
                      </p>
                    </div>
                  </motion.div>
                )}

                {/* Pillars Grid */}
                <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                  {pillarsMemo.map((pillar, i) => {
                    const diff = analysisOutput.differences?.find(d => d.category.toLowerCase().includes(pillar.id.toLowerCase()));
                    return (
                      <motion.div 
                        key={pillar.id}
                        initial={{ opacity: 0, scale: 0.9 }}
                        animate={{ opacity: 1, scale: 1 }}
                        transition={{ delay: i * 0.05 }}
                         className={`p-3.5 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border transition-all flex flex-col gap-3 shadow-sm hover:shadow-md ${
                          diff ? 'border-white/20 dark:border-white/5' : 'border-white/10 dark:border-white/3 opacity-40'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="w-10 h-10 rounded-[12px] bg-primary/10 flex items-center justify-center text-primary">
                             <pillar.icon size={16} strokeWidth={1.5} />
                          </div>
                        </div>
                        <div>
                          <h4 className="text-[8px] font-bold uppercase tracking-[0.1em] text-foreground mb-1">{pillar.label}</h4>
                          <p className="text-[9px] text-muted-foreground/80 leading-relaxed line-clamp-3">
                            {diff ? diff.description : 'Standard performance.'}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Consensus */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="p-5 rounded-[16px] bg-card/40 backdrop-blur-md border border-border/20 relative group shadow-sm transition-all duration-500"
                >
                  <div className="flex items-center gap-2 mb-6">
                    <Sparkles size={14} strokeWidth={1.5} className="text-primary" />
                    <h4 className="text-[9px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60">Best Combined Solution</h4>
                  </div>
                  <div className="markdown-body max-w-none text-foreground/90">
                    <ReactMarkdown remarkPlugins={[remarkGfm]}>{analysisOutput.consensus || ''}</ReactMarkdown>
                  </div>
                </motion.div>

                {/* Individual Scores */}
                <div className="space-y-6">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 px-4">Model Evaluation</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.entries(analysisOutput.critique).map(([mid, data], i) => (
                      <motion.div 
                        key={mid}
                        initial={{ opacity: 0, x: i % 2 === 0 ? -20 : 20 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="p-4.5 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 flex flex-col gap-4 shadow-sm hover:shadow-md transition-all duration-500"
                      >
                        <div className="flex items-center justify-between">
                          <h5 className="text-sm font-bold text-foreground truncate max-w-[200px] tracking-tight">{mid}</h5>
                          <div className="flex flex-col items-end">
                            <span className="text-[20px] font-bold text-primary tracking-tighter leading-none">{data.score}</span>
                            <span className="text-[8px] font-bold text-muted-foreground/40 uppercase tracking-widest">Score</span>
                          </div>
                        </div>
                        <div className="space-y-4">
                          <p className="text-[11px] text-muted-foreground/80 leading-relaxed italic font-medium">"{data.analysis}"</p>
                          <div className="p-4 rounded-[16px] bg-primary/5 border border-primary/10">
                            <p className="text-[10px] text-primary/80 font-semibold leading-relaxed">{data.actionableFeedback}</p>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-20 opacity-20">
                <div className="w-24 h-24 rounded-[24px] bg-muted/10 border border-border-strong flex items-center justify-center mb-8">
                  <MessageSquare size={40} strokeWidth={1.5} className="text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-foreground mb-4">No Analysis Data</h3>
                <p className="text-[11px] font-medium text-muted-foreground/60 max-w-xs leading-relaxed">
                  Run a model comparison to generate detailed performance insights.
                </p>
              </div>
            )
          ) : (
            /* Code Analysis Report */
            codeAnalysisOutput ? (
              <div className="max-w-7xl ml-0 space-y-12 pb-20">
                {/* Code Winner */}
                <motion.div 
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="relative p-12 rounded-[24px] bg-primary/5 border border-primary/10 overflow-hidden flex flex-col md:flex-row items-center gap-12 group shadow-inner"
                >
                  <div className="w-28 h-28 rounded-[24px] bg-primary flex items-center justify-center shadow-2xl shrink-0">
                    <Code size={56} strokeWidth={1.5} className="text-white" />
                  </div>
                  <div className="text-center md:text-left relative z-10">
                    <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary mb-2 block">{UI_TEXT.analysis.logic.winner}</span>
                    <h3 className="text-3xl font-bold tracking-tight text-foreground mb-2">{codeAnalysisOutput.bestModelId}</h3>
                    <p className="text-[12px] text-muted-foreground max-w-xl font-semibold leading-relaxed">
                      Superior logic and best practices in {codeAnalysisOutput.language}.
                    </p>
                  </div>
                </motion.div>

                {/* Rubric */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  {[
                    { id: 'Execution', icon: ShieldCheck, label: 'Execution', max: 40, color: 'text-emerald-500' },
                    { id: 'Explanation', icon: HelpCircle, label: 'Explanation', max: 30, color: 'text-primary' },
                    { id: 'Efficiency', icon: Gauge, label: 'Efficiency', max: 30, color: 'text-indigo-500' }
                  ].map((cat, i) => {
                    const diff = codeAnalysisOutput.codeDifferences.find(d => d.aspect === cat.id);
                    return (
                      <motion.div 
                        key={cat.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-8 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 flex flex-col gap-5 group hover:shadow-md transition-all duration-500"
                      >
                        <div className="flex items-center justify-between">
                          <div className="w-12 h-12 rounded-[14px] bg-primary/10 flex items-center justify-center text-primary">
                            <cat.icon size={24} strokeWidth={1.5} />
                          </div>
                          <span className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground/30">{cat.max} pts</span>
                        </div>
                        <div>
                          <h4 className="text-[11px] font-bold tracking-tight text-foreground mb-1">{cat.label}</h4>
                          <p className="text-[11px] text-muted-foreground/80 leading-relaxed min-h-[44px] font-medium">
                            {diff ? diff.description : 'No divergence.'}
                          </p>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>

                {/* Implementation */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 overflow-hidden shadow-xl transition-all duration-500"
                >
                  <div className="px-6 py-4 bg-muted/5 border-b border-border-strong flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <FileCode size={20} strokeWidth={1.5} className="text-primary" />
                      <span className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/40">{UI_TEXT.analysis.logic.implementation}</span>
                    </div>
                    <span className="text-[10px] font-mono font-bold text-primary/60 uppercase tracking-widest">{codeAnalysisOutput.language}</span>
                  </div>
                  <div className="p-10">
                    <pre className="text-[13px] font-mono text-foreground overflow-x-auto custom-scrollbar bg-muted/20 p-8 rounded-[24px] border border-border-strong">
                      <code>{codeAnalysisOutput.combinedCode}</code>
                    </pre>
                    <div className="mt-10 p-8 rounded-[24px] bg-primary/5 border border-primary/10">
                      <p className="text-[12px] text-muted-foreground/80 leading-relaxed font-semibold">
                        {codeAnalysisOutput.combinedExplanation}
                      </p>
                    </div>
                  </div>
                </motion.div>

                {/* Score Breakdown */}
                <div className="space-y-6">
                  <h4 className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted-foreground/60 px-4">{UI_TEXT.analysis.logic.scores}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {Object.entries(codeAnalysisOutput.modelCodeAnalysis).map(([mid, data], i) => (
                      <motion.div 
                        key={mid}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="p-10 rounded-2xl bg-white/40 dark:bg-zinc-900/30 backdrop-blur-md border border-white/20 dark:border-white/5 flex flex-col gap-8 shadow-sm hover:shadow-md transition-all duration-500"
                      >
                        <div className="flex items-center justify-between">
                          <div className="min-w-0">
                            <h5 className="text-base font-bold text-foreground truncate mb-1 tracking-tight">{mid}</h5>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="text-[36px] font-bold leading-none text-primary tracking-tighter">{data.codeQualityScore}</span>
                            <span className="text-[9px] font-bold text-muted-foreground/30 uppercase tracking-widest">Total</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-1 gap-5 py-6 border-y border-border-strong">
                          {[
                            { label: 'Execution', score: data.executionScore, max: 40, color: 'bg-emerald-500' },
                            { label: 'Explanation', score: data.explanationScore, max: 30, scoreColor: 'text-primary', color: 'bg-primary' },
                            { label: 'Efficiency', score: data.efficiencyScore, max: 30, scoreColor: 'text-indigo-500', color: 'bg-indigo-500' }
                          ].map(bar => (
                            <div key={bar.label} className="space-y-2">
                              <div className="flex justify-between items-center text-[9px] font-bold uppercase tracking-widest">
                                <span className="text-muted-foreground/40">{bar.label}</span>
                                <span className="text-foreground/60">{bar.score} / {bar.max}</span>
                              </div>
                              <div className="h-2 w-full bg-muted/20 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(bar.score / bar.max) * 100}%` }}
                                  className={`h-full ${bar.color} opacity-80`}
                                />
                              </div>
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-20 opacity-20">
                <div className="w-24 h-24 rounded-[24px] bg-muted/10 border border-border-strong flex items-center justify-center mb-8">
                  <Code size={40} strokeWidth={1.5} className="text-muted-foreground" />
                </div>
                <h3 className="text-2xl font-bold tracking-tight text-foreground mb-4">{UI_TEXT.analysis.logic.noData}</h3>
                <p className="text-[11px] font-medium text-muted-foreground/60 max-w-xs leading-relaxed">
                  Code analysis requires valid code blocks in your model comparison outputs.
                </p>
              </div>
            )
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const AnalysisView = React.memo(AnalysisViewComponent);
