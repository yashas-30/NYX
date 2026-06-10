import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Maximize2, Minimize2, X, Code, Play } from 'lucide-react';
import { Button } from '@src/shared/components/ui/button';

export interface ArtifactCanvasProps {
  content: string;
  language?: string;
  title?: string;
  isOpen: boolean;
  onClose: () => void;
}

export const ArtifactCanvas: React.FC<ArtifactCanvasProps> = ({
  content,
  language = 'html',
  title = 'Artifact',
  isOpen,
  onClose,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');

  // Basic HTML template for iframe rendering
  const [iframeSrcDoc, setIframeSrcDoc] = useState('');

  useEffect(() => {
    if (language === 'html' || language === 'react') {
      const htmlContent = language === 'html' ? content : `
        <!DOCTYPE html>
        <html>
          <head>
            <script src="https://unpkg.com/react@18/umd/react.development.js" crossorigin></script>
            <script src="https://unpkg.com/react-dom@18/umd/react-dom.development.js" crossorigin></script>
            <script src="https://unpkg.com/babel-standalone@6/babel.min.js"></script>
            <script src="https://cdn.tailwindcss.com"></script>
          </head>
          <body>
            <div id="root"></div>
            <script type="text/babel">
              ${content}
            </script>
          </body>
        </html>
      `;
      setIframeSrcDoc(htmlContent);
    }
  }, [content, language]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: 20 }}
        className={`bg-card border-l border-border flex flex-col transition-all duration-300 ${
          isFullscreen ? 'fixed inset-0 z-50 w-full h-full' : 'w-[500px] h-full relative'
        }`}
      >
        <div className="flex items-center justify-between p-3 border-b border-border bg-muted/30">
          <div className="font-medium text-sm flex items-center gap-2">
            {language === 'react' || language === 'html' ? <Play className="w-4 h-4 text-emerald-500" /> : <Code className="w-4 h-4 text-blue-500" />}
            {title}
          </div>
          <div className="flex items-center gap-1">
            <Button variant="ghost" size="icon" onClick={() => setIsFullscreen(!isFullscreen)}>
              {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </Button>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        <div className="flex border-b border-border px-2 pt-2 gap-2 bg-muted/10">
          <button
            className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'preview' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('preview')}
          >
            Preview
          </button>
          <button
            className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors ${activeTab === 'code' ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            onClick={() => setActiveTab('code')}
          >
            Code
          </button>
        </div>

        <div className="flex-1 overflow-hidden bg-background">
          {activeTab === 'preview' ? (
            <div className="w-full h-full bg-white relative">
              {(language === 'html' || language === 'react') ? (
                <iframe
                  title="Artifact Preview"
                  srcDoc={iframeSrcDoc}
                  className="w-full h-full border-none"
                  sandbox="allow-scripts allow-modals allow-popups"
                />
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground p-4 text-center">
                  Preview not available for {language}
                </div>
              )}
            </div>
          ) : (
            <div className="w-full h-full p-4 overflow-auto text-sm font-mono whitespace-pre text-foreground bg-zinc-950 dark:bg-zinc-950">
              {content}
            </div>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
};
