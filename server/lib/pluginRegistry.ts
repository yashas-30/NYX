import fs from 'fs';
import path from 'path';
import logger from './logger.ts';

// __dirname is always defined in Node CJS and esbuild CJS bundles.
// eslint-disable-next-line @typescript-eslint/no-var-requires, no-undef
const _dirname: string = __dirname;
const PLUGINS_DIR = process.env.PLUGINS_DIR || path.join(_dirname, '../../plugins');

export interface NYXPlugin {
  name: string;
  version: string;
  hooks: {
    onRequest?: (context: any) => Promise<any> | any;
    onResponse?: (context: any) => Promise<any> | any;
    onTool?: (context: any) => Promise<any> | any;
  };
}

class PluginRegistry {
  private plugins = new Map<string, NYXPlugin>();

  registerPlugin(plugin: NYXPlugin): void {
    if (!plugin.name || !plugin.version) {
      logger.warn('[PluginRegistry] Attempted to register invalid plugin missing name or version');
      return;
    }
    this.plugins.set(plugin.name, plugin);
    logger.info(`[PluginRegistry] Registered plugin: ${plugin.name} v${plugin.version}`);
  }

  async executeHook(hookName: 'onRequest' | 'onResponse' | 'onTool', context: any): Promise<any> {
    let currentContext = context;
    for (const [name, plugin] of this.plugins.entries()) {
      const hookFn = plugin.hooks[hookName];
      if (hookFn) {
        try {
          logger.info(`[PluginRegistry] Executing hook "${hookName}" for plugin: ${name}`);
          const result = await hookFn(currentContext);
          if (result !== undefined) {
            currentContext = result;
          }
        } catch (err) {
          logger.error(
            { err, pluginName: name, hookName },
            `[PluginRegistry] Plugin hook execution failed`
          );
        }
      }
    }
    return currentContext;
  }

  async loadPlugins(): Promise<void> {
    try {
      if (!fs.existsSync(PLUGINS_DIR)) {
        fs.mkdirSync(PLUGINS_DIR, { recursive: true });
        logger.info(`[PluginRegistry] Created plugins directory at: ${PLUGINS_DIR}`);
        return;
      }

      const files = fs.readdirSync(PLUGINS_DIR);
      for (const file of files) {
        const fullPath = path.join(PLUGINS_DIR, file);
        const stats = fs.statSync(fullPath);

        let pluginPath = '';
        if (stats.isDirectory()) {
          const indexJs = path.join(fullPath, 'index.js');
          const indexTs = path.join(fullPath, 'index.ts');
          if (fs.existsSync(indexJs)) {
            pluginPath = indexJs;
          } else if (fs.existsSync(indexTs)) {
            pluginPath = indexTs;
          }
        } else if (file.endsWith('.js') || file.endsWith('.ts')) {
          pluginPath = fullPath;
        }

        if (pluginPath) {
          try {
            // Import dynamically using file:// protocol on Windows if needed, standard import works for ESM
            const fileUrl = `file://${pluginPath.replace(/\\/g, '/')}`;
            const mod = await import(fileUrl);
            const plugin: NYXPlugin = mod.default || mod.plugin;

            if (plugin && plugin.hooks) {
              this.registerPlugin(plugin);
            } else {
              logger.warn(`[PluginRegistry] Module at ${file} did not export a valid NYXPlugin`);
            }
          } catch (err: any) {
            logger.error({ err, file }, `[PluginRegistry] Failed to import plugin module`);
          }
        }
      }
    } catch (err: any) {
      logger.error({ err }, '[PluginRegistry] Error scanning plugins directory');
    }
  }

  getPlugins(): NYXPlugin[] {
    return Array.from(this.plugins.values());
  }
}

export const pluginRegistry = new PluginRegistry();
