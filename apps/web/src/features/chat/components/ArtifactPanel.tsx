import React, { useState, useMemo } from 'react';
import { X, Code2, Copy, Download, Maximize2, Minimize2, Play } from 'lucide-react';

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
  
  const isReact = ['jsx', 'tsx', 'typescript', 'react'].includes(artifact.language?.toLowerCase() || '');
  const isRenderable = ['html', 'svg', 'javascript'].includes(artifact.language?.toLowerCase() || '') || isReact;
  const [activeTab, setActiveTab] = useState<'code' | 'preview'>(isRenderable ? 'preview' : 'code');

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

  const iframeSrcDoc = useMemo(() => {
    if (!isRenderable) return '';
    // Inject Tailwind for Claude-like generative UI
    const tailwindScript = '<script src="https://cdn.tailwindcss.com"></script>';
    
    if (isReact) {
      // Uncompromising SOTA Parity: Inject Babel, React, ReactDOM
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${tailwindScript}
            <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
            <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
            <style>
              body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #fff; background: #09090B; margin: 0; padding: 1rem; }
            </style>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel" data-presets="react,typescript">
              // Strip imports since we are using global React
              const rawCode = \`${artifact.content.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`;
              const codeWithoutImports = rawCode.replace(/import .* from .*;?/g, '');
              
              // We need to extract the default export name to mount it
              let defaultExportName = 'App';
              const match = codeWithoutImports.match(/export default (function|class) (\\w+)/);
              if (match) {
                defaultExportName = match[2];
              } else {
                const matchConst = codeWithoutImports.match(/export default (\\w+)/);
                if (matchConst) defaultExportName = matchConst[1];
              }

              // Evaluate the code
              const transpiledCode = Babel.transform(codeWithoutImports, { presets: ['react', 'typescript'] }).code;
              eval(transpiledCode);

              // Mount it
              const root = ReactDOM.createRoot(document.getElementById('root'));
              root.render(React.createElement(eval(defaultExportName)));
            </script>
          </body>
        </html>
      `;
    }

    let htmlContent = artifact.content;
    if (artifact.language?.toLowerCase() === 'svg') {
      htmlContent = `<div class="flex items-center justify-center min-h-screen">${artifact.content}</div>`;
    }

    if (!htmlContent.includes('<head>')) {
      return `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            ${tailwindScript}
            <style>
              body { font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; color: #fff; background: #09090B; }
            </style>
          </head>
          <body>
            ${htmlContent}
          </body>
        </html>
      `;
    }
    
    // If it already has a head, just inject Tailwind before the closing head tag
    return htmlContent.replace('</head>', `${tailwindScript}</head>`);
  }, [artifact.content, artifact.language, isRenderable, isReact]);

  return (
    <div
      className={`
      flex flex-col bg-[#09090B] border-l border-[rgba(255,255,255,0.06)] transition-all duration-300 z-50
      ${isFullscreen ? 'fixed inset-0 w-full h-full' : 'absolute top-0 right-0 w-1/3 h-full min-w-[400px] max-w-[600px] shadow-sm border border-border'}
    `}
    >
      <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0e1416]">
        <div className="flex items-center gap-3">
          <div className="p-1.5 bg-[#18181B] rounded text-primary">
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
          {isRenderable && (
            <div className="flex bg-[#18181B] rounded p-1 mr-2">
              <button
                onClick={() => setActiveTab('preview')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${activeTab === 'preview' ? 'bg-[#27272A] text-white' : 'text-[#4A5059] hover:text-white'}`}
              >
                <div className="flex items-center gap-1"><Play className="w-3 h-3" /> Preview</div>
              </button>
              <button
                onClick={() => setActiveTab('code')}
                className={`px-3 py-1 text-xs font-medium rounded transition-colors ${activeTab === 'code' ? 'bg-[#27272A] text-white' : 'text-[#4A5059] hover:text-white'}`}
              >
                <div className="flex items-center gap-1"><Code2 className="w-3 h-3" /> Code</div>
              </button>
            </div>
          )}

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

      <div className="flex-1 overflow-hidden bg-[#09090B] relative">
        {activeTab === 'code' ? (
          <div className="h-full overflow-auto p-4">
            <pre className="font-mono text-[13px] text-[#dde4e5] leading-relaxed whitespace-pre-wrap">
              {artifact.content}
            </pre>
          </div>
        ) : (
          <iframe
            title="Artifact Preview Sandbox"
            srcDoc={iframeSrcDoc}
            className="w-full h-full bg-white border-0"
            sandbox="allow-scripts allow-forms allow-popups allow-modals"
          />
        )}
      </div>
    </div>
  );
};
