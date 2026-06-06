import React from 'react';

export const CacheDashboard: React.FC = () => {
  return (
    <div className="cache-dashboard p-4 border rounded">
      <h3 className="font-bold mb-2">Semantic Cache Analytics</h3>
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="p-3 bg-blue-50 rounded">
          <div className="text-sm text-gray-500">Hit Rate</div>
          <div className="text-xl font-bold">42%</div>
        </div>
        <div className="p-3 bg-green-50 rounded">
          <div className="text-sm text-gray-500">Tokens Saved</div>
          <div className="text-xl font-bold">1.2M</div>
        </div>
        <div className="p-3 bg-purple-50 rounded">
          <div className="text-sm text-gray-500">Est. Savings</div>
          <div className="text-xl font-bold">$12.50</div>
        </div>
      </div>
      <button className="px-4 py-2 bg-red-100 text-red-700 rounded text-sm hover:bg-red-200">
        Clear All Caches
      </button>
    </div>
  );
};
