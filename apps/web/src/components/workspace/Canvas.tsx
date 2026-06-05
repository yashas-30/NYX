import React, { useState, useCallback } from 'react';
import ReactFlow, {
  Background,
  Controls,
  MiniMap,
  Node,
  Edge,
  addEdge,
  Connection,
  useNodesState,
  useEdgesState,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { MessageSquare, Code, Image, StickyNote, Play, Edit } from 'lucide-react';
import { AIService } from '@src/core/services/ai.service';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CanvasNode extends Node {
  data: {
    type: 'chat' | 'code' | 'image' | 'note' | 'web-search' | 'file';
    content: string;
    modelId?: string;
    provider?: string;
    status?: 'idle' | 'loading' | 'done' | 'error';
  };
}

// Custom node components
function CustomNode({ data, id }: { data: CanvasNode['data']; id: string }) {
  const [content, setContent] = useState(data.content);
  const [isEditing, setIsEditing] = useState(false);

  const runNode = async () => {
    if (data.type === 'chat') {
      // Run AI on this node
      data.status = 'loading';
      try {
        const result = await AIService.execute(
          data.modelId || 'gemini-3.5-flash', 
          data.provider || 'gemini', 
          content
        );
        data.content = result.text;
        data.status = 'done';
      } catch (e) {
        data.status = 'error';
      }
      setContent(data.content);
    }
  };

  return (
    <div className={cn(
      'w-80 rounded-lg border shadow-lg overflow-hidden bg-white/5 backdrop-blur-md',
      data.status === 'loading' && 'border-sky-500 animate-pulse',
      data.status === 'done' && 'border-emerald-500',
      data.status === 'error' && 'border-red-500',
      !data.status || data.status === 'idle' ? 'border-white/10' : ''
    )}>
      <div className={cn(
        'px-3 py-2 flex items-center justify-between border-b border-white/10',
        data.type === 'chat' && 'bg-sky-500/10',
        data.type === 'code' && 'bg-emerald-500/10',
        data.type === 'image' && 'bg-amber-500/10',
        data.type === 'note' && 'bg-zinc-500/10'
      )}>
        <span className="text-[10px] font-bold tracking-widest text-zinc-300 uppercase">{data.type}</span>
        <div className="flex gap-1">
          <button onClick={runNode} className="p-1 hover:bg-black/20 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <Play className="w-3 h-3" />
          </button>
          <button onClick={() => setIsEditing(!isEditing)} className="p-1 hover:bg-black/20 rounded text-zinc-400 hover:text-white transition-colors cursor-pointer">
            <Edit className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="p-3 text-zinc-200">
        {isEditing ? (
          <textarea
            className="w-full bg-black/20 rounded resize-none outline-none text-xs p-2 border border-white/10 focus:border-sky-500"
            rows={4}
            value={content}
            onChange={e => setContent(e.target.value)}
            onBlur={() => { data.content = content; setIsEditing(false); }}
            autoFocus
          />
        ) : (
          <div className="text-xs text-zinc-300 whitespace-pre-wrap">{content || 'Double click edit icon to start typing...'}</div>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  custom: CustomNode,
};

export function InfiniteCanvas() {
  const [nodes, setNodes, onNodesChange] = useNodesState<CanvasNode[]>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState([]);

  const onConnect = useCallback((params: Connection) => {
    setEdges((eds) => addEdge({ ...params, animated: true, style: { stroke: '#0ea5e9' } }, eds));
  }, [setEdges]);

  const addNode = useCallback((type: CanvasNode['data']['type'], position: { x: number; y: number }) => {
    const newNode: CanvasNode = {
      id: crypto.randomUUID(),
      type: 'custom',
      position,
      data: { type, content: '', status: 'idle', modelId: 'gemini-3.5-flash', provider: 'gemini' },
    };
    setNodes((nds) => [...nds, newNode as any]);
  }, [setNodes]);

  return (
    <div className="w-full h-full relative">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        attributionPosition="bottom-left"
        className="bg-background"
      >
        <Background color="#3f3f46" gap={16} />
        <Controls className="bg-zinc-800 border-white/10 fill-white" />
        <MiniMap 
          nodeColor={(node) => {
            switch (node.data.type) {
              case 'chat': return '#0ea5e9';
              case 'code': return '#10b981';
              case 'image': return '#f59e0b';
              default: return '#71717a';
            }
          }}
          className="bg-zinc-900 border border-white/10 rounded-lg"
          maskColor="rgba(0,0,0,0.5)"
        />
      </ReactFlow>

      {/* Floating toolbar */}
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 bg-zinc-900/90 backdrop-blur border border-white/10 rounded-full px-4 py-2 shadow-xl z-10">
        <button onClick={() => addNode('chat', { x: Math.random() * 200, y: Math.random() * 200 })} className="p-2.5 text-zinc-400 hover:text-sky-400 hover:bg-white/5 rounded-full transition-all cursor-pointer" title="Add Chat Node">
          <MessageSquare className="w-4 h-4" />
        </button>
        <button onClick={() => addNode('code', { x: Math.random() * 200, y: Math.random() * 200 })} className="p-2.5 text-zinc-400 hover:text-emerald-400 hover:bg-white/5 rounded-full transition-all cursor-pointer" title="Add Code Node">
          <Code className="w-4 h-4" />
        </button>
        <button onClick={() => addNode('image', { x: Math.random() * 200, y: Math.random() * 200 })} className="p-2.5 text-zinc-400 hover:text-amber-400 hover:bg-white/5 rounded-full transition-all cursor-pointer" title="Add Image Node">
          <Image className="w-4 h-4" />
        </button>
        <button onClick={() => addNode('note', { x: Math.random() * 200, y: Math.random() * 200 })} className="p-2.5 text-zinc-400 hover:text-zinc-100 hover:bg-white/5 rounded-full transition-all cursor-pointer" title="Add Note Node">
          <StickyNote className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
