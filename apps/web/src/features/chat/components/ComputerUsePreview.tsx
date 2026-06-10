import React from 'react';
import { MousePointer2, Keyboard } from 'lucide-react';
import { motion } from 'framer-motion';

interface ComputerUsePreviewProps {
  action: string;
  coordinate?: number[];
  text?: string;
  result?: string;
}

export const ComputerUsePreview: React.FC<ComputerUsePreviewProps> = ({
  action,
  coordinate,
  text,
  result,
}) => {
  return (
    <div className="my-3 overflow-hidden rounded-md border border-indigo-900/50 bg-[#0f0f11]">
      <div className="flex w-full items-center justify-between bg-indigo-900/20 px-3 py-2 text-sm text-indigo-300">
        <div className="flex items-center gap-2">
          {['key', 'type'].includes(action) ? (
            <Keyboard className="h-4 w-4" />
          ) : (
            <MousePointer2 className="h-4 w-4" />
          )}
          <span className="font-mono font-medium">OS Action: {action}</span>
        </div>
      </div>
      
      <div className="p-3 text-xs bg-neutral-900">
        <div className="grid grid-cols-2 gap-4">
          {coordinate && (
            <div>
              <div className="text-neutral-500 mb-1">Coordinates</div>
              <div className="font-mono text-neutral-300">X: {coordinate[0]}, Y: {coordinate[1]}</div>
            </div>
          )}
          {text && (
            <div className="col-span-2">
              <div className="text-neutral-500 mb-1">Text / Key</div>
              <div className="font-mono text-neutral-300 bg-neutral-800 p-2 rounded break-words">
                {text}
              </div>
            </div>
          )}
        </div>
        
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 border-t border-neutral-800 pt-3"
          >
            <div className="text-neutral-500 mb-1">Result</div>
            <div className="font-mono text-neutral-400">
              {result}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
