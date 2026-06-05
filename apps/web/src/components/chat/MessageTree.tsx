import { useCallback, useState } from 'react';

interface TelemetryMetrics {
  tokens: number;
  tps: number;
  latency: number;
}

interface MessageNode {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  parentId: string | null;
  children: string[];
  timestamp: number;
  status: 'loading' | 'success' | 'error' | 'stopped';
  metrics?: TelemetryMetrics;
  version: number; // For branching
}

interface MessageTree {
  root: string | null;
  nodes: Map<string, MessageNode>;
  activeBranch: string[]; // Path from root to leaf
}

export function useMessageTree() {
  const [tree, setTree] = useState<MessageTree>({ root: null, nodes: new Map(), activeBranch: [] });

  const addMessage = useCallback((parentId: string | null, content: string, role: 'user' | 'assistant') => {
    const id = crypto.randomUUID();
    const node: MessageNode = {
      id,
      role,
      content,
      parentId,
      children: [],
      timestamp: Date.now(),
      status: 'loading',
      version: 1
    };

    setTree(prev => {
      const newNodes = new Map(prev.nodes);
      newNodes.set(id, node);

      if (parentId) {
        const parent = newNodes.get(parentId);
        if (parent) {
          parent.children.push(id);
        }
      } else {
        // New root
        return { root: id, nodes: newNodes, activeBranch: [id] };
      }

      // Update active branch
      const newBranch = [...prev.activeBranch];
      const parentIndex = parentId ? newBranch.indexOf(parentId) : -1;
      if (parentIndex >= 0) {
        newBranch.splice(parentIndex + 1, Infinity, id);
      }

      return { ...prev, nodes: newNodes, activeBranch: newBranch };
    });

    return id;
  }, []);

  const branchAt = useCallback((messageId: string) => {
    setTree(prev => {
      const node = prev.nodes.get(messageId);
      if (!node) return prev;

      // Create new branch from this point
      const newId = crypto.randomUUID();
      const newNode: MessageNode = {
        ...node,
        id: newId,
        parentId: node.parentId,
        children: [],
        content: '', // Will be regenerated
        version: node.version + 1,
        timestamp: Date.now()
      };

      const newNodes = new Map(prev.nodes);
      newNodes.set(newId, newNode);

      // Update parent's children
      if (node.parentId) {
        const parent = newNodes.get(node.parentId);
        if (parent) {
          parent.children.push(newId);
        }
      }

      // Switch to new branch
      const newBranch = [...prev.activeBranch];
      const index = newBranch.indexOf(messageId);
      if (index >= 0) {
        newBranch[index] = newId;
        newBranch.splice(index + 1, Infinity);
      }

      return { ...prev, nodes: newNodes, activeBranch: newBranch };
    });
  }, []);

  const getActiveMessages = useCallback(() => {
    return tree.activeBranch.map(id => tree.nodes.get(id)).filter(Boolean) as MessageNode[];
  }, [tree]);

  return { tree, addMessage, branchAt, getActiveMessages };
}
