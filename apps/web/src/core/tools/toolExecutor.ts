import { searchWeb, searchCodebase } from '@src/infrastructure/api/searchApi';
import {
  readFile,
  writeFile,
  listDirectory,
  executeCommand,
  validateWorkspace,
  fetchEvolutionaryRules,
} from '@src/infrastructure/api/coderApi';

export interface ToolResult {
  success: boolean;
  result: any;
  error?: string;
}

export async function executeTool(
  name: string,
  args: Record<string, any>,
  workspacePath: string,
  signal?: AbortSignal
): Promise<ToolResult> {
  try {
    switch (name) {
      case 'web_search': {
        const data = await searchWeb(args.query, signal, { recency: args.recency });
        return {
          success: data.success,
          result:
            data.results?.slice(0, 5).map((r: any) => ({
              title: r.title,
              url: r.link || r.url,
              snippet: r.snippet,
            })) || [],
        };
      }

      case 'search_codebase': {
        const data = await searchCodebase(args.query, signal, {
          topK: 10,
          threshold: 0.3,
        });
        return {
          success: data.success,
          result:
            data.results?.map((f: any) => ({
              path: f.relativePath || f.path,
              score: f.relevanceScore || f.score,
              snippet: f.content?.slice(0, 500),
            })) || [],
        };
      }

      case 'read_file': {
        const content = await readFile(args.path, signal);
        return { success: true, result: { path: args.path, content } };
      }

      case 'write_file': {
        const fullPath = args.path.startsWith('/') ? args.path : `${workspacePath}/${args.path}`;

        // Basic frontend path traversal check (backend also validates)
        if (args.path.includes('..') || args.path.includes('\0')) {
          return {
            success: false,
            result: null,
            error: 'Invalid file path: Directory traversal forbidden.',
          };
        }

        // TODO: The frontend should theoretically pause and ask for confirmation.
        // For now, we will proceed. In the future, we will throw a specific error
        // or yield a confirmation event if overwrite is not explicitly permitted.
        const result = await writeFile(fullPath, args.content, args.overwrite);
        return { success: true, result };
      }

      case 'run_command': {
        try {
          const result = await executeCommand(args.command || '', args.cwd || workspacePath, signal, 60000);
          return { success: true, result };
        } catch (error: any) {
          return {
            success: false,
            result: null,
            error: error.message || 'Command execution failed',
          };
        }
      }

      case 'validate_code': {
        const result = await validateWorkspace(signal);
        return { success: true, result };
      }

      case 'get_workspace_info': {
        const files = await listDirectory(workspacePath, signal);
        return {
          success: true,
          result: {
            root: workspacePath,
            fileCount: files.length,
            topLevelFiles: files.slice(0, 20),
          },
        };
      }

      case 'run_code': {
        const extMap: Record<string, string> = {
          javascript: 'js',
          typescript: 'ts',
          python: 'py',
          sh: 'sh',
        };
        const ext = extMap[args.language] || 'txt';
        const tempFile = `${workspacePath}/.nyx_temp_code.${ext}`;
        await writeFile(tempFile, args.code, true);

        let cmd = '';
        if (args.language === 'python') cmd = `python ${tempFile}`;
        else if (args.language === 'javascript') cmd = `node ${tempFile}`;
        else if (args.language === 'typescript') cmd = `npx tsx ${tempFile}`;
        else if (args.language === 'sh') cmd = `bash ${tempFile}`;
        else
          return { success: false, result: null, error: `Unsupported language: ${args.language}` };

        const result = await executeCommand(cmd, workspacePath, signal, 60000);
        return { success: true, result };
      }

      case 'get_evolutionary_rules': {
        const rules = await fetchEvolutionaryRules();
        return { success: true, result: rules };
      }

      case 'computer_use': {
        try {
          // Attempt to use Tauri invoke if available
          const { invoke } = await import('@tauri-apps/api/core');
          const result = await invoke('execute_computer_action', { 
            action: args.action, 
            params: args.params ? JSON.parse(args.params) : null 
          });
          return { success: true, result };
        } catch (error: any) {
          console.error('[ToolExecutor] computer_use failed:', error);
          return { success: false, result: null, error: error.message || 'Computer use failed' };
        }
      }

      default:
        return { success: false, result: null, error: `Unknown tool: ${name}` };
    }
  } catch (err: any) {
    return {
      success: false,
      result: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
