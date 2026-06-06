import React from 'react';

export const FileTree: React.FC = () => {
  return (
    <div className="file-tree h-full overflow-y-auto">
      <h3 className="font-semibold px-2">Project Files</h3>
      {/* Semantic relevance indicators will be added here */}
      <ul className="text-sm">
        <li className="p-1 hover:bg-gray-100 cursor-pointer text-blue-600">src/</li>
        <li className="p-1 hover:bg-gray-100 cursor-pointer ml-4">components/</li>
        <li className="p-1 hover:bg-gray-100 cursor-pointer ml-4 text-green-600" title="High relevance">main.tsx</li>
      </ul>
    </div>
  );
};
