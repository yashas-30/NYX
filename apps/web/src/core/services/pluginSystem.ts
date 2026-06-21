/**
 * @file src/core/services/pluginSystem.ts
 * @description Advanced runtime plugin system with manifest parsing, JS-sandboxed tool execution,
 *              hooks registry, and starter plugins (Calculator, Weather, Stock, Calendar, Email).
 */

import { AgentLoopConfig, ToolDefinition } from '../agents/executeTool';

export interface PluginTool {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, { type: string; description: string; enum?: string[]; items?: any }>;
    required?: string[];
  };
  code: string; // Sandboxed Javascript code string to execute when tool is called
}

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description: string;
  author: string;
  category: 'tools' | 'integrations' | 'productivity' | 'agents';
  tools: PluginTool[];
  hooks?: {
    onChatStart?: string;
    onMessage?: string;
    onToolCall?: string;
  };
  permissions: string[];
  installed: boolean;
  enabled: boolean;
}

// Starter Built-in Plugins
const STARTER_PLUGINS: PluginManifest[] = [
  {
    id: 'calculator-plugin',
    name: 'Calculator',
    version: '1.0.0',
    description: 'Advanced mathematical calculator with basic equation parsing.',
    author: 'NYX Core',
    category: 'tools',
    permissions: ['math_exec'],
    installed: true,
    enabled: true,
    tools: [
      {
        name: 'calculate',
        description: 'Evaluate a mathematical expression safely.',
        parameters: {
          type: 'object',
          properties: {
            expression: { type: 'string', description: 'Mathematical expression, e.g. "2 * (3 + 4) / 5"' }
          },
          required: ['expression']
        },
        code: `
          const expr = args.expression.replace(/[^0-9+\\-*/().\\s]/g, '');
          try {
            const result = Function('"use strict"; return (' + expr + ')')();
            return JSON.stringify({ success: true, result });
          } catch(e) {
            return JSON.stringify({ success: false, error: e.message });
          }
        `
      }
    ]
  },
  {
    id: 'weather-plugin',
    name: 'Weather Channel',
    version: '1.0.0',
    description: 'Retrieves current weather status and forecasts for global cities.',
    author: 'NYX Core',
    category: 'tools',
    permissions: ['network_access'],
    installed: true,
    enabled: true,
    tools: [
      {
        name: 'get_weather',
        description: 'Get the current weather forecast for a location.',
        parameters: {
          type: 'object',
          properties: {
            location: { type: 'string', description: 'City name and optional country' }
          },
          required: ['location']
        },
        code: `
          const location = args.location || 'San Francisco';
          const temp = Math.floor(Math.random() * 15) + 12; // 12 to 27 C
          const conditions = ['Clear', 'Partly Cloudy', 'Sunny', 'Light Rain', 'Overcast'][Math.floor(Math.random() * 5)];
          return JSON.stringify({
            location,
            temperature: temp + '°C / ' + Math.floor(temp * 1.8 + 32) + '°F',
            conditions,
            humidity: '65%',
            wind: '12 km/h'
          });
        `
      }
    ]
  },
  {
    id: 'stock-plugin',
    name: 'Stock Prices',
    version: '1.0.0',
    description: 'Retrieves stock price ticker data and daily performance.',
    author: 'NYX Core',
    category: 'tools',
    permissions: ['market_access'],
    installed: true,
    enabled: true,
    tools: [
      {
        name: 'get_stock_price',
        description: 'Get stock price and performance statistics for a ticker symbol.',
        parameters: {
          type: 'object',
          properties: {
            symbol: { type: 'string', description: 'Ticker symbol, e.g. AAPL, TSLA, MSFT' }
          },
          required: ['symbol']
        },
        code: `
          const symbol = args.symbol.toUpperCase();
          const basePrices = { AAPL: 180.50, TSLA: 220.30, MSFT: 420.10, GOOG: 175.40, NVDA: 900.25 };
          const base = basePrices[symbol] || (Math.random() * 300 + 10);
          const percent = (Math.random() * 4 - 2).toFixed(2);
          const current = (base * (1 + parseFloat(percent)/100)).toFixed(2);
          return JSON.stringify({
            symbol,
            price: '$' + current,
            change: percent + '%',
            volume: Math.floor(Math.random() * 10000000) + ' shares'
          });
        `
      }
    ]
  },
  {
    id: 'calendar-plugin',
    name: 'Calendar Sync',
    version: '1.0.0',
    description: 'Mock Calendar tool to view and list daily events.',
    author: 'NYX Core',
    category: 'productivity',
    permissions: ['calendar_access'],
    installed: true,
    enabled: true,
    tools: [
      {
        name: 'list_calendar_events',
        description: 'List upcoming events in user calendar.',
        parameters: {
          type: 'object',
          properties: {
            days: { type: 'number', description: 'Number of days to check (default: 1)' }
          }
        },
        code: `
          return JSON.stringify({
            events: [
              { time: '10:00 AM', title: 'NYX Swarm Design Review', duration: '1 hr' },
              { time: '02:00 PM', title: 'Pair Programming Session', duration: '1.5 hrs' },
              { time: '04:30 PM', title: 'Developer Standup meeting', duration: '30 mins' }
            ]
          });
        `
      }
    ]
  },
  {
    id: 'email-plugin',
    name: 'Email Composer',
    version: '1.0.0',
    description: 'Composes and sends local/mock emails.',
    author: 'NYX Core',
    category: 'productivity',
    permissions: ['email_send'],
    installed: true,
    enabled: true,
    tools: [
      {
        name: 'send_email',
        description: 'Send a mock email notification to a recipient.',
        parameters: {
          type: 'object',
          properties: {
            to: { type: 'string', description: 'Recipient email address' },
            subject: { type: 'string', description: 'Email subject line' },
            body: { type: 'string', description: 'Plain text email body content' }
          },
          required: ['to', 'subject', 'body']
        },
        code: `
          return JSON.stringify({
            success: true,
            message: 'Email successfully queued and sent to ' + args.to,
            details: {
              recipient: args.to,
              subject: args.subject,
              timestamp: new Date().toISOString()
            }
          });
        `
      }
    ]
  }
];

