import React, { useEffect, useState, useCallback } from 'react';
import { ChevronRight, ChevronDown, File, Folder, RefreshCw } from 'lucide-react';
import { useNyxStore } from '@src/shared/store/useNyxStore';
import { useIdeStore } from '../store/useIdeStore';

interface FileNode {
  name: string;
  path: string;
  isDirectory: boolean;
  children?: FileNode[];
}

export const WorkspaceSidebar: React.FC = () => {
  const workspacePath = useNyxStore((s) => s.workspacePath);
  const [fileTree, setLocalFileTree] = useState<FileNode[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set(['.']));

  const { openFile } = useIdeStore();

  const fetchDirectory = useCallback(
    async (dirPath?: string) => {
      try {
        const response = await fetch('/api/v1/nyx/list-directory', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ dirPath: dirPath || workspacePath }),
        });
        const data = await response.json();
        return data.success ? data.files : [];
      } catch (err) {
        console.error('Failed to list directory', err);
        return [];
      }
    },
    [workspacePath]
  );

  const loadRoot = useCallback(async () => {
    if (!workspacePath) return;
    setLoading(true);
    const files = await fetchDirectory();
    setLocalFileTree(files);
    setLoading(false);
  }, [workspacePath, fetchDirectory]);

  // Initial load
  useEffect(() => {
    loadRoot();
  }, [loadRoot]);

  // Connect to WebSocket for file watching
  useEffect(() => {
    if (!workspacePath) return;
    const wsUrl = `ws://${window.location.host}/ws/file-watcher`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      ws.send(JSON.stringify({ action: 'watch', path: workspacePath }));
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (['file_added', 'file_removed', 'dir_added', 'dir_removed'].includes(data.type)) {
          // Simplistic implementation: just reload the root on any change to avoid complex tree traversal
          loadRoot();
        }
      } catch (err) {
        // ignore
      }
    };

    return () => {
      ws.close();
    };
  }, [workspacePath, loadRoot]);

  const toggleFolder = async (node: FileNode) => {
    const newSet = new Set(expandedFolders);
    if (newSet.has(node.path)) {
      newSet.delete(node.path);
      setExpandedFolders(newSet);
    } else {
      newSet.add(node.path);
      setExpandedFolders(newSet);
      // We could lazy load here, but assuming list-directory returns deep or we refetch
      // For now, if node.children is missing, we fetch it (assuming list-directory is shallow)
      if (!node.children) {
        const children = await fetchDirectory(node.path);
        // Recursive update function would be needed here for deep tree,
        // For simplicity we rely on list-directory being recursive or we just refresh the node.
        // If backend returns shallow, we'll need to update the local tree.
      }
    }
  };

  const handleFileClick = async (node: FileNode) => {
    if (node.isDirectory) {
      toggleFolder(node);
    } else {
      try {
        const response = await fetch('/api/v1/nyx/read-file', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filePath: node.path }),
        });
        const data = await response.json();
        if (data.success) {
          openFile(node.path, data.content);
        }
      } catch (err) {
        console.error('Failed to read file', err);
      }
    }
  };

  const renderTree = (nodes: FileNode[], level = 0) => {
    return nodes.map((node) => {
      const isExpanded = expandedFolders.has(node.path);
      return (
        <div key={node.path} className="flex flex-col">
          <div
            className="flex items-center gap-1.5 px-2 py-1 hover:bg-white/5 cursor-pointer text-xs text-zinc-300 transition-colors rounded-md mx-1"
            style={{ paddingLeft: `${level * 12 + 8}px` }}
            onClick={() => handleFileClick(node)}
          >
            {node.isDirectory ? (
              isExpanded ? (
                <ChevronDown size={14} className="text-zinc-500" />
              ) : (
                <ChevronRight size={14} className="text-zinc-500" />
              )
            ) : (
              <File size={14} className="text-zinc-500 opacity-0" /> /* spacer */
            )}
            {node.isDirectory ? (
              <Folder size={14} className="text-cyan-400" />
            ) : (
              <File size={14} className="text-zinc-400" />
            )}
            <span className="truncate">{node.name}</span>
          </div>
          {node.isDirectory && isExpanded && node.children && (
            <div className="flex flex-col">{renderTree(node.children, level + 1)}</div>
          )}
        </div>
      );
    });
  };

  if (!workspacePath) return null;

  return (
    <div className="w-64 h-full bg-card border-r border-white/5 flex flex-col shrink-0 select-none">
      <div className="h-10 flex items-center justify-between px-4 border-b border-white/5">
        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">
          Explorer
        </span>
        <button onClick={loadRoot} className="text-zinc-500 hover:text-cyan-400 transition-colors">
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto custom-scrollbar py-2">
        {loading && fileTree.length === 0 ? (
          <div className="text-xs text-zinc-500 px-4">Loading...</div>
        ) : (
          renderTree(fileTree)
        )}
      </div>
    </div>
  );
};
