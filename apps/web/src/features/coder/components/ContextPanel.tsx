import React from 'react';

export const ContextPanel: React.FC = () => {
  return (
    <div className="context-panel flex flex-col gap-2 p-2">
      <h3 className="font-semibold">Context</h3>
      <div className="text-xs bg-blue-50 p-2 rounded">
        <strong>Auto-Context:</strong> detected 'auth' dependencies.
      </div>
      <div className="flex gap-1 flex-wrap">
        <span className="bg-gray-200 rounded px-2 py-1 text-xs">AuthService.ts (auto)</span>
        <span className="bg-gray-200 rounded px-2 py-1 text-xs">login.tsx (auto)</span>
      </div>
    </div>
  );
};
