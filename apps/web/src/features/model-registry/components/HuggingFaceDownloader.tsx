import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { DownloadSimple, Pause, Play, X, Key, MagnifyingGlass, HardDrives, User, Star, Download, FileText, CheckCircle } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

interface DownloadProgress {
  model_id: string;
  progress: number;
  downloaded: number;
  total: number;
}

interface RestoredDownload {
  model_id: string;
  filename: string;
  url: string;
  total_size: number;
  downloaded: number;
  is_running: boolean;
}

interface HfModelResult {
  id: string;
  downloads: number;
  likes: number;
  tags: string[];
}

interface HardwareSpecs {
  cpu_cores: number;
  total_ram: number;
  free_ram: number;
  gpu_name: string;
  gpu_vram: number;
}

interface HfModelFile {
  filename: string;
  size: number;
}

const getCreatorAndName = (id: string) => {
  const parts = id.split('/');
  if (parts.length > 1) {
    return { creator: parts[0], name: parts.slice(1).join('/') };
  }
  return { creator: 'Community', name: id };
};

export const HuggingFaceDownloader: React.FC = () => {
  const [token, setToken] = useState(localStorage.getItem('hf_token') || '');
  const [activeDownloads, setActiveDownloads] = useState<Record<string, DownloadProgress>>({});
  const [paused, setPaused] = useState<Record<string, boolean>>({});
  
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<HfModelResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const [selectedModel, setSelectedModel] = useState<string | null>(null);
  const [modelFiles, setModelFiles] = useState<HfModelFile[]>([]);
  const [modelDescription, setModelDescription] = useState<string>('');
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  
  const [hardware, setHardware] = useState<HardwareSpecs | null>(null);

  useEffect(() => {
    if (token) {
      localStorage.setItem('hf_token', token);
      invoke('hf_set_token', { token }).catch(console.error);
    } else {
      localStorage.removeItem('hf_token');
    }
  }, [token]);

  useEffect(() => {
    invoke('get_hardware_specs').then((res: any) => {
      if (res.success) {
        setHardware(res.data);
      }
    });

    invoke<RestoredDownload[]>('hf_get_restored_downloads').then(restored => {
      if (restored && restored.length > 0) {
        const newActive: Record<string, DownloadProgress> = {};
        const newPaused: Record<string, boolean> = {};
        restored.forEach(r => {
          newActive[r.model_id] = {
            model_id: r.model_id,
            progress: r.total_size > 0 ? (r.downloaded / r.total_size) * 100 : 0,
            downloaded: r.downloaded,
            total: r.total_size,
          };
          newPaused[r.model_id] = !r.is_running;
        });
        setActiveDownloads(prev => ({ ...prev, ...newActive }));
        setPaused(prev => ({ ...prev, ...newPaused }));
      }
    }).catch(console.error);

    const unlistenProgress = listen<DownloadProgress>('hf-download-progress', (event) => {
      setActiveDownloads(prev => ({ ...prev, [event.payload.model_id]: event.payload }));
    });
    
    const unlistenComplete = listen<{model_id: string}>('hf-download-complete', (event) => {
      setActiveDownloads(prev => {
        const next = { ...prev };
        delete next[event.payload.model_id];
        return next;
      });
    });

    const unlistenError = listen<{model_id: string, error: string}>('hf-download-error', (event) => {
      setActiveDownloads(prev => {
        const next = { ...prev };
        delete next[event.payload.model_id];
        return next;
      });
      // Don't alert if it's just a cancellation to avoid annoying popups
      if (event.payload.error !== "Download cancelled") {
        alert(`Download Error: ${event.payload.error}`);
      }
    });

    return () => {
      unlistenProgress.then(f => f());
      unlistenComplete.then(f => f());
      unlistenError.then(f => f());
    };
  }, []);

  const handleSearch = async () => {
    if (!searchQuery) return;
    setIsSearching(true);
    setSelectedModel(null);
    try {
      const results = await invoke<HfModelResult[]>('hf_search_models', { query: searchQuery });
      setSearchResults(results);
    } catch (e) {
      console.error(e);
      alert(`Search failed: ${e}`);
    } finally {
      setIsSearching(false);
    }
  };

  const selectModel = async (modelId: string) => {
    setSelectedModel(modelId);
    setIsLoadingFiles(true);
    setModelFiles([]);
    setModelDescription('');
    try {
      const [files, readme] = await Promise.all([
        invoke<HfModelFile[]>('hf_get_model_files', { modelId }),
        invoke<string>('hf_get_model_readme', { modelId }).catch(() => 'No description available.')
      ]);
      setModelFiles(files.sort((a, b) => a.size - b.size));
      setModelDescription(readme);
    } catch (e) {
      console.error(e);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleDownload = async (filename: string) => {
    if (!selectedModel) return;
    if (activeDownloads[filename]) {
      return; // Already downloading
    }
    
    if (token) {
      await invoke('hf_set_token', { token });
    }

    const url = `https://huggingface.co/${selectedModel}/resolve/main/${filename}`;
    const modelId = filename;

    try {
      await invoke('hf_download_model', {
        url,
        modelId,
        filename,
        repoId: selectedModel
      });
    } catch (err) {
      console.error(err);
      alert(`Failed to start download: ${err}`);
    }
  };

  const handlePause = async (modelId: string) => {
    try {
      await invoke('hf_pause_download', { modelId });
      setPaused(prev => ({ ...prev, [modelId]: true }));
    } catch (e) {
      console.warn('Failed to pause:', e);
    }
  };

  const handleResume = async (modelId: string) => {
    try {
      await invoke('hf_resume_download', { modelId });
      setPaused(prev => ({ ...prev, [modelId]: false }));
    } catch (e) {
      console.warn('Failed to resume:', e);
    }
  };

  const handleCancel = async (modelId: string) => {
    try {
      await invoke('hf_cancel_download', { modelId });
    } catch (e) {
      console.warn('Failed to cancel:', e);
    }
    // Optimistically remove from UI in any case
    setPaused(prev => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
    setActiveDownloads(prev => {
      const next = { ...prev };
      delete next[modelId];
      return next;
    });
  };

  const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const recommendQuantization = (filename: string) => {
    if (!hardware) return false;
    const totalRamGB = hardware.total_ram / (1024 * 1024 * 1024);
    
    if (totalRamGB >= 8 && filename.toLowerCase().includes('q4_k_m')) {
      return true;
    }
    if (totalRamGB < 8 && filename.toLowerCase().includes('q3_k_m')) {
      return true;
    }
    return false;
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-4 shadow-sm mt-4 min-h-[500px]">
      <div className="flex items-center justify-between border-b border-border pb-2">
        <div className="flex items-center gap-2">
          <DownloadSimple size={16} weight="duotone" className="text-primary" />
          <h3 className="text-sm font-bold text-foreground">Hugging Face Downloader</h3>
        </div>
        <div className="relative w-64">
          <Key size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="password" 
            value={token}
            onChange={e => setToken(e.target.value)}
            placeholder="HF Auth Token (Optional)"
            className="bg-background border border-border rounded-md text-[10px] py-1.5 pl-7 pr-2 outline-none focus:border-primary w-full"
          />
        </div>
      </div>

      <div className="flex gap-2 items-center">
        <div className="relative flex-1">
          <MagnifyingGlass size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input 
            type="text" 
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSearch()}
            placeholder="Search Hugging Face for models (e.g. Llama-3, Qwen)..."
            className="bg-background border border-border rounded-md text-xs py-2 pl-8 pr-8 outline-none focus:border-primary w-full"
          />
          {searchQuery && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSearchResults([]);
                setSelectedModel(null);
              }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X size={14} />
            </button>
          )}
        </div>
        <button 
          onClick={handleSearch}
          disabled={isSearching}
          className="bg-primary text-primary-foreground px-4 py-2 rounded-md text-xs font-bold shrink-0 disabled:opacity-50"
        >
          {isSearching ? 'Searching...' : 'Search'}
        </button>
      </div>

      {searchResults.length > 0 && (
        <div className="flex h-[600px] border border-border rounded-xl overflow-hidden bg-background shadow-sm">
          
          {/* Left Pane: Search Results */}
          <div className="w-[240px] shrink-0 border-r border-border overflow-y-auto custom-scrollbar bg-background">
            {searchResults.map(model => {
              const { creator, name } = getCreatorAndName(model.id);
              const isSelected = selectedModel === model.id;
              
              return (
                <div 
                  key={model.id}
                  onClick={() => selectModel(model.id)}
                  className={`p-3 cursor-pointer border-b border-border/50 transition-all duration-200 group relative ${
                    isSelected 
                      ? 'bg-primary/5' 
                      : 'hover:bg-muted/30'
                  }`}
                >
                  {isSelected && (
                    <motion.div 
                      layoutId="activeModelIndicator"
                      className="absolute left-0 top-0 bottom-0 w-1 bg-primary rounded-r-full"
                    />
                  )}
                  <div className="flex flex-col gap-1 pl-1">
                    <div className="flex items-center gap-1.5 text-muted-foreground mb-0.5">
                      <User size={12} weight="fill" />
                      <span className="text-[10px] font-semibold tracking-wider uppercase truncate">{creator}</span>
                    </div>
                    <div className={`text-sm font-bold truncate ${isSelected ? 'text-primary' : 'text-foreground group-hover:text-primary transition-colors'}`} title={name}>
                      {name}
                    </div>
                    
                    <div className="flex items-center gap-4 mt-2">
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 font-medium bg-background/50 px-2 py-0.5 rounded-full border border-border/50">
                        <Download size={12} weight="bold" className="text-blue-500" />
                        <span>{model.downloads >= 1000 ? (model.downloads / 1000).toFixed(1) + 'k' : model.downloads}</span>
                      </div>
                      <div className="flex items-center gap-1 text-[11px] text-muted-foreground/80 font-medium bg-background/50 px-2 py-0.5 rounded-full border border-border/50">
                        <Star size={12} weight="bold" className="text-yellow-500" />
                        <span>{model.likes >= 1000 ? (model.likes / 1000).toFixed(1) + 'k' : model.likes}</span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          
          {/* Right Pane: Selected Model Details */}
          <div className="flex-1 flex flex-col h-full bg-background relative">
            {selectedModel ? (
              isLoadingFiles ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin mb-4"></div>
                  <div className="text-sm font-medium text-muted-foreground animate-pulse">Fetching model data...</div>
                </div>
              ) : (
                <div className="flex flex-col h-full overflow-hidden">
                  
                  {/* Header */}
                  <div className="p-8 border-b border-border bg-gradient-to-b from-card/40 to-background flex-shrink-0 relative overflow-hidden">
                    {/* Decorative subtle background elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/4 pointer-events-none" />
                    
                    <div className="relative z-10">
                      <div className="flex items-center gap-2 text-muted-foreground mb-3">
                        <User size={16} weight="duotone" className="text-primary/70" />
                        <span className="text-sm font-semibold tracking-wide text-foreground/80">{getCreatorAndName(selectedModel).creator}</span>
                      </div>
                      <h2 className="text-3xl font-bold text-foreground tracking-tight break-all leading-tight mb-4">
                        {getCreatorAndName(selectedModel).name}
                      </h2>
                      
                      <div className="flex flex-wrap gap-2">
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-primary/10 text-primary border border-primary/20 flex items-center gap-1.5 shadow-sm">
                          <FileText size={14} weight="fill" />
                          GGUF Format
                        </span>
                        <span className="px-3 py-1 rounded-full text-xs font-bold bg-muted/80 text-muted-foreground border border-border/50 shadow-sm">
                          Text Generation
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Content Split (Readme + Files) */}
                  <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col p-8 gap-10">
                    
                    {/* Readme Section */}
                    {modelDescription && (
                      <div className="flex flex-col gap-4">
                        <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                          <FileText size={20} weight="duotone" className="text-primary/70" />
                          Model Card
                        </h3>
                        <div className="text-sm text-foreground/80 leading-relaxed font-sans">
                          <div className="whitespace-pre-wrap">
                            {modelDescription.substring(0, 5000)}
                            {modelDescription.length > 5000 ? (
                              <span className="text-muted-foreground italic ml-2">...[Description truncated]</span>
                            ) : ''}
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Files Section */}
                    <div className="flex flex-col gap-3 pb-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrives size={16} weight="duotone" className="text-muted-foreground" />
                          <h3 className="text-sm font-bold text-foreground">Available Quantizations</h3>
                        </div>
                        <span className="text-[10px] font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full border border-border">
                          {modelFiles.length} files
                        </span>
                      </div>
                      
                      {modelFiles.length > 0 ? (
                        <div className="grid grid-cols-1 gap-4">
                          {modelFiles.map(file => {
                            const recommended = recommendQuantization(file.filename);
                            return (
                              <div key={file.filename} className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-background border rounded-xl p-4 transition-all duration-300 hover:shadow-sm ${recommended ? 'border-green-500/30 hover:border-green-500/50' : 'border-border/60 hover:border-border'}`}>
                                <div className="flex flex-col min-w-0 flex-1 gap-1.5">
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm font-semibold text-foreground break-all" title={file.filename}>
                                      {file.filename}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    <span className="text-xs font-medium text-muted-foreground">
                                      {formatSize(file.size)}
                                    </span>
                                    {recommended && (
                                      <span className="flex items-center gap-1 text-[10px] text-green-600 dark:text-green-400 font-bold uppercase tracking-wider bg-green-500/10 px-2 py-0.5 rounded border border-green-500/20">
                                        <CheckCircle size={12} weight="bold" />
                                        Recommended Size
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button 
                                  onClick={() => handleDownload(file.filename)}
                                  disabled={!!activeDownloads[file.filename]}
                                  className="bg-primary hover:bg-primary/90 text-primary-foreground px-5 py-2.5 rounded-lg text-xs font-bold shrink-0 shadow-sm transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                  <DownloadSimple size={14} weight="bold" />
                                  {activeDownloads[file.filename] ? 'Downloading...' : 'Download'}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <div className="flex flex-col items-center justify-center py-12 px-4 bg-muted/30 border border-dashed border-border rounded-xl">
                          <HardDrives size={32} weight="duotone" className="text-muted-foreground/50 mb-3" />
                          <div className="text-sm font-bold text-foreground mb-1">No GGUF files found</div>
                          <div className="text-xs text-muted-foreground text-center max-w-xs">This model does not contain any compatible GGUF quantizations in its main branch.</div>
                        </div>
                      )}
                    </div>
                    
                  </div>
                </div>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center p-8 bg-muted/10">
                <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 border border-border shadow-sm">
                  <MagnifyingGlass size={24} weight="duotone" className="text-muted-foreground" />
                </div>
                <h3 className="text-lg font-bold text-foreground mb-2">Select a Model</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Search for a model and select it from the left sidebar to view its details and download its GGUF files.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {Object.keys(activeDownloads).length > 0 && (
        <div className="flex flex-col gap-2 mt-2 pt-2 border-t border-border">
          <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider mb-1">Active Downloads</h4>
          {Object.values(activeDownloads).map(d => (
            <div key={d.model_id} className="flex flex-col gap-2 p-3 bg-background border border-border rounded-lg">
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold truncate max-w-[200px]" title={d.model_id}>{d.model_id}</span>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] text-muted-foreground">
                    {formatSize(d.downloaded)} / {formatSize(d.total)} ({d.progress.toFixed(1)}%)
                  </span>
                  {paused[d.model_id] ? (
                    <button onClick={() => handleResume(d.model_id)} className="p-1 hover:bg-muted rounded">
                      <Play size={12} className="text-green-500" />
                    </button>
                  ) : (
                    <button onClick={() => handlePause(d.model_id)} className="p-1 hover:bg-muted rounded">
                      <Pause size={12} className="text-yellow-500" />
                    </button>
                  )}
                  <button onClick={() => handleCancel(d.model_id)} className="p-1 hover:bg-muted rounded">
                    <X size={12} className="text-red-500" />
                  </button>
                </div>
              </div>
              <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                <div 
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${d.progress}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
