import React, { useState } from 'react';
import { X, Code2, Copy, Download, Maximize2, Minimize2 } from 'lucide-react';

interface ArtifactPanelProps {
  artifact: {
    id: string;
    title: string;
    type: string;
    content: string;
    language?: string;
  };
  onClose: () => void;
}

export const ArtifactPanel: React.FC<ArtifactPanelProps> = ({ artifact, onClose }) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(artifact.content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${artifact.title.replace(/\\s+/g, '_')}.${artifact.language || 'txt'}`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div
      className={`
      flex flex-col bg-[#09090B] border-l border-[rgba(255,255,255,0.06)] transition-all duration-300 z-50
      ${isFullscreen ? 'fixed inset-0 w-full h-full' : 'absolute top-0 right-0 w-1/3 h-full min-w-[400px] max-w-[600px] shadow-2xl'}
    `}
    >
      <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0e1416]">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-[#18181B] rounded text-[#FF3366]">
            <Code2 className="w-4 h-4" />
          </div>
          <div>
            <h3 className="text-[14px] font-medium text-[#F8FAFC]">{artifact.title}</h3>
            <span className="text-[11px] font-mono text-[#4A5059]">
              {artifact.type} {artifact.language ? `• ${artifact.language}` : ''}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleCopy}
            className="p-1.5 text-[#4A5059] hover:text-[#F8FAFC] hover:bg-[#18181B] rounded transition-colors"
            title="Copy Content"
          >
            <Copy className="w-4 h-4" />
          </button>
          <button
            onClick={handleDownload}
            className="p-1.5 text-[#4A5059] hover:text-[#F8FAFC] hover:bg-[#18181B] rounded transition-colors"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="p-1.5 text-[#4A5059] hover:text-[#F8FAFC] hover:bg-[#18181B] rounded transition-colors"
            title="Toggle Fullscreen"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
          <div className="w-px h-4 bg-[rgba(255,255,255,0.1)] mx-1" />
          <button
            onClick={onClose}
            className="p-1.5 text-[#4A5059] hover:text-[#ffb4ab] hover:bg-[#93000a]/20 rounded transition-colors"
            title="Close Panel"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4 bg-[#09090B]">
        <pre className="font-mono text-[13px] text-[#dde4e5] leading-relaxed whitespace-pre-wrap">
          {artifact.content}
        </pre>
      </div>
    </div>
  );
};
