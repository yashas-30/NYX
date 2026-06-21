import { z } from 'zod';
import { zodToJsonSchema } from 'zod-to-json-schema';
import { ToolDefinition } from './executeTool';
import { McpRegistry } from '../mcp/McpRegistry';

export interface ZodTool<T extends z.ZodTypeAny> {
  name: string;
  description: string;
  schema: T;
}

export function createToolDefinition<T extends z.ZodTypeAny>(tool: ZodTool<T>): ToolDefinition {
  const jsonSchema = zodToJsonSchema(tool.schema as any, { target: 'openApi3' }) as any;
  
  return {
    name: tool.name,
    description: tool.description,
    parameters: {
      type: 'object',
      properties: jsonSchema.properties || {},
      required: jsonSchema.required || []
    }
  };
}

export const ZOD_BUILTIN_TOOLS: ZodTool<any>[] = [
  {
    name: 'web_search',
    description: 'Search the web for current information.',
    schema: z.object({
      query: z.string().describe('The search query'),
      num_results: z.number().optional().describe('Number of results to return (default: 5)')
    })
  },
  {
    name: 'read_file',
    description: 'Read the contents of a file from the local filesystem.',
    schema: z.object({
      path: z.string().describe('Absolute path to the file to read')
    })
  },
  {
    name: 'write_file',
    description: 'Write contents to a file on the local filesystem.',
    schema: z.object({
      path: z.string().describe('Absolute path to the file to write'),
      content: z.string().describe('The content to write to the file')
    })
  },
  {
    name: 'edit_file',
    description: 'Replace a specific target block in a file with new replacement content.',
    schema: z.object({
      path: z.string().describe('Absolute path to the file'),
      target: z.string().describe('The exact block of text in the file to find'),
      replacement: z.string().describe('The replacement content')
    })
  },
  {
    name: 'list_directory',
    description: 'List all files and folders in a directory.',
    schema: z.object({
      path: z.string().describe('Absolute path to the directory')
    })
  },
  {
    name: 'grep_search',
    description: 'Search recursively in a directory for files containing a specific pattern.',
    schema: z.object({
      path: z.string().describe('Absolute path to the directory to search'),
      query: z.string().describe('The pattern/text to search for')
    })
  },
  {
    name: 'diff_files',
    description: 'Show line-by-line differences between two files.',
    schema: z.object({
      path_a: z.string().describe('Path to first file'),
      path_b: z.string().describe('Path to second file')
    })
  },
  {
    name: 'web_browse',
    description: 'Open a Tauri-native browser overlay window to view and navigate to a URL.',
    schema: z.object({
      url: z.string().describe('URL to navigate to')
    })
  },
  {
    name: 'fetch_page',
    description: "Fetch a webpage's HTML and extract its clean readable text.",
    schema: z.object({
      url: z.string().describe('URL to fetch')
    })
  },
  {
    name: 'web_scrape',
    description: 'Scrape specific content from a page by fetching and selecting lines containing a keyword.',
    schema: z.object({
      url: z.string().describe('URL to scrape'),
      keyword: z.string().describe('Keyword to filter matching lines')
    })
  },
  {
    name: 'run_python',
    description: 'Execute a Python code script.',
    schema: z.object({
      code: z.string().describe('Python code block to run'),
      timeout_seconds: z.number().optional().describe('Timeout for execution')
    })
  },
  {
    name: 'run_javascript',
    description: 'Execute a Node.js JavaScript code script.',
    schema: z.object({
      code: z.string().describe('JavaScript code block to run')
    })
  },
  {
    name: 'run_terminal_command',
    description: 'Execute a terminal command on the host machine. On Windows, this runs in PowerShell. On Unix, it runs in sh.',
    schema: z.object({
      command: z.string().describe('The terminal command to run'),
      cwd: z.string().optional().describe('Optional absolute path specifying the current working directory for the command')
    })
  },
  {
    name: 'run_shell',
    description: 'Execute a shell command in a specified directory.',
    schema: z.object({
      command: z.string().describe('Command to run'),
      cwd: z.string().describe('Directory to run the command in')
    })
  },
  {
    name: 'run_test',
    description: 'Run standard tests using a specified command.',
    schema: z.object({
      command: z.string().describe("Command (e.g. 'cargo test' or 'npm test')"),
      cwd: z.string().describe('Directory to run tests in')
    })
  },
  {
    name: 'lint_code',
    description: 'Run a linter command in a specified directory.',
    schema: z.object({
      command: z.string().describe("Linter command (e.g. 'eslint' or 'cargo clippy')"),
      cwd: z.string().describe('Directory to run linting in')
    })
  },
  {
    name: 'get_system_info',
    description: 'Retrieve CPU architecture, platform, and memory statistics of the host machine.',
    schema: z.object({})
  },
  {
    name: 'take_screenshot',
    description: 'Capture the primary display monitor screenshot and save it to the workspace.',
    schema: z.object({
      path: z.string().describe('File path where the screenshot JPEG will be saved')
    })
  },
  {
    name: 'run_mcp_tool',
    description: 'Invoke an MCP tool on a specified configured server.',
    schema: z.object({
      server: z.string().describe('MCP Server name'),
      tool: z.string().describe('Tool name to call'),
      arguments: z.string().describe('JSON arguments object passed to the tool')
    })
  },
  {
    name: 'schedule_task',
    description: 'Schedule a command to run after a delay.',
    schema: z.object({
      seconds: z.number().describe('Delay in seconds'),
      command: z.string().describe('Command to run')
    })
  },
  {
    name: 'read_pdf',
    description: 'Read and extract plain text from a PDF file.',
    schema: z.object({
      path: z.string().describe('Absolute path to PDF file')
    })
  },
  {
    name: 'read_docx',
    description: 'Read and extract plain text from a Word DOCX file.',
    schema: z.object({
      path: z.string().describe('Absolute path to DOCX file')
    })
  },
  {
    name: 'create_presentation',
    description: 'Create a slideshow presentation in markdown slides format.',
    schema: z.object({
      path: z.string().describe('Path to save presentation file'),
      title: z.string().describe('Title of presentation'),
      slides: z.array(z.string()).describe('List of slide texts')
    })
  },
  {
    name: 'create_spreadsheet',
    description: 'Create a CSV spreadsheet file.',
    schema: z.object({
      path: z.string().describe('Path to save spreadsheet CSV'),
      headers: z.array(z.string()).describe('Spreadsheet headers'),
      rows: z.array(z.array(z.string())).describe('List of row cells')
    })
  },
  {
    name: 'generate_image',
    description: 'Generate an image file.',
    schema: z.object({
      prompt: z.string().describe('Text description of the image to generate'),
      path: z.string().describe('Path to save generated image file')
    })
  },
  {
    name: 'edit_image',
    description: 'Edit/modify an image based on a prompt.',
    schema: z.object({
      path: z.string().describe('Path to original image file'),
      prompt: z.string().describe('Prompt instructions to modify the image')
    })
  },
  {
    name: 'analyze_image',
    description: 'Analyze an image file and answer a question about it.',
    schema: z.object({
      path: z.string().describe('Path to image file'),
      question: z.string().describe('Question to answer about the image content')
    })
  },
  {
    name: 'store_memory',
    description: 'Store a specific fact to persistent memory.',
    schema: z.object({
      fact: z.string().describe('The fact to remember')
    })
  },
  {
    name: 'delete_memory',
    description: 'Delete a fact from persistent memory by content or ID.',
    schema: z.object({
      idOrFact: z.string().describe('The memory fact string or ID to delete')
    })
  },
  {
    name: 'navigate',
    description: 'Navigate to a URL and return the accessible representation of the page.',
    schema: z.object({
      url: z.string().describe('The URL to navigate to')
    })
  },
  {
    name: 'click_element',
    description: 'Click an element on the current page using its selector or text.',
    schema: z.object({
      selector: z.string().describe('CSS selector or text content of the element to click')
    })
  },
  {
    name: 'extract_data',
    description: 'Extract the main text content/markdown from the current navigated page.',
    schema: z.object({})
  }
];

export class ToolRegistry {
  static getBuiltinTools(): ToolDefinition[] {
    return ZOD_BUILTIN_TOOLS.map(createToolDefinition);
  }

  static async getAllTools(): Promise<ToolDefinition[]> {
    const builtins = this.getBuiltinTools();
    
    let mcpMappedTools: ToolDefinition[] = [];
    try {
      const mcpRawTools = await McpRegistry.getAllTools();
      mcpMappedTools = mcpRawTools.map(t => ({
        name: t.name,
        description: t.description || 'MCP Tool',
        parameters: t.inputSchema || { type: 'object', properties: {} }
      }));
    } catch (err) {
      console.error("[ToolRegistry] Failed to fetch MCP tools:", err);
    }
    
    return [...builtins, ...mcpMappedTools];
  }
  
  static parseArguments(toolName: string, args: any): any {
    const builtin = ZOD_BUILTIN_TOOLS.find(t => t.name === toolName);
    if (builtin) {
      // Validate and parse using Zod
      return builtin.schema.parse(args);
    }
    return args; // Skip parsing for unknown (e.g. MCP) tools here
  }
}
