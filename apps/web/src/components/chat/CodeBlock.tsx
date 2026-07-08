import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { useTheme } from '../ThemeProvider';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

import { CopyIcon as Copy, DownloadIcon as Download } from '@animateicons/react/lucide';

export function CodeBlock({ code, language, filename }: CodeBlockProps) {
  const [html, setHtml] = useState('');
  const { resolvedTheme } = useTheme();

  useEffect(() => {
    const highlight = async () => {
      const highlighted = await codeToHtml(code, {
        lang: language || 'text',
        theme: resolvedTheme === 'dark' ? 'github-dark' : 'github-light',
      });
      setHtml(highlighted);
    };
    highlight();
  }, [code, language, resolvedTheme]);

  const copyToClipboard = () => {
    navigator.clipboard.writeText(code);
    // Show toast
  };

  return (
    <div className="rounded-md overflow-hidden border border-border my-4">
      {filename && (
        <div className="flex items-center justify-between px-4 py-2 bg-surface border-b border-border">
          <span className="text-sm text-text-muted font-mono">{filename}</span>
          <div className="flex gap-2">
            <button onClick={copyToClipboard} className="text-text-subtle hover:text-text">
              <Copy className="w-4 h-4" />
            </button>
            <button className="text-text-subtle hover:text-text">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
      <div 
        className="overflow-x-auto p-4 text-sm font-mono"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
