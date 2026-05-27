import { useState, useCallback } from 'react';
import { ChatMessage } from '@src/infrastructure/types';

export interface ConversationNode {
  id: string;
  parentId: string | null;
  messages: ChatMessage[];
  createdAt: number;
  label?: string;
}

export function useConversationTree() {
  const [nodes, setNodes] = useState<Map<string, ConversationNode>>(new Map());
  const [activeNodeId, setActiveNodeId] = useState<string>('root');

  const createBranch = useCallback((fromNodeId: string, label?: string): string => {
    const fromNode = nodes.get(fromNodeId);
    const fromMessages = fromNode ? fromNode.messages : [];
    
    const newNode: ConversationNode = {
      id: crypto.randomUUID(),
      parentId: fromNodeId,
      messages: [...fromMessages],
      createdAt: Date.now(),
      label,
    };

    setNodes(prev => {
      const next = new Map(prev);
      next.set(newNode.id, newNode);
      return next;
    });
    
    setActiveNodeId(newNode.id);
    return newNode.id;
  }, [nodes]);

  const getBranchPath = useCallback((nodeId: string): string[] => {
    const pathList: string[] = [];
    let current: string | null = nodeId;
    
    while (current) {
      pathList.unshift(current);
      const node = nodes.get(current);
      current = node ? node.parentId : null;
    }
    
    return pathList;
  }, [nodes]);

  return {
    nodes,
    activeNodeId,
    setActiveNodeId,
    createBranch,
    getBranchPath
  };
}
