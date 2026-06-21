import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React from 'react';
import { Cursor as Cursor, Keyboard } from '@phosphor-icons/react';
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
    <div className="my-3 overflow-hidden rounded-md border border-border bg-card">
      <div className="flex w-full items-center justify-between bg-muted px-3 py-2 text-sm text-primary">
        <div className="flex items-center gap-2">
          {['key', 'type'].includes(action) ? (
            <AnimatedIcon icon={Keyboard} className="h-4 w-4" />
          ) : (
            <AnimatedIcon icon={Cursor} className="h-4 w-4" />
          )}
          <span className="font-mono font-medium">OS Action: {action}</span>
        </div>
      </div>
      
      <div className="p-3 text-xs bg-card">
        <div className="grid grid-cols-2 gap-4">
          {coordinate && (
            <div>
              <div className="text-muted-foreground mb-1">Coordinates</div>
              <div className="font-mono text-foreground">X: {coordinate[0]}, Y: {coordinate[1]}</div>
            </div>
          )}
          {text && (
            <div className="col-span-2">
              <div className="text-muted-foreground mb-1">Text / Key</div>
              <div className="font-mono text-foreground bg-input border border-border/50 p-2 rounded break-words">
                {text}
              </div>
            </div>
          )}
        </div>
        
        {result && (
          <motion.div 
            initial={{ opacity: 0, y: 5 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 border-t border-border pt-3"
          >
            <div className="text-muted-foreground mb-1">Result</div>
            <div className="font-mono text-muted-foreground">
              {result}
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
};
