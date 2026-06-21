import { AnimatedIcon } from '@shared/components/ui/animated-icon';
import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2, ExternalLink, Settings, CheckCircle, AlertCircle, XCircle, Play, Pause, RefreshCw,
  Terminal, FileCode, GitBranch, Send, Link, Zap, Copy, Check, Eye, EyeOff, Wand2
} from 'lucide-react';

interface IdeConnection {
  id: string;
  name: string;
  editor: 'vscode' | 'cursor' | 'windsurf' | 'zed' | 'jetbrains';
  status: 'connected' | 'disconnected' | 'connecting' | 'error';
  workspace: string;
  lastSync: string;
  features: string[];
  files: string[];
}

const DEMO_CONNECTIONS: IdeConnection[] = [
  {
    id: 'ide-1',
    name: 'Main Project',
    editor: 'vscode',
    status: 'connected',
    workspace: '/Users/dev/projects/nyx',
    lastSync: '2 seconds ago',
    features: ['Inline Chat', 'Code Generation', 'Diff Preview', 'Terminal Integration', 'Git Integration'],
    files: ['src/app/App.tsx', 'src/features/chat/ChatPage.tsx', 'package.json', 'tsconfig.json'],
  },
  {
    id: 'ide-2',
    name: 'Backend API',
    editor: 'cursor',
    status: 'disconnected',
    workspace: '/Users/dev/projects/nyx-api',
    lastSync: '1 hour ago',
    features: ['Inline Chat', 'Code Generation', 'Diff Preview'],
    files: ['server.ts', 'routes/api.ts', 'models/User.ts'],
  },
];

const EDITOR_INFO: Record<string, { name: string; color: string; icon: typeof Code2 }> = {
  vscode: { name: 'VS Code', color: 'bg-blue-500/10 text-blue-400', icon: Code2 },
  cursor: { name: 'Cursor', color: 'bg-purple-500/10 text-purple-400', icon: Code2 },
  windsurf: { name: 'Windsurf', color: 'bg-cyan-500/10 text-cyan-400', icon: Code2 },
  zed: { name: 'Zed', color: 'bg-green-500/10 text-green-400', icon: Code2 },
  jetbrains: { name: 'JetBrains', color: 'bg-red-500/10 text-red-400', icon: Code2 },
};

const STATUS_ICONS = {
  connected: CheckCircle,
  disconnected: XCircle,
  connecting: RefreshCw,
  error: AlertCircle,
};

const STATUS_COLORS = {
  connected: 'text-green-500',
  disconnected: 'text-muted-foreground',
  connecting: 'text-primary animate-spin',
  error: 'text-red-500',
};

