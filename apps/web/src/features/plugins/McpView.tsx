import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Server, Plug, CheckCircle, AlertCircle, XCircle, Plus, Trash2, Settings, Terminal, RefreshCw, ArrowRight, Globe, Database, FileText, Search, Zap, ChevronRight
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';
import { McpRegistry } from '@src/core/mcp/McpRegistry';

const isTauriEnv = typeof window !== 'undefined' &&
  ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

let invoke: any = null;
if (isTauriEnv) {
  import('@tauri-apps/api/core').then(m => invoke = m.invoke);
}

interface McpServer {
  id: string;
  name: string;
  description: string;
  transport: 'stdio' | 'sse';
  command?: string;
  args?: string[];
  url?: string;
  env: Record<string, string>;
  status: 'connected' | 'disconnected' | 'error' | 'connecting';
  tools: McpTool[];
  resources: McpResource[];
  isBuiltin: boolean;
}

interface McpTool {
  name: string;
  description: string;
  parameters: Record<string, any>;
}

interface McpResource {
  uri: string;
  name: string;
  mimeType: string;
  description: string;
}

const BUILTIN_SERVERS: McpServer[] = [
  {
    id: 'mcp-filesystem',
    name: 'Filesystem',
    description: 'Read, write, and manage files on the local file system',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'],
    env: {},
    status: 'connected',
    isBuiltin: true,
    tools: [
      { name: 'read_file', description: 'Read contents of a file', parameters: { path: 'string' } },
      { name: 'write_file', description: 'Write content to a file', parameters: { path: 'string', content: 'string' } },
      { name: 'list_directory', description: 'List contents of a directory', parameters: { path: 'string' } },
      { name: 'search_files', description: 'Search for files matching a pattern', parameters: { pattern: 'string', path: 'string' } },
    ],
    resources: [
      { uri: 'file:///workspace/README.md', name: 'README.md', mimeType: 'text/markdown', description: 'Project README' },
      { uri: 'file:///workspace/package.json', name: 'package.json', mimeType: 'application/json', description: 'Package manifest' },
    ],
  },
  {
    id: 'mcp-websearch',
    name: 'Web Search',
    description: 'Search the web using DuckDuckGo and Tavily APIs',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-websearch'],
    env: { TAVILY_API_KEY: '${TAVILY_API_KEY}' },
    status: 'connected',
    isBuiltin: true,
    tools: [
      { name: 'web_search', description: 'Search the web for information', parameters: { query: 'string', num_results: 'number' } },
      { name: 'fetch_page', description: 'Fetch and read a web page', parameters: { url: 'string' } },
    ],
    resources: [],
  },
  {
    id: 'mcp-github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories, issues, and pull requests',
    transport: 'sse',
    url: 'https://mcp-github-server.example.com/sse',
    env: { GITHUB_TOKEN: '${GITHUB_TOKEN}' },
    status: 'disconnected',
    isBuiltin: true,
    tools: [
      { name: 'github_search_repos', description: 'Search GitHub repositories', parameters: { query: 'string' } },
      { name: 'github_read_file', description: 'Read a file from a repository', parameters: { owner: 'string', repo: 'string', path: 'string' } },
      { name: 'github_create_issue', description: 'Create a GitHub issue', parameters: { owner: 'string', repo: 'string', title: 'string', body: 'string' } },
    ],
    resources: [],
  },
  {
    id: 'mcp-postgres',
    name: 'PostgreSQL',
    description: 'Query and manage PostgreSQL databases',
    transport: 'stdio',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-postgres', 'postgresql://localhost:5432/nyx'],
    env: {},
    status: 'error',
    isBuiltin: true,
    tools: [
      { name: 'query', description: 'Execute a SQL query', parameters: { sql: 'string' } },
      { name: 'list_tables', description: 'List all tables in the database', parameters: {} },
      { name: 'describe_table', description: 'Describe a table schema', parameters: { table: 'string' } },
    ],
    resources: [],
  },
];

