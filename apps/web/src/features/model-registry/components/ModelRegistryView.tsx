import React, { useState, useMemo, useEffect } from 'react';
import { motion } from 'framer-motion';
import { MagnifyingGlass, Package, Cpu, Globe } from '@phosphor-icons/react';
import { AVAILABLE_MODELS } from '@shared/config/models';
import { ModelOption } from '@src/types';
import { useTokenUsage } from '@src/shared/context/TokenUsageContext';
import { useLocalModels } from '@src/shared/hooks/useLocalModels';
import { SectionHeader, EmptyState } from './RegistryShared';
import { ModelCard } from './ModelCard';
import { LocalProviderStatus } from '@src/components/LocalProviderStatus';

interface ModelRegistryViewProps {
  models?: Record<'nyx', string>;
  selectModel?: (modelId: string) => void;
  apiKeys: Record<string, string>;
  providerStatuses?: Record<string, 'online' | 'offline' | 'no-key'>;
  activeMode?: 'coder' | 'registry' | 'settings' | 'compare';
  setActiveMode?: (mode: 'coder' | 'registry' | 'settings' | 'compare') => void;
  sidebarOpen?: boolean;
}

const ModelRegistryViewComponent: React.FC<ModelRegistryViewProps> = ({
  selectModel,
  apiKeys,
  providerStatuses,
  activeMode,
  setActiveMode,
  sidebarOpen = true,
}) => {
  const { usage } = useTokenUsage();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'local' | 'cloud'>('local');
  const [expandedModelId, setExpandedModelId] = useState<string | null>(null);

  const [ollamaModels, setOllamaModels] = useState<any[]>([]);
  const [lmstudioModels, setLmstudioModels] = useState<any[]>([]);

  const localModelsQuery = useLocalModels(true);

  useEffect(() => {
    if (localModelsQuery.data) {
      setOllamaModels(localModelsQuery.data.ollamaModels || []);
      setLmstudioModels(localModelsQuery.data.lmstudioModels || []);
    }
  }, [localModelsQuery.data]);

  const query = search.toLowerCase();

  const cloudModels = useMemo(
    () =>
      AVAILABLE_MODELS.filter(
        (m) =>
          m.provider !== 'ollama' && m.provider !== 'lmstudio' &&
          (m.name.toLowerCase().includes(query) || m.provider.toLowerCase().includes(query))
      ),
    [query]
  );

  const groupedCloud = useMemo(() => {
    const grouped = cloudModels.reduce(
      (acc, m) => {
        if (!acc[m.provider]) acc[m.provider] = [];
        acc[m.provider].push(m);
        return acc;
      },
      {} as Record<string, ModelOption[]>
    );

    return Object.entries(grouped).sort(([a], [b]) => {
      if (a === 'gemini') return -1;
      if (b === 'gemini') return 1;
      return a.localeCompare(b);
    });
  }, [cloudModels]);

  const showLocal = filter === 'local';
  const showCloud = filter === 'cloud';

  return (
    <motion.div
      key="registry"
      initial={{ opacity: 0, y: 20, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
      className="h-full w-full flex flex-col min-h-0 overflow-hidden"
    >
      <div className="flex-1 min-h-0 w-full flex flex-col overflow-hidden relative">
        <header
          className={`flex flex-col lg:flex-row lg:items-center justify-between gap-4 py-1.5 px-4 ${!sidebarOpen ? 'pl-14' : ''} border-b border-border shrink-0 select-none bg-card transition-all duration-300`}
        >
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Package size={16} weight="duotone" className="text-primary" />
              <h2 className="text-xs font-bold tracking-wider text-foreground uppercase">
                Model Registry
              </h2>
            </div>
            {showLocal && <LocalProviderStatus />}
          </div>

          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 w-full lg:w-auto">
            <div className="relative group w-full sm:w-auto">
              <MagnifyingGlass
                size={12}
                weight="bold"
                className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/30 transition-colors group-focus-within:text-primary"
              />
              <input
                type="text"
                placeholder="Search models..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    e.currentTarget.blur();
                  }
                }}
                className="
                  bg-background border border-border rounded-md
                  text-[11px] font-medium text-foreground
                  pl-8 pr-3 py-1.5 w-full sm:w-48
                  outline-none focus:border-primary/30
                  transition-all placeholder:text-muted-foreground/20
                "
              />
            </div>

            <div className="flex gap-1 bg-background p-1 rounded-md border border-border shrink-0 w-full sm:w-auto overflow-x-auto scrollbar-none">
              {(['local', 'cloud'] as const).map((f) => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`
                    flex-1 sm:flex-none px-3 py-1 rounded-md text-[11px] font-bold uppercase tracking-tight transition-all text-center
                    ${
                      filter === f
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground/60 hover:text-foreground hover:bg-muted'
                    }
                  `}
                >
                  {f === 'local' ? 'Local' : 'Cloud'}
                </button>
              ))}
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-6">
          {showLocal && (
            <div className="flex flex-col gap-6">
              <section className="space-y-4 p-6 rounded-2xl bg-card border border-border mt-6 shadow-sm">
                <SectionHeader
                  icon={<Cpu size={18} weight="duotone" className="text-orange-500" />}
                  title="Ollama Local Library"
                  subtitle="Models hosted by your local Ollama instance"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
                  {ollamaModels.map((m, idx) => (
                     <ModelCard key={m.id} index={idx} name={m.name} provider={m.provider} description={m.description} specs={m.specs} features={m.features} pros={m.pros} cons={m.cons} hasKey={true} status="online" usage={undefined} isExpanded={expandedModelId === m.id} onToggleExpand={() => setExpandedModelId(expandedModelId === m.id ? null : m.id)} />
                  ))}
                  {ollamaModels.length === 0 && (
                     <div className="col-span-full">
                       <EmptyState message="No Ollama models found" hint="Ensure Ollama is running and has downloaded models." />
                     </div>
                  )}
                </div>
              </section>
              
              <section className="space-y-4 p-6 rounded-2xl bg-card border border-border mt-6 shadow-sm">
                <SectionHeader
                  icon={<Cpu size={18} weight="duotone" className="text-blue-500" />}
                  title="LM Studio Local Library"
                  subtitle="Models hosted by your local LM Studio instance"
                />
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
                  {lmstudioModels.map((m, idx) => (
                     <ModelCard key={m.id} index={idx} name={m.name} provider={m.provider} description={m.description} specs={m.specs} features={m.features} pros={m.pros} cons={m.cons} hasKey={true} status="online" usage={undefined} isExpanded={expandedModelId === m.id} onToggleExpand={() => setExpandedModelId(expandedModelId === m.id ? null : m.id)} />
                  ))}
                  {lmstudioModels.length === 0 && (
                     <div className="col-span-full">
                       <EmptyState message="No LM Studio models found" hint="Ensure LM Studio server is running on port 1234." />
                     </div>
                  )}
                </div>
              </section>
            </div>
          )}

          {showCloud && (
            <section className="space-y-6 p-6 rounded-2xl bg-card border border-border shadow-sm">
              <SectionHeader
                icon={<Globe size={18} weight="duotone" />}
                title="Cloud Models"
                subtitle="Ready to use online models"
              />

              {groupedCloud.map(([provider, models]) => (
                <div key={provider} className="space-y-4">
                  <div className="flex items-center gap-3">
                    <span className="text-[11px] font-black uppercase tracking-[0.3em] text-muted-foreground/80 shrink-0">
                      {provider}
                    </span>
                    <div className="h-px flex-1 bg-gradient-to-r from-border/40 to-transparent" />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 items-start">
                    {models.map((m, idx) => (
                      <ModelCard
                        key={m.id}
                        index={idx}
                        name={m.name}
                        provider={m.provider}
                        description={m.description}
                        specs={m.specs as any}
                        features={m.features}
                        pros={m.pros}
                        cons={m.cons}
                        usage={usage[m.provider]}
                        hasKey={!!apiKeys[m.provider]}
                        status={providerStatuses?.[m.provider]}
                        lifecycleStatus={m.status || 'ga'}
                        shutdownDate={m.shutdownDate}
                        isExpanded={expandedModelId === m.id}
                        onToggleExpand={() => setExpandedModelId(expandedModelId === m.id ? null : m.id)}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </section>
          )}
        </div>
      </div>
    </motion.div>
  );
};

export const ModelRegistryView = React.memo(ModelRegistryViewComponent);
