import { Type } from '@google/genai';

export const NYX_TOOLS = [
  // ── Web Search ──
  {
    name: 'web_search',
    description:
      'Search the web for current information, documentation, or examples. Use for: latest versions, API docs, troubleshooting, best practices.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Concise search query (5-10 keywords). Example: "React 19 use hook data fetching"',
        },
        recency: {
          type: Type.STRING,
          enum: ['day', 'week', 'month', 'year'],
          description: 'How recent results should be',
        },
      },
      required: ['query'],
    },
  },

  // ── Codebase Search ──
  {
    name: 'search_codebase',
    description:
      'Search the current workspace codebase for files, functions, classes, or patterns. Use for: finding existing code, understanding project structure.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        query: {
          type: Type.STRING,
          description:
            'Search query for codebase. Example: "user authentication hook" or "function handleLogin"',
        },
        fileType: {
          type: Type.STRING,
          enum: ['ts', 'tsx', 'js', 'jsx', 'py', 'go', 'rs', 'any'],
          description: 'Filter by file type',
        },
      },
      required: ['query'],
    },
  },

  // ── File Read ──
  {
    name: 'read_file',
    description:
      'Read the contents of a file in the workspace. Use for: understanding existing code before modifying, checking imports, reading configs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description:
            'Absolute or relative file path. Example: "src/components/Button.tsx" or "/workspace/src/utils.ts"',
        },
        startLine: {
          type: Type.NUMBER,
          description: 'Optional: start reading from this line number',
        },
        endLine: {
          type: Type.NUMBER,
          description: 'Optional: stop reading at this line number',
        },
      },
      required: ['path'],
    },
  },

  // ── File Write ──
  {
    name: 'write_file',
    description:
      'Write or overwrite a file in the workspace. Use for: creating new files, updating existing code. ALWAYS confirm with user before overwriting existing files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        path: {
          type: Type.STRING,
          description: 'File path to write to',
        },
        content: {
          type: Type.STRING,
          description: 'Complete file content',
        },
        overwrite: {
          type: Type.BOOLEAN,
          description:
            'Whether to overwrite if file exists. Default false — will ask user for confirmation.',
        },
      },
      required: ['path', 'content'],
    },
  },

  // ── Terminal / Command Execution ──
  {
    name: 'run_command',
    description:
      'Execute a terminal command in the workspace. Use for: installing packages, running tests, building, git operations. Only safe commands allowed.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        command: {
          type: Type.STRING,
          description:
            'Command to run. Examples: "npm install lodash", "git status", "python test.py"',
        },
        cwd: {
          type: Type.STRING,
          description: 'Working directory for the command. Defaults to workspace root.',
        },
      },
      required: ['command'],
    },
  },

  // ── Code Validation ──
  {
    name: 'validate_code',
    description:
      'Run linting, type checking, or tests on the workspace. Use after writing code to verify correctness.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        type: {
          type: Type.STRING,
          enum: ['typescript', 'eslint', 'prettier', 'tests', 'all'],
          description: 'Type of validation to run',
        },
      },
      required: ['type'],
    },
  },

  // ── Get Workspace Info ──
  {
    name: 'get_workspace_info',
    description:
      'Get information about the current workspace: file tree, package.json dependencies, tech stack detected.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  // 🖥️ Code Execution 🖥️
  {
    name: 'run_code',
    description:
      'Execute code snippets (Node.js, Python, or shell) in a temporary local environment. Use for: testing logic, evaluating regex, or verifying script behavior before writing files.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        code: {
          type: Type.STRING,
          description: 'The exact code to execute.',
        },
        language: {
          type: Type.STRING,
          enum: ['javascript', 'typescript', 'python', 'sh'],
          description: 'The programming language of the code.',
        },
      },
      required: ['code', 'language'],
    },
  },

  // 🧠 Memory / Rules 🧠
  {
    name: 'get_evolutionary_rules',
    description: 'Retrieve learned coding rules and preferences from previous sessions.',
    parameters: {
      type: Type.OBJECT,
      properties: {},
    },
  },

  // 🖱️ Computer Use 🖱️
  {
    name: 'computer_use',
    description: 'Perform an OS level computer action (mouse move, click, type, screenshot).',
    parameters: {
      type: Type.OBJECT,
      properties: {
        action: {
          type: Type.STRING,
          description: 'The action to perform: screenshot, mouse_move, left_click, left_click_drag, right_click, middle_click, double_click, type, key'
        },
        params: {
          type: Type.STRING,
          description: 'JSON string of parameters for the action (e.g. {"x": 100, "y": 200} for mouse_move, or {"text": "hello"} for type/key)'
        }
      },
      required: ['action']
    }
  }
];
