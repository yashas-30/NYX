import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Package, Download, Check, X, Settings, Globe, Puzzle, Shield, Code, Terminal, Database, Webhook, Plus } from 'lucide-react';
import { pluginSystem, PluginManifest } from '@src/core/services/pluginSystem';
import { toast } from '@src/shared/components/ui/sonner';

interface Plugin {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  installed: boolean;
  enabled: boolean;
  category: 'tools' | 'integrations' | 'agents' | 'productivity';
  tools: string[];
  permissions: string[];
  downloads: number;
  rating: number;
  icon: string;
}

const CATEGORY_ICONS = {
  tools: Terminal,
  integrations: Webhook,
  agents: Puzzle,
  productivity: Package,
};

const CATEGORY_LABELS = {
  tools: 'Developer Tools',
  integrations: 'Integrations',
  agents: 'Agent Frameworks',
  productivity: 'Productivity',
};

export default function PluginsView() {
  const [plugins, setPlugins] = useState<Plugin[]>([]);
  const [activeCategory, setActiveCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPlugin, setSelectedPlugin] = useState<Plugin | null>(null);
  const [isInstalling, setIsInstalling] = useState<string | null>(null);
  const [manifestUrl, setManifestUrl] = useState('');

  const loadPluginsFromSystem = () => {
    const sysPlugins = pluginSystem.getPlugins();
    const mapped: Plugin[] = sysPlugins.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      author: p.author,
      version: p.version,
      installed: p.installed,
      enabled: p.enabled,
      category: p.category as any,
      tools: p.tools.map((t) => t.name),
      permissions: p.permissions || [],
      downloads: p.id === 'calculator-plugin' ? 15400 : p.id === 'weather-plugin' ? 32100 : 5400,
      rating: p.id === 'calculator-plugin' ? 4.8 : p.id === 'weather-plugin' ? 4.9 : 4.5,
      icon: p.category === 'tools' ? 'Terminal' : 'Package',
    }));
    setPlugins(mapped);
  };

  useEffect(() => {
    loadPluginsFromSystem();
  }, []);

  const toggleInstall = (pluginId: string) => {
    setIsInstalling(pluginId);
    setTimeout(() => {
      const allSys = pluginSystem.getPlugins();
      const p = allSys.find(x => x.id === pluginId);
      if (p) {
        if (p.installed) {
          pluginSystem.uninstallPlugin(pluginId);
          toast.success(`Uninstalled ${p.name}`);
        } else {
          pluginSystem.installPluginFromManifest({
            ...p,
            installed: true,
            enabled: true,
          });
          toast.success(`Installed ${p.name}`);
        }
      }
      loadPluginsFromSystem();
      setIsInstalling(null);
    }, 800);
  };

  const toggleEnable = (pluginId: string) => {
    const allSys = pluginSystem.getPlugins();
    const p = allSys.find(x => x.id === pluginId);
    if (p) {
      pluginSystem.togglePlugin(pluginId, !p.enabled);
      toast.success(`${p.name} has been ${!p.enabled ? 'enabled' : 'disabled'}`);
    }
    loadPluginsFromSystem();
  };

  const handleInstallFromUrl = async () => {
    if (!manifestUrl) return;
    try {
      await pluginSystem.installPluginFromUrl(manifestUrl);
      setManifestUrl('');
      loadPluginsFromSystem();
      toast.success('Plugin successfully installed from URL!');
    } catch (e: any) {
      toast.error(e.message || 'Failed to install plugin from URL.');
    }
  };

  const filteredPlugins = plugins.filter((p) => {
    const matchesCategory = activeCategory === 'all' || p.category === activeCategory;
    const matchesSearch =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tools.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  const installedPlugins = plugins.filter((p) => p.installed);
  const availablePlugins = plugins.filter((p) => !p.installed);

  const PluginCard = ({ plugin }: { plugin: Plugin }) => {
    const Icon = CATEGORY_ICONS[plugin.category] || Puzzle;
    const isBusy = isInstalling === plugin.id;

    return (
      <motion.div
        layout
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="bg-card border border-border rounded-xl p-5 hover:border-primary/40 transition-all group"
      >
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Icon size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-foreground">{plugin.name}</h3>
              <p className="text-xs text-muted-foreground">v{plugin.version} by {plugin.author}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {plugin.installed && (
              <button
                onClick={() => toggleEnable(plugin.id)}
                className={`px-2 py-1 rounded text-[10px] font-medium transition-all ${
                  plugin.enabled
                    ? 'bg-green-500/15 text-green-500'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {plugin.enabled ? 'Enabled' : 'Disabled'}
              </button>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground mb-4 leading-relaxed">{plugin.description}</p>

        <div className="flex flex-wrap gap-1.5 mb-4">
          {plugin.tools.slice(0, 4).map((tool) => (
            <span
              key={tool}
              className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground font-medium"
            >
              {tool}
            </span>
          ))}
          {plugin.tools.length > 4 && (
            <span className="px-2 py-0.5 rounded bg-muted text-[10px] text-muted-foreground">
              +{plugin.tools.length - 4}
            </span>
          )}
        </div>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <AnimatedIcon icon={Download} size={10} />
              {plugin.downloads.toLocaleString()}
            </span>
            <span className="flex items-center gap-1">
              <span className="text-amber-500">★</span> {plugin.rating}
            </span>
          </div>

          <button
            onClick={() => toggleInstall(plugin.id)}
            disabled={isBusy}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
              isBusy
                ? 'bg-muted text-muted-foreground cursor-wait'
                : plugin.installed
                ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                : 'bg-primary text-primary-foreground hover:bg-primary/90'
            }`}
          >
            {isBusy ? (
              <motion.div
                animate={{ rotate: 360 }}
                transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full"
              />
            ) : plugin.installed ? (
              <>
                <AnimatedIcon icon={X} size={12} /> Uninstall
              </>
            ) : (
              <>
                <AnimatedIcon icon={Download} size={12} /> Install
              </>
            )}
          </button>
        </div>
      </motion.div>
    );
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <AnimatedIcon icon={Puzzle} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">Plugin Marketplace</h1>
              <p className="text-xs text-muted-foreground">
                {installedPlugins.length} installed · {availablePlugins.length} available
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 border border-border bg-muted/35 rounded-lg p-0.5">
              <input
                type="text"
                value={manifestUrl}
                onChange={(e) => setManifestUrl(e.target.value)}
                placeholder="Install from manifest URL..."
                className="w-48 bg-transparent px-2.5 py-1 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
              <button
                onClick={handleInstallFromUrl}
                className="bg-primary hover:bg-primary/90 text-primary-foreground px-3 py-1 rounded-md text-xs font-semibold flex items-center gap-1 transition-all"
              >
                <AnimatedIcon icon={Plus} size={12} /> Install
              </button>
            </div>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search plugins..."
                className="w-48 px-3 py-2 rounded-lg bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Category Tabs */}
      <div className="shrink-0 px-6 py-3 border-b border-border flex items-center gap-2">
        <button
          onClick={() => setActiveCategory('all')}
          className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
            activeCategory === 'all'
              ? 'bg-primary/10 text-primary'
              : 'text-muted-foreground hover:bg-muted'
          }`}
        >
          All
        </button>
        {Object.entries(CATEGORY_LABELS).map(([key, label]) => {
          const Icon = CATEGORY_ICONS[key as keyof typeof CATEGORY_ICONS] || Puzzle;
          return (
            <button
              key={key}
              onClick={() => setActiveCategory(key)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                activeCategory === key
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Icon size={12} />
              {label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <AnimatePresence mode="wait">
          {searchQuery && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="mb-6"
            >
              <h2 className="text-sm font-medium text-foreground mb-3">
                Search Results ({filteredPlugins.length})
              </h2>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredPlugins.map((plugin) => (
                  <PluginCard key={plugin.id} plugin={plugin} />
                ))}
              </div>
            </motion.div>
          )}

          {!searchQuery && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
              {/* Installed Section */}
              {installedPlugins.length > 0 && (
                <div className="mb-8">
                  <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                    <AnimatedIcon icon={Check} size={14} className="text-green-500" />
                    Installed Plugins ({installedPlugins.length})
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {installedPlugins.map((plugin) => (
                      <PluginCard key={plugin.id} plugin={plugin} />
                    ))}
                  </div>
                </div>
              )}

              {/* Available Section */}
              <div>
                <h2 className="text-sm font-medium text-foreground mb-3 flex items-center gap-2">
                  <AnimatedIcon icon={Download} size={14} className="text-primary" />
                  Available Plugins ({availablePlugins.length})
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {availablePlugins.map((plugin) => (
                    <PluginCard key={plugin.id} plugin={plugin} />
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
