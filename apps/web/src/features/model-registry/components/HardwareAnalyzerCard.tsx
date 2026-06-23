import React, { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { Cpu, Memory, HardDrives, Desktop } from '@phosphor-icons/react';

interface HardwareSpecs {
  cpu_cores: number;
  total_ram: number;
  free_ram: number;
  gpu_name: string;
  gpu_vram: number;
}

export const HardwareAnalyzerCard: React.FC = () => {
  const [specs, setSpecs] = useState<HardwareSpecs | null>(null);

  useEffect(() => {
    async function loadSpecs() {
      try {
        const res: any = await invoke('get_hardware_specs');
        if (res.success) {
          setSpecs(res.data);
        }
      } catch (err) {
        console.error('Failed to get hardware specs', err);
      }
    }
    loadSpecs();
    
    const interval = setInterval(loadSpecs, 5000);
    return () => clearInterval(interval);
  }, []);

  if (!specs) return null;

  const gb = (bytes: number) => (bytes / (1024 * 1024 * 1024)).toFixed(1);

  return (
    <div className="bg-card border border-border rounded-xl p-4 flex flex-col gap-3 shadow-sm mb-6">
      <div className="flex items-center gap-2 border-b border-border pb-2">
        <Desktop size={16} weight="duotone" className="text-primary" />
        <h3 className="text-sm font-bold text-foreground">Hardware Analyzer</h3>
      </div>
      
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Cpu size={14} />
            <span className="text-xs font-medium uppercase">CPU Cores</span>
          </div>
          <span className="text-sm font-bold">{specs.cpu_cores} Cores</span>
        </div>
        
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Memory size={14} />
            <span className="text-xs font-medium uppercase">System RAM</span>
          </div>
          <span className="text-sm font-bold">
            {gb(specs.total_ram - specs.free_ram)} / {gb(specs.total_ram)} GB
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <HardDrives size={14} />
            <span className="text-xs font-medium uppercase">GPU</span>
          </div>
          <span className="text-sm font-bold truncate" title={specs.gpu_name}>
            {specs.gpu_name}
          </span>
        </div>

        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-1.5 text-muted-foreground">
            <Memory size={14} />
            <span className="text-xs font-medium uppercase">VRAM</span>
          </div>
          <span className="text-sm font-bold">
            {gb(specs.gpu_vram)} GB
          </span>
        </div>
      </div>
    </div>
  );
};
