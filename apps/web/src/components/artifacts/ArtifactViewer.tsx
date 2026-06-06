import React, { useState, useEffect } from 'react';
import * as Babel from '@babel/standalone';
import { ErrorBoundary } from './ErrorBoundary';
import { MermaidDiagram } from './MermaidDiagram';
import { CodeBlock } from '../chat/CodeBlock';
import { 
  Edit as EditIcon, 
  Download as DownloadIcon, 
  Code as CodeIcon, 
  FileText as FileTextIcon, 
  Layout as LayoutIcon, 
  Image as ImageIcon,
  Check as CheckIcon
} from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export type ArtifactType = 'code' | 'document' | 'html' | 'react' | 'svg' | 'mermaid';

export interface Artifact {
  id: string;
  type: ArtifactType;
  title: string;
  content: string;
  language?: string;
  createdAt: number;
  version: number;
}

const ArtifactIcon = ({ type }: { type: ArtifactType }) => {
  switch (type) {
    case 'code': return <CodeIcon className="w-4 h-4 text-blue-500" />;
    case 'document': return <FileTextIcon className="w-4 h-4 text-gray-500" />;
    case 'html': return <LayoutIcon className="w-4 h-4 text-orange-500" />;
    case 'react': return <CodeIcon className="w-4 h-4 text-cyan-500" />;
    case 'svg': return <ImageIcon className="w-4 h-4 text-purple-500" />;
    case 'mermaid': return <LayoutIcon className="w-4 h-4 text-green-500" />;
    default: return <FileTextIcon className="w-4 h-4 text-gray-500" />;
  }
};

