import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { useTheme } from '../../shared/context/ThemeContext';
import { CopyIcon as Copy, DownloadIcon as Download } from '@animateicons/react/lucide';
import { Eye, Code as CodeIcon } from 'lucide-react';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [html, setHtml] = useState('');
  const { theme } = useTheme();
  const isSvg = (language === 'svg' || language === 'xml' || language === 'html') && code.includes('<svg');
  const [viewMode, setViewMode] = useState<'preview' | 'code'>(isSvg ? 'preview' : 'code');

  useEffect(() => {
    const highlight = async () => {
      try {
        const highlighted = await codeToHtml(code, {
          lang: language || 'text',
          theme: theme === 'dark' ? 'github-dark' : 'github-light',
        });
        setHtml(highlighted);
      } catch {
        setHtml(`<pre><code>${code}</code></pre>`);
      }
    };
    highlight();
  }, [code, language, theme]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
  };

  return (
    <div className="rounded-lg overflow-hidden border border-border/80 bg-background/50 my-4 shadow-sm">
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border/60 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-mono text-muted-foreground uppercase text-[11px] font-semibold">{filename || language || 'code'}</span>
          {isSvg && (
            <div className="flex items-center gap-1 bg-muted rounded-md p-0.5 ml-2 border border-border/50">
              <button
                onClick={() => setViewMode('preview')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  viewMode === 'preview' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Eye className="w-3 h-3" /> Visual Preview
              </button>
              <button
                onClick={() => setViewMode('code')}
                className={`flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                  viewMode === 'code' ? 'bg-primary text-primary-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <CodeIcon className="w-3 h-3" /> Code
              </button>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={copyToClipboard} title="Copy Code" className="p-1 text-muted-foreground hover:text-foreground transition-colors">
            <Copy className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {isSvg && viewMode === 'preview' ? (
        <div className="p-6 flex flex-col items-center justify-center bg-card/60 rounded-b-lg border-t border-border/30 overflow-x-auto">
          <div
            className="max-w-full overflow-hidden flex items-center justify-center p-2"
            dangerouslySetInnerHTML={{ __html: code }}
          />
        </div>
      ) : (
        <div 
          className="overflow-x-auto p-4 text-sm font-mono leading-relaxed"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      )}
    </div>
  );
}
