// src/features/hf-explorer/components/ActiveDownloads.tsx
import { AnimatePresence, motion } from 'framer-motion';
import { DownloadRow } from './DownloadRow';
import { useDownloadActions } from '../hooks/useHfDownloads';
import type { DownloadState } from '../types';

interface ActiveDownloadsProps {
  downloads: Record<string, DownloadState>;
}

export function ActiveDownloads({ downloads }: ActiveDownloadsProps) {
  const { handlePause, handleResume, handleCancel } = useDownloadActions();

  const activeDownloads = Object.entries(downloads).filter(
    ([, d]) => d.status === 'downloading' || d.status === 'paused' || d.status === 'error'
  );

  if (activeDownloads.length === 0) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ height: 0, opacity: 0 }}
        animate={{ height: 'auto', opacity: 1 }}
        exit={{ height: 0, opacity: 0 }}
        className="shrink-0 px-6 py-3 border-b border-white/[0.06] bg-black flex flex-col gap-2 overflow-hidden"
      >
        <div className="text-[10px] font-bold text-[#71717a] uppercase tracking-widest leading-none">
          Active Downloads
        </div>
        <div className="flex flex-col gap-2">
          {activeDownloads.map(([id, d]) => (
            <DownloadRow
              key={id}
              modelId={id}
              download={d}
              onPause={() => handlePause(id)}
              onResume={() => handleResume(id)}
              onCancel={() => handleCancel(id)}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
