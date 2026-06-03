import React from 'react';
import { UnifiedDiffViewer } from '@src/shared/components/ui/UnifiedDiffViewer';
import { CodeMirrorBlock } from '@src/shared/components/ui/CodeMirrorBlock';

interface CodeDiffViewerProps {
  toolName: string;
  args: any;
}

export const CodeDiffViewer: React.FC<CodeDiffViewerProps> = ({ toolName, args }) => {
  if (!args) return null;

  try {
    let parsedArgs = typeof args === 'string' ? JSON.parse(args) : args;

    if (toolName === 'write_to_file' || toolName === 'write_file') {
      const content = parsedArgs.CodeContent || parsedArgs.content || '';
      return (
        <div className="mt-2 border border-emerald-500/20 rounded-md overflow-hidden">
          <div className="bg-emerald-500/10 text-emerald-400 text-[10px] uppercase font-bold px-3 py-1 border-b border-emerald-500/20">
            Write File: {parsedArgs.TargetFile || parsedArgs.filePath}
          </div>
          <CodeMirrorBlock code={content} language="typescript" />
        </div>
      );
    }

    if (toolName === 'replace_file_content' || toolName === 'multi_replace_file_content') {
      // Very basic diff representation (since we don't have full file context easily here)
      // For a proper diff, we'd use jsdiff or similar, but for now we'll just show the replacement
      
      const chunks = toolName === 'replace_file_content' 
        ? [{ TargetContent: parsedArgs.TargetContent, ReplacementContent: parsedArgs.ReplacementContent }] 
        : parsedArgs.ReplacementChunks || [];

      return (
        <div className="mt-2 border border-blue-500/20 rounded-md overflow-hidden flex flex-col gap-2 bg-[#111622] p-2">
          <div className="text-blue-400 text-[10px] uppercase font-bold px-1">
            Modify File: {parsedArgs.TargetFile}
          </div>
          {chunks.map((chunk: any, i: number) => {
            const targetLines = (chunk.TargetContent || '').split('\n').map((l: string) => `- ${l}`).join('\n');
            const replacementLines = (chunk.ReplacementContent || '').split('\n').map((l: string) => `+ ${l}`).join('\n');
            const fakeDiff = `--- ${parsedArgs.TargetFile}\n+++ ${parsedArgs.TargetFile}\n@@ -${chunk.StartLine || 1},0 +${chunk.StartLine || 1},0 @@\n${targetLines}\n${replacementLines}`;
            
            return (
              <div key={i} className="rounded border border-white/5 overflow-hidden">
                <UnifiedDiffViewer code={fakeDiff} />
              </div>
            );
          })}
        </div>
      );
    }
  } catch (e) {
    // Fallback to normal rendering if parsing fails
    console.error("Failed to parse tool args for diff viewing", e);
  }

  return null;
};
