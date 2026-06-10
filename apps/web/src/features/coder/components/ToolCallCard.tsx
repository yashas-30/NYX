import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wrench, ChevronDown, ChevronRight, CheckCircle2, AlertCircle } from 'lucide-react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { oneDark } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { CodeDiffViewer } from './CodeDiffViewer';
import { ComputerUsePreview } from '../../chat/components/ComputerUsePreview';

interface ToolCallCardProps {
  toolName: string;
  args?: string;
  result?: any;
  status?: 'pending' | 'success' | 'error';
}

export const ToolCallCard: React.FC<ToolCallCardProps> = ({
  toolName,
  args,
  result,
  status = 'success',
}) => {
  const [expanded, setExpanded] = useState(false);

  if (toolName === 'computer_use') {
    let parsedArgs: any = {};
    try {
      parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;
    } catch {}
    
    return (
      <ComputerUsePreview 
        action={parsedArgs.action || 'unknown'} 
        coordinate={parsedArgs.coordinate} 
        text={parsedArgs.text} 
        result={typeof result === 'string' ? result : JSON.stringify(result)}
      />
    );
  }

  return (
    <div className="my-3 overflow-hidden rounded-md border border-neutral-800 bg-[#0f0f11]">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between bg-neutral-900/50 px-3 py-2 text-sm text-neutral-300 hover:bg-neutral-800/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <Wrench className="h-4 w-4 text-primary" />
          <span className="font-mono">{toolName}</span>
          {status === 'pending' && (
            <span className="flex h-2 w-2 rounded-md bg-yellow-500 animate-pulse" />
          )}
          {status === 'success' && <CheckCircle2 className="h-3 w-3 text-green-500" />}
          {status === 'error' && <AlertCircle className="h-3 w-3 text-red-500" />}
        </div>
        {expanded ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden border-t border-neutral-800"
          >
            <div className="p-3 text-xs">
              <div className="mb-2 font-semibold text-neutral-400">Arguments:</div>
              <SyntaxHighlighter
                language="json"
                style={oneDark}
                customStyle={{ background: 'transparent', padding: 0, margin: 0 }}
                codeTagProps={{ className: 'font-mono text-xs' }}
              >
                {args || '{}'}
              </SyntaxHighlighter>

              {['write_to_file', 'write_file', 'replace_file_content', 'multi_replace_file_content'].includes(toolName) && (
                <CodeDiffViewer toolName={toolName} args={args} />
              )}

              {result && (
                <>
                  <div className="mt-3 mb-2 font-semibold text-neutral-400">Result:</div>
                  {(() => {
                    let parsedResult = result;
                    if (typeof result === 'string') {
                      try {
                        parsedResult = JSON.parse(result);
                      } catch {}
                    }
                    if (parsedResult && typeof parsedResult === 'object' && 'image_base64' in parsedResult) {
                      return (
                        <div className="mt-2 rounded overflow-hidden border border-neutral-700 bg-neutral-900">
                          <img 
                            src={`data:image/png;base64,${parsedResult.image_base64}`} 
                            alt="Browser Screenshot" 
                            className="w-full h-auto"
                          />
                        </div>
                      );
                    }
                    return (
                      <SyntaxHighlighter
                        language="json"
                        style={oneDark}
                        customStyle={{ background: 'transparent', padding: 0, margin: 0, maxHeight: '300px', overflowY: 'auto' }}
                        codeTagProps={{ className: 'font-mono text-xs' }}
                      >
                        {typeof result === 'string' ? result : JSON.stringify(result, null, 2)}
                      </SyntaxHighlighter>
                    );
                  })()}
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