export default function IdeView() {
  const [connections, setConnections] = useState<IdeConnection[]>(DEMO_CONNECTIONS);
  const [selectedConnection, setSelectedConnection] = useState<IdeConnection | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [selectedEditor, setSelectedEditor] = useState<string>('vscode');
  const [showInstructions, setShowInstructions] = useState(false);
  const [copied, setCopied] = useState(false);

  const connectToIde = () => {
    setIsConnecting(true);
    setTimeout(() => {
      const info = EDITOR_INFO[selectedEditor];
      const newConnection: IdeConnection = {
        id: `ide-${Date.now()}`,
        name: 'New Workspace',
        editor: selectedEditor as any,
        status: 'connected',
        workspace: '/Users/dev/workspace',
        lastSync: 'Just now',
        features: ['Inline Chat', 'Code Generation', 'Diff Preview', 'Terminal Integration'],
        files: ['package.json', 'README.md', 'src/index.ts'],
      };
      setConnections((prev) => [...prev, newConnection]);
      setIsConnecting(false);
      setSelectedConnection(newConnection);
    }, 2000);
  };

  const disconnectIde = (connectionId: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === connectionId ? { ...c, status: 'disconnected' as const } : c))
    );
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const extensionCommand = 'code --install-extension nyx.vsix';

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
              <AnimatedIcon icon={Code2} size={18} />
            </div>
            <div>
              <h1 className="text-lg font-semibold text-foreground">IDE Connector</h1>
              <p className="text-xs text-muted-foreground">
                {connections.filter((c) => c.status === 'connected').length} connected · {connections.length} workspaces
              </p>
            </div>
          </div>
          <button
            onClick={() => setIsConnecting(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all"
          >
            <AnimatedIcon icon={Link} size={14} /> Connect IDE
          </button>
        </div>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Connections List */}
        <div className="w-72 border-r border-border flex flex-col">
          <div className="shrink-0 p-4 border-b border-border">
            <h2 className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Workspaces</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {connections.map((connection) => {
              const info = EDITOR_INFO[connection.editor];
              const StatusIcon = STATUS_ICONS[connection.status];
              return (
                <div
                  key={connection.id}
                  onClick={() => setSelectedConnection(connection)}
                  className={`p-3 rounded-lg cursor-pointer transition-all border ${
                    selectedConnection?.id === connection.id ? 'bg-primary/5 border-primary/30' : 'hover:bg-muted border-transparent'
                  }`}
                >
                  <div className="flex items-start gap-2.5">
                    <div className={`w-8 h-8 rounded-lg ${info.color} flex items-center justify-center flex-shrink-0`}>
                      <info.icon size={14} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <h3 className="text-xs font-medium text-foreground truncate">{connection.name}</h3>
                        <StatusIcon size={10} className={STATUS_COLORS[connection.status]} />
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{info.name}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{connection.workspace}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Extension Info */}
          <div className="shrink-0 p-4 border-t border-border">
            <button
              onClick={() => setShowInstructions(!showInstructions)}
              className="flex items-center gap-2 text-xs font-medium text-muted-foreground hover:text-foreground transition-all"
            >
              <AnimatedIcon icon={Wand2} size={12} /> Extension Setup
              {showInstructions ? <AnimatedIcon icon={EyeOff} size={10} /> : <AnimatedIcon icon={Eye} size={10} />}
            </button>
            <AnimatePresence>
              {showInstructions && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="overflow-hidden"
                >
                  <div className="mt-3 p-3 bg-muted rounded-lg">
                    <p className="text-[10px] text-muted-foreground mb-2">Install the NYX extension:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 text-[10px] font-mono text-foreground bg-background px-2 py-1 rounded border border-border truncate">
                        {extensionCommand}
                      </code>
                      <button
                        onClick={() => copyCommand(extensionCommand)}
                        className="p-1 rounded hover:bg-background text-muted-foreground transition-all"
                      >
                        {copied ? <AnimatedIcon icon={Check} size={10} className="text-green-500" /> : <AnimatedIcon icon={Copy} size={10} />}
                      </button>
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Detail Panel */}
        <div className="flex-1 overflow-y-auto p-6">
          {selectedConnection ? (
            <div className="max-w-3xl space-y-6">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-lg ${EDITOR_INFO[selectedConnection.editor].color} flex items-center justify-center`}>
                    <AnimatedIcon icon={Code2} size={18} />
                  </div>
                  <div>
                    <h2 className="text-lg font-semibold text-foreground">{selectedConnection.name}</h2>
                    <p className="text-xs text-muted-foreground">{selectedConnection.workspace}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {selectedConnection.status === 'connected' ? (
                    <button
                      onClick={() => disconnectIde(selectedConnection.id)}
                      className="flex items-center gap-1.5 px-3 py-2 bg-red-500/10 text-red-500 rounded-lg text-xs font-medium hover:bg-red-500/20 transition-all"
                    >
                      <AnimatedIcon icon={XCircle} size={12} /> Disconnect
                    </button>
                  ) : (
                    <button className="flex items-center gap-1.5 px-3 py-2 bg-green-500/10 text-green-500 rounded-lg text-xs font-medium hover:bg-green-500/20 transition-all">
                      <AnimatedIcon icon={Play} size={12} /> Connect
                    </button>
                  )}
                </div>
              </div>

              {/* Status */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    {React.createElement(STATUS_ICONS[selectedConnection.status], { size: 12, className: STATUS_COLORS[selectedConnection.status] })}
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Status</span>
                  </div>
                  <p className="text-sm font-medium text-foreground capitalize">{selectedConnection.status}</p>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatedIcon icon={RefreshCw} size={12} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Last Sync</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{selectedConnection.lastSync}</p>
                </div>
                <div className="p-4 bg-card border border-border rounded-xl">
                  <div className="flex items-center gap-2 mb-2">
                    <AnimatedIcon icon={FileCode} size={12} className="text-muted-foreground" />
                    <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Files</span>
                  </div>
                  <p className="text-sm font-medium text-foreground">{selectedConnection.files.length} tracked</p>
                </div>
              </div>

              {/* Features */}
              <div className="p-4 bg-card border border-border rounded-xl">
                <h3 className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                  <AnimatedIcon icon={Zap} size={12} /> Enabled Features
                </h3>
                <div className="flex flex-wrap gap-2">
                  {selectedConnection.features.map((feature) => (
                    <span
                      key={feature}
                      className="px-2.5 py-1 rounded-md bg-primary/10 text-primary text-[10px] font-medium"
                    >
                      {feature}
                    </span>
                  ))}
                </div>
              </div>

              {/* Tracked Files */}
              <div className="p-4 bg-card border border-border rounded-xl">
                <h3 className="text-xs font-medium text-foreground mb-3 flex items-center gap-2">
                  <AnimatedIcon icon={FileCode} size={12} /> Tracked Files
                </h3>
                <div className="space-y-1.5">
                  {selectedConnection.files.map((file) => (
                    <div key={file} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-muted/50 hover:bg-muted transition-all">
                      <AnimatedIcon icon={FileCode} size={12} className="text-muted-foreground" />
                      <span className="text-xs text-foreground font-mono">{file}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex gap-2">
                <button className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-medium hover:bg-primary/90 transition-all">
                  <AnimatedIcon icon={Terminal} size={12} /> Open Terminal
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-all">
                  <AnimatedIcon icon={GitBranch} size={12} /> Git Status
                </button>
                <button className="flex items-center gap-1.5 px-4 py-2 bg-muted text-foreground rounded-lg text-xs font-medium hover:bg-muted/80 transition-all">
                  <AnimatedIcon icon={Send} size={12} /> Send to Chat
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground">
              <div className="text-center">
                <AnimatedIcon icon={Code2} size={48} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm font-medium">Select a workspace</p>
                <p className="text-xs mt-1 opacity-60">Connect your IDE to use NYX features directly in your editor</p>
                <div className="mt-4 p-4 bg-card border border-border rounded-xl max-w-md mx-auto text-left">
                  <h3 className="text-xs font-medium text-foreground mb-2">Supported Editors</h3>
                  <div className="space-y-2">
                    {Object.entries(EDITOR_INFO).map(([key, info]) => (
                      <div key={key} className="flex items-center gap-2">
                        <div className={`w-6 h-6 rounded ${info.color} flex items-center justify-center`}>
                          <info.icon size={12} />
                        </div>
                        <span className="text-xs text-foreground">{info.name}</span>
                        <span className="text-[10px] text-muted-foreground ml-auto">Extension available</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Connect Modal */}
      <AnimatePresence>
        {isConnecting && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm"
            onClick={() => setIsConnecting(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-[480px] bg-card border border-border rounded-xl p-6 shadow-xl"
            >
              <h2 className="text-lg font-semibold text-foreground mb-4">Connect IDE</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Select Editor</label>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(EDITOR_INFO).map(([key, info]) => (
                      <div
                        key={key}
                        onClick={() => setSelectedEditor(key)}
                        className={`flex items-center gap-2 p-3 rounded-lg cursor-pointer transition-all border ${
                          selectedEditor === key ? 'border-primary/30 bg-primary/5' : 'border-transparent hover:bg-muted'
                        }`}
                      >
                        <div className={`w-8 h-8 rounded-lg ${info.color} flex items-center justify-center`}>
                          <info.icon size={14} />
                        </div>
                        <div>
                          <h3 className="text-xs font-medium text-foreground">{info.name}</h3>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="p-3 bg-muted rounded-lg">
                  <p className="text-[10px] text-muted-foreground mb-2">Install the NYX extension first:</p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-[10px] font-mono text-foreground bg-background px-2 py-1 rounded border border-border">
                      {extensionCommand}
                    </code>
                    <button
                      onClick={() => copyCommand(extensionCommand)}
                      className="p-1 rounded hover:bg-background text-muted-foreground transition-all"
                    >
                      {copied ? <AnimatedIcon icon={Check} size={10} className="text-green-500" /> : <AnimatedIcon icon={Copy} size={10} />}
                    </button>
                  </div>
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    onClick={() => setIsConnecting(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium text-muted-foreground hover:bg-muted transition-all"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={connectToIde}
                    className="px-4 py-2 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-all"
                  >
                    Connect
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