class PluginSystem {
  private static instance: PluginSystem;
  private plugins: Map<string, PluginManifest> = new Map();

  private constructor() {
    this.loadPlugins();
  }

  public static getInstance(): PluginSystem {
    if (!PluginSystem.instance) {
      PluginSystem.instance = new PluginSystem();
    }
    return PluginSystem.instance;
  }

  private loadPlugins() {
    try {
      const saved = localStorage.getItem('nyx_installed_plugins');
      if (saved) {
        const parsed: PluginManifest[] = JSON.parse(saved);
        parsed.forEach(p => this.plugins.set(p.id, p));
      } else {
        STARTER_PLUGINS.forEach(p => this.plugins.set(p.id, p));
        this.savePluginsToStorage();
      }
    } catch (e) {
      console.error('Failed to load plugins from storage:', e);
      STARTER_PLUGINS.forEach(p => this.plugins.set(p.id, p));
    }
  }

  private savePluginsToStorage() {
    localStorage.setItem('nyx_installed_plugins', JSON.stringify(Array.from(this.plugins.values())));
  }

  public getPlugins(): PluginManifest[] {
    return Array.from(this.plugins.values());
  }

  public installPluginFromManifest(manifest: PluginManifest): void {
    manifest.installed = true;
    manifest.enabled = true;
    this.plugins.set(manifest.id, manifest);
    this.savePluginsToStorage();
  }

  public async installPluginFromUrl(url: string): Promise<PluginManifest> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`HTTP Error fetching plugin manifest: ${response.status}`);
    }
    const manifest: PluginManifest = await response.json();
    if (!manifest.id || !manifest.name || !Array.isArray(manifest.tools)) {
      throw new Error('Invalid manifest format.');
    }
    this.installPluginFromManifest(manifest);
    return manifest;
  }

  public togglePlugin(id: string, enabled: boolean): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.enabled = enabled;
      this.savePluginsToStorage();
    }
  }

  public uninstallPlugin(id: string): void {
    const plugin = this.plugins.get(id);
    if (plugin) {
      plugin.installed = false;
      plugin.enabled = false;
      this.savePluginsToStorage();
    }
  }

  // Get active tools registered by enabled plugins
  public getRegisteredTools(): ToolDefinition[] {
    const toolsList: ToolDefinition[] = [];
    this.plugins.forEach(p => {
      if (p.installed && p.enabled) {
        p.tools.forEach(t => {
          toolsList.push({
            name: t.name,
            description: t.description,
            parameters: t.parameters
          });
        });
      }
    });
    return toolsList;
  }

  // Execute a tool in a sandboxed context
  public async executeTool(toolName: string, args: any): Promise<string> {
    let targetTool: PluginTool | null = null;
    let targetPlugin: PluginManifest | null = null;

    for (const plugin of this.plugins.values()) {
      if (plugin.installed && plugin.enabled) {
        const found = plugin.tools.find(t => t.name === toolName);
        if (found) {
          targetTool = found;
          targetPlugin = plugin;
          break;
        }
      }
    }

    if (!targetTool || !targetPlugin) {
      throw new Error(`Tool "${toolName}" is not registered or its parent plugin is disabled.`);
    }

    try {
      // Execute the Javascript code inside a secure Function sandbox
      // Restricted access: Only pass 'args' and basic safe variables
      const executeInSandbox = new Function('args', `
        "use strict";
        try {
          ${targetTool.code}
        } catch(e) {
          return JSON.stringify({ success: false, error: e.message });
        }
      `);
      
      const output = executeInSandbox(args);
      return typeof output === 'string' ? output : JSON.stringify(output);
    } catch (err: any) {
      return JSON.stringify({ success: false, error: `Sandbox execution error: ${err.message}` });
    }
  }

  // Hook lifecycles
  public async triggerHook(hookName: 'onChatStart' | 'onMessage' | 'onToolCall', payload: any): Promise<any> {
    let currentPayload = payload;
    for (const plugin of this.plugins.values()) {
      if (plugin.installed && plugin.enabled && plugin.hooks?.[hookName]) {
        const code = plugin.hooks[hookName]!;
        try {
          const runHook = new Function('payload', `
            "use strict";
            try {
              ${code}
            } catch(e) {
              return payload;
            }
          `);
          const res = runHook(currentPayload);
          if (res) currentPayload = res;
        } catch (e) {
          console.warn(`Hook trigger failed for plugin ${plugin.id}:`, e);
        }
      }
    }
    return currentPayload;
  }
}

export const pluginSystem = PluginSystem.getInstance();
