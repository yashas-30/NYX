import { Server } from 'socket.io';

export interface WorkerNode {
  id: string;
  url: string;
  capabilities: ('gpu' | 'cpu' | 'large-memory' | 'fast-network')[];
  status: 'online' | 'busy' | 'offline';
  currentLoad: number; // 0-1
  queuedTasks: number;
}

export class ClusterManager {
  private nodes: Map<string, WorkerNode> = new Map();
  private io: Server;

  constructor(server: any) {
    this.io = new Server(server, { cors: { origin: '*' } });
    
    this.io.on('connection', (socket) => {
      console.log(`Worker connected: ${socket.id}`);
      
      socket.on('register', (data: Partial<WorkerNode>) => {
        this.nodes.set(socket.id, {
          id: socket.id,
          url: data.url || '',
          capabilities: data.capabilities || ['cpu'],
          status: 'online',
          currentLoad: 0,
          queuedTasks: 0
        });
      });

      socket.on('disconnect', () => {
        this.nodes.delete(socket.id);
      });
    });
  }

  getBestNodeForTask(requiresGpu: boolean): WorkerNode | null {
    let bestNode: WorkerNode | null = null;
    let lowestLoad = Infinity;

    for (const node of this.nodes.values()) {
      if (requiresGpu && !node.capabilities.includes('gpu')) continue;
      
      if (node.status === 'online' && node.currentLoad < lowestLoad) {
        lowestLoad = node.currentLoad;
        bestNode = node;
      }
    }

    return bestNode;
  }
}
