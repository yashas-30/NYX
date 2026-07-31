// src/features/hf-explorer/components/SkeletonCard.tsx
import React from 'react';

export function SkeletonCard() {
  return (
    <div className="flex flex-col rounded-xl border border-gray-200/80 dark:border-gray-800 bg-white dark:bg-gray-950 animate-pulse overflow-hidden h-[140px]">
      {/* Body */}
      <div className="flex flex-col gap-2.5 p-4 flex-1">
        <div className="flex items-start gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-muted/60 shrink-0" />
          <div className="space-y-1.5 flex-1">
            <div className="h-2.5 w-16 bg-muted/40 rounded" />
            <div className="h-3.5 w-32 bg-muted/60 rounded" />
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="h-4 w-20 bg-muted/40 rounded-md" />
          <div className="h-4 w-10 bg-muted/40 rounded-md" />
          <div className="h-4 w-10 bg-muted/30 rounded-md" />
        </div>
      </div>
      {/* Footer */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-t border-gray-100 dark:border-gray-800/80 bg-gray-50/60 dark:bg-gray-900/40">
        <div className="h-3 w-12 bg-muted/50 rounded" />
        <div className="h-3 w-10 bg-muted/50 rounded" />
        <div className="ml-auto h-3 w-14 bg-muted/30 rounded" />
      </div>
    </div>
  );
}