export function ArtifactViewer({ artifact, onUpdate }: { artifact: Artifact; onUpdate?: (content: string) => void }) {
  const [activeTab, setActiveTab] = useState<'preview' | 'code'>('preview');
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(artifact.content);

  // Sync content if it changes externally
  useEffect(() => {
    setEditContent(artifact.content);
  }, [artifact.content]);

  const handleSave = () => {
    setIsEditing(false);
    if (onUpdate && editContent !== artifact.content) {
      onUpdate(editContent);
    }
  };

  const downloadArtifact = () => {
    const blob = new Blob([artifact.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    let extension = 'txt';
    if (artifact.type === 'html') extension = 'html';
    if (artifact.type === 'react') extension = 'tsx';
    if (artifact.type === 'svg') extension = 'svg';
    if (artifact.type === 'mermaid') extension = 'mmd';
    if (artifact.type === 'code' && artifact.language) extension = artifact.language;
    
    a.download = `${artifact.title.replace(/\s+/g, '_').toLowerCase()}.${extension}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const renderPreview = () => {
    switch (artifact.type) {
      case 'html':
        return (
          <iframe
            srcDoc={artifact.content}
            className="w-full h-full border-0 bg-white"
            sandbox="allow-scripts allow-forms allow-popups"
            title={artifact.title}
          />
        );
      case 'react':
        return <ReactPreview code={artifact.content} />;
      case 'svg':
        return <div className="flex items-center justify-center w-full h-full p-4" dangerouslySetInnerHTML={{ __html: artifact.content }} />;
      case 'mermaid':
        return <MermaidDiagram chart={artifact.content} />;
      case 'code':
      case 'document':
      default:
        return <CodeBlock code={artifact.content} language={artifact.language || 'text'} />;
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface overflow-hidden flex flex-col my-4 shadow-sm w-full max-w-4xl">
      <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-surface-hover/50">
        <div className="flex items-center gap-2 overflow-hidden">
          <ArtifactIcon type={artifact.type} />
          <span className="font-medium text-sm truncate">{artifact.title}</span>
          <span className="text-xs text-text-subtle shrink-0">v{artifact.version}</span>
        </div>
        <div className="flex items-center gap-1 shrink-0 ml-4">
          <div className="flex bg-surface-hover rounded-md p-0.5">
            <button
              onClick={() => { setActiveTab('preview'); setIsEditing(false); }}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-all font-medium',
                activeTab === 'preview' ? 'bg-primary-500 text-white shadow-sm' : 'hover:bg-surface text-text-muted hover:text-text'
              )}
            >
              Preview
            </button>
            <button
              onClick={() => { setActiveTab('code'); setIsEditing(false); }}
              className={cn(
                'px-3 py-1 text-xs rounded-md transition-all font-medium',
                activeTab === 'code' ? 'bg-primary-500 text-white shadow-sm' : 'hover:bg-surface text-text-muted hover:text-text'
              )}
            >
              Code
            </button>
          </div>
          
          <div className="w-px h-4 bg-border mx-1" />
          
          {onUpdate && (
            <button 
              onClick={() => isEditing ? handleSave() : setIsEditing(true)} 
              className={cn(
                "p-1.5 rounded transition-colors",
                isEditing ? "bg-green-500/20 text-green-500 hover:bg-green-500/30" : "text-text-muted hover:bg-surface-hover hover:text-text"
              )}
              title={isEditing ? "Save changes" : "Edit artifact"}
            >
              {isEditing ? <CheckIcon className="w-4 h-4" /> : <EditIcon className="w-4 h-4" />}
            </button>
          )}
          
          <button 
            onClick={downloadArtifact} 
            className="p-1.5 text-text-muted hover:bg-surface-hover hover:text-text rounded transition-colors"
            title="Download artifact"
          >
            <DownloadIcon className="w-4 h-4" />
          </button>
        </div>
      </div>
      
      <div className="relative min-h-[200px] max-h-[600px] overflow-auto">
        {isEditing ? (
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full min-h-[400px] p-4 font-mono text-sm bg-surface text-text resize-y outline-none"
            spellCheck={false}
          />
        ) : activeTab === 'preview' ? (
          <div className="w-full h-full min-h-[300px] bg-background">
            {renderPreview()}
          </div>
        ) : (
          <div className="p-0 m-0 [&>div]:m-0 [&>div]:border-0 [&>div]:rounded-none">
            <CodeBlock code={artifact.content} language={artifact.language || 'text'} />
          </div>
        )}
      </div>
    </div>
  );
}

// React preview with error boundary
function ReactPreview({ code }: { code: string }) {
  const [Component, setComponent] = useState<React.ComponentType | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    
    // Slight delay to prevent hanging the main thread on rapid re-renders
    const timer = setTimeout(() => {
      try {
        // Prepare code by ensuring we import React if missing
        let codeToTranspile = code;
        if (!codeToTranspile.includes('import React') && !codeToTranspile.includes('import * as React')) {
          codeToTranspile = `import React from 'react';\n${codeToTranspile}`;
        }
        
        // Transpile and execute React code safely
        const transpiled = Babel.transform(codeToTranspile, {
          presets: ['react', 'typescript'],
          filename: 'preview.tsx'
        }).code;

        if (!transpiled) throw new Error("Transpilation yielded empty output.");

        // Create module environment
        const module = { exports: {} as any };
        const exports = module.exports;
        
        // Custom require function for the sandboxed component
        const customRequire = (id: string) => {
          if (id === 'react') return React;
          if (id === 'lucide-react') return require('lucide-react'); // Requires bundler to provide it
          
          throw new Error(`Cannot import module '${id}' in preview environment.`);
        };

        // Create a function that executes the transpiled code
        // We inject React, require, module, exports
        const fn = new Function('require', 'module', 'exports', 'React', transpiled);
        
        // Execute the function
        fn(customRequire, module, exports, React);

        // Extract the component - either from default export or the first named export
        let ResolvedComponent = module.exports.default;
        
        if (!ResolvedComponent && Object.keys(module.exports).length > 0) {
          // Find the first exported value that looks like a component (function or class)
          for (const key in module.exports) {
            const exp = module.exports[key];
            if (typeof exp === 'function') {
              ResolvedComponent = exp;
              break;
            }
          }
        }
        
        if (!ResolvedComponent && typeof module.exports === 'function') {
           ResolvedComponent = module.exports;
        }

        if (!ResolvedComponent) {
          throw new Error("No default export or React component found in the code.");
        }

        if (isMounted) {
          setComponent(() => ResolvedComponent);
          setError(null);
        }
      } catch (e: any) {
        console.error("React Preview Error:", e);
        if (isMounted) {
          setError(e.message || String(e));
          setComponent(null);
        }
      }
    }, 100);

    return () => {
      isMounted = false;
      clearTimeout(timer);
    };
  }, [code]);

  if (error) {
    return (
      <div className="p-4 bg-red-500/10 text-red-500 font-mono text-sm whitespace-pre-wrap">
        <h3 className="font-bold mb-2">Build Error</h3>
        {error}
      </div>
    );
  }
  
  if (!Component) {
    return (
      <div className="p-8 flex justify-center items-center text-text-muted animate-pulse">
        Compiling preview...
      </div>
    );
  }

  return (
    <ErrorBoundary 
      fallback={
        <div className="p-4 bg-red-500/10 text-red-500 font-mono text-sm whitespace-pre-wrap">
          <h3 className="font-bold mb-2">Runtime Error</h3>
          The component crashed during render. Check console for details.
        </div>
      }
    >
      <div className="p-6 bg-white w-full h-full text-black">
        <Component />
      </div>
    </ErrorBoundary>
  );
}
