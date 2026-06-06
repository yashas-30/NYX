import React from 'react';

export function RoutingSettings() {
  return (
    <div>
      <h2>Hybrid Intelligence Router</h2>
      <select>
        <option value="balanced">Balanced Mode</option>
        <option value="privacy">Privacy Mode (Local Only)</option>
        <option value="speed">Speed Mode (Fallback Local)</option>
        <option value="quality">Quality Mode (Cloud Heavily)</option>
      </select>
    </div>
  );
}