const AVAILABLE_SERVERS: Omit<McpServer, 'status' | 'isBuiltin' | 'tools' | 'resources'>[] = [
  { id: 'mcp-slack', name: 'Slack', description: 'Send messages and read channels from Slack workspaces', transport: 'sse', url: 'http://localhost:3001/sse', env: { SLACK_TOKEN: '' } },
  { id: 'mcp-notion', name: 'Notion', description: 'Read and write Notion pages and databases', transport: 'sse', url: 'http://localhost:3002/sse', env: { NOTION_TOKEN: '' } },
  { id: 'mcp-brave', name: 'Brave Search', description: 'Search the web using Brave Search API', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-brave-search'], env: { BRAVE_API_KEY: '' } },
  { id: 'mcp-puppeteer', name: 'Puppeteer Browser', description: 'Browser automation using Puppeteer for web scraping', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-puppeteer'], env: {} },
  { id: 'mcp-sqlite', name: 'SQLite', description: 'Query and manage SQLite databases', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-sqlite', '/workspace/db.sqlite'], env: {} },
  { id: 'mcp-github-official', name: 'GitHub (Official)', description: 'Full access to GitHub API', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-github'], env: { GITHUB_PERSONAL_ACCESS_TOKEN: '' } },
  { id: 'mcp-google-maps', name: 'Google Maps', description: 'Access Google Maps directions and places API', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-google-maps'], env: { GOOGLE_MAPS_API_KEY: '' } },
  { id: 'mcp-linear', name: 'Linear', description: 'Manage Linear issues, projects, and teams', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-linear'], env: { LINEAR_API_KEY: '' } },
  { id: 'mcp-filesystem-ext', name: 'Filesystem (Extended)', description: 'Extended file operations', transport: 'stdio', command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem', '/workspace'], env: {} },
];

export default function McpView() {
  const [servers, setServers] = useState<McpServer[]>(BUILTIN_SERVERS);
  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'tools'>('installed');
  const [selectedServer, setSelectedServer] = useState<McpServer | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [newServerUrl, setNewServerUrl] = useState('');
  const [newServerName, setNewServerName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [isConnecting, setIsConnecting] = useState<string | null>(null);

  useEffect(() => {
    if (!isTauriEnv) return;
    const syncActiveServers = async () => {
      try {
        const activeNames: string[] = await invoke('mcp_list_servers');
        setServers((prev) =>
          prev.map((s) => ({
            ...s,
            status: activeNames.includes(s.name) ? 'connected' : 'disconnected',
          }))
        );
      } catch (err) {
        console.error('Failed to sync active MCP servers:', err);
      }
    };
    syncActiveServers();
  }, []);

  const toggleConnection = async (serverId: string) => {
    const server = servers.find((s) => s.id === serverId);
    if (!server) return;

    setIsConnecting(serverId);

    // 1. Handle SSE connections directly through the web client registry
    if (server.transport === 'sse') {
      try {
        if (server.status === 'connected') {
          await McpRegistry.disconnectServer(server.id);
          setServers((prev) =>
            prev.map((s) => (s.id === serverId ? { ...s, status: 'disconnected' } : s))
          );
          toast.success(`Disconnected from SSE server '${server.name}'`);
        } else {
          await McpRegistry.connectServer({
            id: server.id,
            name: server.name,
            url: server.url || '',
          });
          
          // Fetch the dynamic tools that were just connected
          const allMcpTools = await McpRegistry.getAllTools();
          const serverTools = allMcpTools
            .filter((t) => t._mcpServerId === server.id)
            .map((t) => ({
              name: t.name,
              description: t.description || 'MCP Tool',
              parameters: t.inputSchema || {},
            }));

          setServers((prev) =>
            prev.map((s) => (s.id === serverId ? { ...s, status: 'connected', tools: serverTools } : s))
          );
          toast.success(`Connected to SSE server '${server.name}'`);
        }
      } catch (err: any) {
        console.error(err);
        setServers((prev) =>
          prev.map((s) => (s.id === serverId ? { ...s, status: 'error' } : s))
        );
        toast.error(`SSE connection error: ${err.message || err}`);
      } finally {
        setIsConnecting(null);
      }
      return;
    }

    // 2. Handle STDIO connections (requires Tauri backend to spawn process)
    if (isTauriEnv) {
      try {
        if (server.status === 'connected') {
          await invoke('mcp_stop_server', { name: server.name });
          setServers((prev) =>
            prev.map((s) => (s.id === serverId ? { ...s, status: 'disconnected' } : s))
          );
          toast.success(`Stopped MCP server '${server.name}'`);
        } else {
          const envCopy = { ...server.env };
          await invoke('mcp_start_server', {
            name: server.name,
            command: server.command || 'npx',
            args: server.args || [],
            env: envCopy,
          });
          setServers((prev) =>
            prev.map((s) => (s.id === serverId ? { ...s, status: 'connected' } : s))
          );
          toast.success(`Successfully connected to MCP server '${server.name}'`);
        }
      } catch (err: any) {
        console.error(err);
        setServers((prev) =>
          prev.map((s) => (s.id === serverId ? { ...s, status: 'error' } : s))
        );
        toast.error(`MCP connection error: ${err.message || err}`);
      } finally {
        setIsConnecting(null);
      }
    } else {
      // Browser environment trying to run stdio
      setServers((prev) =>
        prev.map((s) => (s.id === serverId ? { ...s, status: 'error' } : s))
      );
      toast.error(`STDIO servers require the Desktop App to spawn local processes.`);
      setIsConnecting(null);
    }
  };

  const addServer = () => {
    if (!newServerName.trim() || !newServerUrl.trim()) return;
    const newServer: McpServer = {
      id: `mcp-${Date.now()}`,
      name: newServerName,
      description: 'Custom MCP server',
      transport: 'sse',
      url: newServerUrl,
      env: {},
      status: 'disconnected',
      isBuiltin: false,
      tools: [],
      resources: [],
    };
    setServers((prev) => [...prev, newServer]);
    setNewServerName('');
    setNewServerUrl('');
    setIsAdding(false);
  };

  const removeServer = (serverId: string) => {
    if (!confirm('Remove this MCP server?')) return;
    setServers((prev) => prev.filter((s) => s.id !== serverId));
    if (selectedServer?.id === serverId) setSelectedServer(null);
  };

  const installAvailableServer = (server: typeof AVAILABLE_SERVERS[0]) => {
    const newServer: McpServer = {
      ...server,
      status: 'disconnected',
      isBuiltin: false,
      tools: [],
      resources: [],
    };
    setServers((prev) => [...prev, newServer]);
  };

  const allTools = servers.flatMap((s) => s.tools.map((t) => ({ ...t, server: s.name, serverId: s.id })));
  const allResources = servers.flatMap((s) => s.resources.map((r) => ({ ...r, server: s.name })));

  const StatusIcon = ({ status }: { status: McpServer['status'] }) => {
    switch (status) {
      case 'connected': return <CheckCircle size={14} className="text-green-500" />;
      case 'disconnected': return <XCircle size={14} className="text-muted-foreground" />;
      case 'error': return <AlertCircle size={14} className="text-red-500" />;
      case 'connecting': return <RefreshCw size={14} className="text-primary animate-spin" />;
      default: return <XCircle size={14} className="text-muted-foreground" />;
    }
  };

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <Plug size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">MCP Servers</h1>
              <p className="text-xs text-muted-foreground">
                {servers.filter((s) => s.status === 'connected').length} connected · {servers.length} total · {allTools.length} tools available
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsAdding(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all"
          >
            <Plus size={14} /> Add Server
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="shrink-0 px-6 border-b border-border flex items-center gap-1">
        {[
          { id: 'installed', label: 'Installed', count: servers.length },
          { id: 'available', label: 'Available', count: AVAILABLE_SERVERS.length },
          { id: 'tools', label: 'Tools', count: allTools.length },
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-1.5 px-4 py-3 text-xs font-medium transition-all border-b-2 ${
              activeTab === tab.id ? 'text-primary border-primary' : 'text-muted-foreground border-transparent hover:text-foreground'
            }`}
          >
            {tab.label}
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${activeTab === tab.id ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Sidebar */}
        <div className="w-72 border-r border-border flex flex-col">
          <div className="shrink-0 p-3 border-b border-border">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search servers..."
              className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {activeTab === 'installed' && servers.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((server) => (
              <div
                key={server.id}
                onClick={() => setSelectedServer(server)}
                className={`p-3 rounded-lg cursor-pointer transition-all border ${
                  selectedServer?.id === server.id ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted border-transparent'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <StatusIcon status={server.status} />
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-medium text-foreground truncate">{server.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{server.transport === 'stdio' ? 'STDIO' : 'SSE'} · {server.tools.length} tools</p>
                  </div>
                  <ChevronRight size={12} className="text-muted-foreground" />
                </div>
              </div>
            ))}

            {activeTab === 'available' && AVAILABLE_SERVERS.filter((s) => s.name.toLowerCase().includes(searchQuery.toLowerCase())).map((server) => (
              <div
                key={server.id}
                className="p-3 rounded-lg border border-border hover:border-primary/30 transition-all"
              >
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center text-muted-foreground">
                    <Server size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-medium text-foreground">{server.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{server.description}</p>
                    <button
                      onClick={() => installAvailableServer(server)}
                      className="mt-2 px-2.5 py-1 rounded bg-primary/10 text-primary text-[10px] font-medium hover:bg-primary/20 transition-all"
                    >
                      Install
                    </button>
                  </div>
                </div>
              </div>
            ))}

            {activeTab === 'tools' && allTools.filter((t) => t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.description.toLowerCase().includes(searchQuery.toLowerCase())).map((tool, index) => (
              <div key={`${tool.serverId}-${tool.name}-${index}`} className="p-3 rounded-lg border border-border hover:border-primary/30 transition-all">
                <div className="flex items-start gap-2.5">
                  <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
                    <Zap size={14} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-xs font-medium text-foreground">{tool.name}</h3>
                    <p className="text-[10px] text-muted-foreground mt-0.5">{tool.description}</p>
                    <span className="text-[9px] text-primary mt-1 block">from {tool.server}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedServer && activeTab === 'installed' ? (
            <div className="max-w-3xl">
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    selectedServer.status === 'connected' ? 'bg-green-500/10 text-green-500' : 'bg-muted text-muted-foreground'
                  }`}>
                    <StatusIcon status={selectedServer.status} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selectedServer.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedServer.description}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => toggleConnection(selectedServer.id)}
                    disabled={isConnecting === selectedServer.id}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-medium transition-all ${
                      selectedServer.status === 'connected'
                        ? 'bg-red-500/10 text-red-500 hover:bg-red-500/20'
                        : 'bg-green-500/10 text-green-500 hover:bg-green-500/20'
                    }`}
                  >
                    {isConnecting === selectedServer.id ? (
                      <RefreshCw size={12} className="animate-spin" />
                    ) : selectedServer.status === 'connected' ? (
                      <XCircle size={12} />
                    ) : (
                      <Plug size={12} />
                    )}
                    {isConnecting === selectedServer.id ? 'Connecting...' : selectedServer.status === 'connected' ? 'Disconnect' : 'Connect'}
                  </button>
                  {!selectedServer.isBuiltin && (
                    <button
                      onClick={() => removeServer(selectedServer.id)}
                      className="p-2 rounded-lg hover:bg-red-500/10 text-muted-foreground hover:text-red-500 transition-all"
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-6">
                {/* Configuration */}
                <div className="p-4 bg-card border border-border rounded-xl">
                  <h3 className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                    <Settings size={12} /> Configuration
                  </h3>
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Transport</label>
                        <p className="text-sm text-foreground mt-0.5">{selectedServer.transport.toUpperCase()}</p>
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</label>
                        <p className="text-sm text-foreground mt-0.5 capitalize">{selectedServer.status}</p>
                      </div>
                    </div>
                    {selectedServer.transport === 'stdio' && (
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">Command</label>
                        <p className="text-sm text-foreground mt-0.5 font-mono">{selectedServer.command} {selectedServer.args?.join(' ')}</p>
                      </div>
                    )}
                    {selectedServer.transport === 'sse' && selectedServer.url && (
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider">URL</label>
                        <p className="text-sm text-foreground mt-0.5 font-mono">{selectedServer.url}</p>
                      </div>
                    )}
                    {Object.keys(selectedServer.env).length > 0 && (
                      <div>
                        <label className="text-[10px] text-muted-foreground uppercase tracking-wider mb-1.5 block">Environment</label>
                        <div className="space-y-1.5">
                          {Object.entries(selectedServer.env).map(([key, value]) => (
                            <div key={key} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted">
                              <span className="text-xs font-medium text-foreground">{key}</span>
                              <span className="text-xs text-muted-foreground">=</span>
                              <span className="text-xs text-foreground font-mono flex-1">{value}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Tools */}
                {selectedServer.tools.length > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <h3 className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                      <Zap size={12} /> Tools ({selectedServer.tools.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedServer.tools.map((tool) => (
                        <div key={tool.name} className="p-3 rounded-lg bg-muted/50">
                          <div className="flex items-center gap-2 mb-1">
                            <span className="text-xs font-medium text-foreground">{tool.name}</span>
                          </div>
                          <p className="text-[11px] text-muted-foreground">{tool.description}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Resources */}
                {selectedServer.resources.length > 0 && (
                  <div className="p-4 bg-card border border-border rounded-xl">
                    <h3 className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                      <FileText size={12} /> Resources ({selectedServer.resources.length})
                    </h3>
                    <div className="space-y-2">
                      {selectedServer.resources.map((resource) => (
                        <div key={resource.uri} className="flex items-center gap-3 p-2.5 rounded-lg bg-muted/50">
                          <FileText size={14} className="text-muted-foreground" />
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium text-foreground truncate">{resource.name}</p>
                            <p className="text-[10px] text-muted-foreground">{resource.mimeType}</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <Plug size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a server</p>
                <p className="text-xs mt-1 opacity-60">Manage MCP server connections and tools</p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Add Server Modal */}
      <AnimatePresence>
        {isAdding && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setIsAdding(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[480px] bg-card border border-border rounded-xl p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-foreground mb-4">Add MCP Server</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
                  <input
                    type="text"
                    value={newServerName}
                    onChange={(e) => setNewServerName(e.target.value)}
                    placeholder="e.g., My Custom Server"
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">SSE URL</label>
                  <input
                    type="text"
                    value={newServerUrl}
                    onChange={(e) => setNewServerUrl(e.target.value)}
                    placeholder="https://your-server.com/sse"
                    className="w-full px-3 py-2 rounded-lg bg-muted border border-border text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsAdding(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={addServer}
                    disabled={!newServerName.trim() || !newServerUrl.trim()}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Add Server
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
