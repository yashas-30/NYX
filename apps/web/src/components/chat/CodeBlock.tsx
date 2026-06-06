import { useEffect, useState } from 'react';
import { codeToHtml } from 'shiki';
import { useTheme } from '../ThemeProvider';

interface CodeBlockProps {
  code: string;
  language: string;
  filename?: string;
}

// Icons placeholders for the missing imports
const CopyIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
  </svg>
);

const DownloadIcon = ({ className }: { className?: string }) => (
  <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor">
    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
  </svg>
);

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
              <CopyIcon className="w-4 h-4" />
            </button>
            <button className="text-text-subtle hover:text-text">
              <DownloadIcon className="w-4 h-4" />
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
