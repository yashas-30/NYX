import React from 'react';

interface UnifiedDiffViewerProps {
  code: string;
}

export const UnifiedDiffViewer: React.FC<UnifiedDiffViewerProps> = ({ code }) => {
  const lines = code.split('\n');

  return (
    <div
      className="w-full text-left overflow-x-auto bg-[#111622]"
      style={{
        fontFamily: '"Geist Mono","Fira Code","Cascadia Code",ui-monospace,monospace',
        fontSize: '12px',
      }}
    >
      <div className="py-4">
        {lines.map((line, idx) => {
          let lineType = 'normal';
          if (line.startsWith('@@')) {
            lineType = 'hunk';
          } else if (line.startsWith('+') && !line.startsWith('+++')) {
            lineType = 'addition';
          } else if (line.startsWith('-') && !line.startsWith('---')) {
            lineType = 'deletion';
          } else if (line.startsWith('+++') || line.startsWith('---')) {
            lineType = 'file';
          }

          let bgColor = 'bg-transparent';
          let textColor = 'text-zinc-300';
          let indicator = ' ';

          switch (lineType) {
            case 'addition':
              bgColor = 'bg-emerald-500/10';
              textColor = 'text-emerald-400';
              indicator = '+';
              break;
            case 'deletion':
              bgColor = 'bg-red-500/10';
              textColor = 'text-red-400';
              indicator = '-';
              break;
            case 'hunk':
              bgColor = 'bg-blue-500/10';
              textColor = 'text-blue-400';
              break;
            case 'file':
              textColor = 'text-zinc-400 font-bold';
              break;
          }

          return (
            <div
              key={idx}
              className={`flex px-4 py-[1px] leading-relaxed w-full whitespace-pre ${bgColor} hover:bg-white/[0.02] transition-colors`}
            >
              <div className="select-none text-zinc-500 opacity-50 w-6 text-right pr-3 shrink-0 border-r border-white/5 mr-3">
                {idx + 1}
              </div>
              <div className={`flex-1 ${textColor} break-all`}>{line}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
