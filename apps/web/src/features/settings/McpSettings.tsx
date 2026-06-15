import React, { useEffect, useState } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@src/shared/components/ui/card';
import { Settings, Server, Plus, Trash2 } from 'lucide-react';
import { invoke } from '@tauri-apps/api/core';
import { fetchWithAuth } from '@src/infrastructure/api/authFetch';

export const McpSettings: React.FC = () => {
  const [servers, setServers] = useState<any[]>([]);
  const [newServerName, setNewServerName] = useState('');
  const [newServerType, setNewServerType] = useState('stdio');
  const [newServerCommand, setNewServerCommand] = useState('');
  const [newServerUrl, setNewServerUrl] = useState('');

  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;

  const fetchServers = async () => {
    try {
      if (isTauri) {
        const serverNames = await invoke<string[]>('mcp_list_servers');
        setServers(serverNames.map((name) => ({
          id: name,
          name: name,
          type: 'stdio',
          command: 'Active Process'
        })));
      } else {
        const res = await fetchWithAuth('/api/v1/mcp/servers');
        if (res.ok) {
          const data = await res.json();
          setServers(data.servers || []);
        }
      }
    } catch (e) {
      console.error('Failed to fetch MCP servers', e);
    }
  };

  useEffect(() => {
    fetchServers();
  }, []);

  const handleAddServer = async () => {
    try {
      if (isTauri) {
        if (newServerType === 'stdio') {
          const parts = newServerCommand.split(' ');
          const command = parts[0];
          const args = parts.slice(1);
          await invoke('mcp_start_server', {
            name: newServerName,
            command,
            args,
            env: {}
          });
        } else {
          alert("SSE servers not currently supported natively by the Rust backend.");
          return;
        }
      } else {
        await fetchWithAuth('/api/v1/mcp/servers', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: newServerName,
            type: newServerType,
            command: newServerType === 'stdio' ? newServerCommand : undefined,
            url: newServerType === 'sse' ? newServerUrl : undefined,
            args: []
          })
        });
      }
      fetchServers();
      setNewServerName('');
      setNewServerCommand('');
      setNewServerUrl('');
    } catch (e) {
      console.error('Failed to add server', e);
    }
  };

  const handleRemoveServer = async (id: string) => {
    try {
      if (isTauri) {
        await invoke('mcp_stop_server', { name: id });
      } else {
        await fetchWithAuth(`/api/v1/mcp/servers/${id}`, { method: 'DELETE' });
      }
      fetchServers();
    } catch (e) {
      console.error('Failed to remove server', e);
    }
  };

  return (
    <Card className="border-neutral-800 bg-neutral-900/50">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <Settings className="h-5 w-5 text-primary" />
          Model Context Protocol (MCP) Servers
        </CardTitle>
        <p className="text-sm text-neutral-400">
          Connect external tools and resources directly to your Coder Agent.
        </p>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {servers.map((server) => (
            <div key={server.id} className="flex items-center justify-between p-3 border border-neutral-800 rounded bg-neutral-900">
              <div className="flex items-center gap-3">
                <Server className="h-5 w-5 text-neutral-400" />
                <div>
                  <div className="font-medium text-neutral-200">{server.name}</div>
                  <div className="text-xs text-neutral-500">{server.type} • {server.command || server.url}</div>
                </div>
              </div>
              <button 
                onClick={() => handleRemoveServer(server.id)}
                className="text-red-400 hover:text-red-300 p-2"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}

          <div className="p-4 mt-4 border border-neutral-800 rounded bg-neutral-900">
            <h4 className="text-sm font-medium mb-3">Add New Server</h4>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <input 
                placeholder="Server Name"
                className="bg-neutral-800 border-neutral-700 rounded px-3 py-2 text-sm"
                value={newServerName}
                onChange={e => setNewServerName(e.target.value)}
              />
              <select 
                className="bg-neutral-800 border-neutral-700 rounded px-3 py-2 text-sm text-neutral-200"
                value={newServerType}
                onChange={e => setNewServerType(e.target.value)}
              >
                <option value="stdio">Stdio</option>
                <option value="sse">SSE</option>
              </select>
            </div>
            {newServerType === 'stdio' ? (
              <input 
                placeholder="Command (e.g., npx -y @modelcontextprotocol/server-postgres)"
                className="bg-neutral-800 border-neutral-700 rounded px-3 py-2 text-sm w-full mb-3"
                value={newServerCommand}
                onChange={e => setNewServerCommand(e.target.value)}
              />
            ) : (
              <input 
                placeholder="Server URL (e.g., http://localhost:3001/mcp)"
                className="bg-neutral-800 border-neutral-700 rounded px-3 py-2 text-sm w-full mb-3"
                value={newServerUrl}
                onChange={e => setNewServerUrl(e.target.value)}
              />
            )}
            <button 
              onClick={handleAddServer}
              className="flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded text-sm hover:bg-primary/90"
            >
              <Plus className="h-4 w-4" /> Add Server
            </button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};
