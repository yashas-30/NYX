import React from 'react';
import { Check, X, ShieldWarning } from '@phosphor-icons/react';
import { motion } from 'framer-motion';

export interface ApprovalGateProps {
  proposedAction: string;
  reasoning: string;
  onApprove: () => void;
  onReject: () => void;
  status: 'pending' | 'approved' | 'rejected';
}

export const ApprovalGate: React.FC<ApprovalGateProps> = ({
  proposedAction,
  reasoning,
  onApprove,
  onReject,
  status,
}) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 5 }}
      animate={{ opacity: 1, y: 0 }}
      className="my-4 p-4 rounded-lg border border-yellow-500/30 bg-yellow-500/5 backdrop-blur-sm flex flex-col gap-3"
    >
      <div className="flex items-center gap-2 text-yellow-500">
        <ShieldWarning size={20} weight="duotone" />
        <h4 className="font-medium text-sm">Approval Required</h4>
      </div>
      
      <div className="text-sm text-gray-300">
        <p className="mb-2 font-mono bg-black/20 p-2 rounded text-xs break-all">
          {proposedAction}
        </p>
        <p className="text-xs text-gray-400">
          <strong className="text-gray-300">Reasoning:</strong> {reasoning}
        </p>
      </div>

      {status === 'pending' ? (
        <div className="flex items-center gap-2 mt-2">
          <button
            onClick={onApprove}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-500/20 text-green-400 hover:bg-green-500/30 transition-colors text-xs font-medium"
          >
            <Check size={14} weight="bold" />
            Approve
          </button>
          <button
            onClick={onReject}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors text-xs font-medium"
          >
            <X size={14} weight="bold" />
            Reject
          </button>
        </div>
      ) : (
        <div className="mt-2 text-xs font-medium flex items-center gap-1.5">
          {status === 'approved' ? (
            <span className="text-green-400 flex items-center gap-1"><Check size={14} /> Action Approved</span>
          ) : (
            <span className="text-red-400 flex items-center gap-1"><X size={14} /> Action Rejected</span>
          )}
        </div>
      )}
    </motion.div>
  );
};
