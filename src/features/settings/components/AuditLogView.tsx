import React from 'react';
import { FileText, Clock } from 'lucide-react';

interface AuditLog {
  id: string;
  timestamp: string;
  action: string;
  details: string;
}

const mockLogs: AuditLog[] = [
  {
    id: '1',
    timestamp: new Date().toISOString(),
    action: 'Changed Theme',
    details: 'Updated from Dark to Light',
  },
  {
    id: '2',
    timestamp: new Date(Date.now() - 3600000).toISOString(),
    action: 'Added Hotkey',
    details: 'Mapped ctrl+enter to Run Code',
  },
];

export const AuditLogView: React.FC = () => {
  return (
    <div className="bg-card border border-white/[0.04] rounded-3xl p-6 shadow-sm mb-4">
      <div className="flex items-center gap-2 mb-4">
        <FileText size={16} className="text-[#FF3366]" />
        <h3 className="text-sm font-bold text-foreground uppercase tracking-widest">
          Settings Audit Log
        </h3>
      </div>
      <div className="space-y-3 max-h-[200px] overflow-y-auto custom-scrollbar pr-2">
        {mockLogs.map((log) => (
          <div
            key={log.id}
            className="flex gap-4 items-start pb-3 border-b border-white/[0.03] last:border-0 last:pb-0"
          >
            <div className="pt-0.5">
              <Clock size={12} className="text-muted-foreground" />
            </div>
            <div>
              <p className="text-xs font-bold text-foreground">{log.action}</p>
              <p className="text-[10px] text-muted-foreground">{log.details}</p>
              <p className="text-[9px] text-zinc-600 font-mono mt-0.5">
                {new Date(log.timestamp).toLocaleString()}
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
