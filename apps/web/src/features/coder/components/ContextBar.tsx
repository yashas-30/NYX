import React from 'react';

export function ContextBar({ currentTokens, maxTokens }: { currentTokens: number, maxTokens: number }) {
  const percentage = (currentTokens / maxTokens) * 100;
  let color = 'bg-green-500';
  if (percentage > 80) color = 'bg-red-500';
  else if (percentage > 50) color = 'bg-yellow-500';

  return (
    <div className="w-full bg-gray-200 rounded-full h-2.5 dark:bg-gray-700">
      <div className={`${color} h-2.5 rounded-full`} style={{ width: `${percentage}%` }}></div>
      <span className="text-xs text-gray-500">{currentTokens} / {maxTokens} tokens</span>
    </div>
  );
}
