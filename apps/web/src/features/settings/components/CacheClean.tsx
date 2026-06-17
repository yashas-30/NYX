// fallow-ignore-file code-duplication
import React from 'react';
import { motion } from 'framer-motion';
import { Trash2Icon as Trash2 } from '@animateicons/react/lucide';
import { toast } from '@src/shared/components/ui/sonner';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

interface CacheStats {
  itemCount: number;
  totalSizeBytes: number;
  hits: number;
  misses: number;
}

interface CacheCleanProps {
  cacheStats: CacheStats;
  fetchCacheStats: () => Promise<void>;
}

export const CacheClean: React.FC<CacheCleanProps> = ({ cacheStats, fetchCacheStats }) => {
  const handleClearCache = async () => {
    try {
      const res = await fetchWithAuth('/api/v1/cache/clear', { method: 'POST' });
      if (res.ok) {
        const data = await res.json();
        await fetchCacheStats();
        toast.success(`Successfully cleared ${data.clearedCount || 0} cached items!`);
      } else {
        toast.error('Failed to clear cache.');
      }
    } catch (error: any) {
      toast.error(`Error: ${error.message}`);
    }
  };

  const totalCalls = cacheStats.hits + cacheStats.misses;

  return (
    <div className="mt-6 group p-5 rounded-md bg-card border border-border hover:border-accent/25 transition-all duration-300 relative overflow-hidden shadow-sm border border-border">
      <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-accent/20 via-accent/10 to-accent/20 opacity-70 group-hover:opacity-100 transition-opacity" />

      <div className="flex items-center justify-between mb-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.25em] text-accent">
            CACHE STORAGE MANAGER
          </p>
          <h3 className="text-xs font-bold text-foreground mt-0.5">
            Persistent Query Acceleration
          </h3>
        </div>
        <span className="text-[10px] font-bold uppercase tracking-widest text-accent bg-accent/10 px-2 py-0.5 rounded-md border border-accent/20">
          Active Server
        </span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
        <div className="bg-background/60 border border-border rounded-md p-3 flex flex-col justify-between">
          <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest">
            CACHED QUERIES
          </span>
          <span className="text-[15px] font-black font-mono text-foreground mt-1.5">
            {cacheStats.itemCount}
          </span>
        </div>
        <div className="bg-background/60 border border-border rounded-md p-3 flex flex-col justify-between">
          <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest">
            STORAGE USED
          </span>
          <span className="text-[15px] font-black font-mono text-foreground mt-1.5">
            {cacheStats.totalSizeBytes > 1024 * 1024
              ? `${(cacheStats.totalSizeBytes / (1024 * 1024)).toFixed(2)} MB`
              : `${(cacheStats.totalSizeBytes / 1024).toFixed(1)} KB`}
          </span>
        </div>
        <div className="bg-background/60 border border-border rounded-md p-3 flex flex-col justify-between">
          <span className="text-[9px] font-black text-muted-foreground/80 uppercase tracking-widest">
            HIT EFFICIENCY
          </span>
          <span className="text-[15px] font-black font-mono text-accent mt-1.5">
            {totalCalls > 0 ? `${((cacheStats.hits / totalCalls) * 100).toFixed(1)}%` : '0.0%'}
          </span>
        </div>
      </div>

      <div className="mb-4">
        <div className="flex justify-between items-center mb-1 text-[10px] font-black uppercase tracking-wider text-muted-foreground/80">
          <span>Cache Efficiency Index</span>
          <span>
            {cacheStats.hits} Hits / {totalCalls} Total
          </span>
        </div>
        <div className="h-1.5 w-full bg-muted rounded-md overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-accent to-emerald-500 rounded-md transition-all duration-500"
            style={{
              width:
                totalCalls > 0 ? `${Math.min(100, (cacheStats.hits / totalCalls) * 100)}%` : '0%',
            }}
          />
        </div>
      </div>

      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mt-4">
        <p className="text-[11px] text-muted-foreground/80 leading-relaxed max-w-[280px]">
          Persistent query cache automatically mirrors inference results to disk. Submitting
          identical prompts returns results instantly, saving network credits.
        </p>
        <motion.button
          whileTap={cacheStats.itemCount === 0 ? {} : { scale: 0.97 }}
          onClick={handleClearCache}
          disabled={cacheStats.itemCount === 0}
          className={`px-4 py-2.5 rounded-md border text-[11px] font-bold uppercase tracking-[0.2em] transition-all flex items-center gap-2 shrink-0 ${
            cacheStats.itemCount === 0
              ? 'bg-muted/30 border-transparent text-muted-foreground/30 cursor-not-allowed'
              : 'bg-red-500/5 border-red-500/20 text-red-400 hover:bg-red-500 hover:text-white hover:border-red-500 cursor-pointer shadow-sm'
          }`}
        >
          <Trash2 size={10} />
          Purge Cache
        </motion.button>
      </div>
    </div>
  );
};
