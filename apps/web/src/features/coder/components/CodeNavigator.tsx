import React from 'react';

export const CodeNavigator: React.FC<{ filePath: string }> = ({ filePath }) => {
  return (
    <div className="code-navigator p-4 border rounded-md">
      <h3 className="text-lg font-bold">Code Navigator</h3>
      <p className="text-sm text-gray-500">Semantic view for {filePath}</p>
      {/* Interactive AST-based graph will render here */}
      <div className="mt-4 p-2 bg-gray-100 rounded">
        <ul>
          <li><strong>Functions:</strong> (Loading...)</li>
          <li><strong>Dependencies:</strong> (Loading...)</li>
          <li><strong>Callers:</strong> (Loading...)</li>
        </ul>
      </div>
    </div>
  );
};
