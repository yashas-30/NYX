import fs from 'fs';
import path from 'path';

const baseDir = 'e:/NYX/apps/server';

const replacements = [
  {
    file: 'server/middleware/requestSigner.ts',
    changes: [
      {
        from: "if (process.env.ENFORCE_REQUEST_SIGNATURE === 'true') {",
        to: "if (env.ENFORCE_REQUEST_SIGNATURE) {"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/unifiedEngine.ts',
    changes: [
      {
        from: "let LLAMA_PORT = process.env.LLAMA_PORT || LOCAL_MODEL_PORT;",
        to: "let LLAMA_PORT = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/telemetry.ts',
    changes: [
      {
        from: "url: isProd ? process.env.OTLP_TRACE_ENDPOINT : 'http://localhost:4318/v1/traces',",
        to: "url: isProd ? env.OTLP_TRACE_ENDPOINT : 'http://localhost:4318/v1/traces',"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/queue.ts',
    changes: [
      {
        from: "const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost';",
        to: "const rabbitUrl = env.RABBITMQ_URL || 'amqp://localhost';"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/pluginRegistry.ts',
    changes: [
      {
        from: "const PLUGINS_DIR = process.env.PLUGINS_DIR || path.join(_dirname, '../../plugins');",
        to: "const PLUGINS_DIR = env.PLUGINS_DIR || path.join(_dirname, '../../plugins');"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/paths.ts',
    changes: [
      {
        from: "export const isProd = process.env.NODE_ENV === 'production' || process.env.IS_PACKAGED === 'true';",
        to: "export const isProd = env.NODE_ENV === 'production' || env.IS_PACKAGED;"
      },
      {
        from: "if (process.env.NYX_WORKSPACE_ROOT) {",
        to: "if (env.NYX_WORKSPACE_ROOT) {"
      },
      {
        from: "return path.resolve(process.env.NYX_WORKSPACE_ROOT);",
        to: "return path.resolve(env.NYX_WORKSPACE_ROOT);"
      },
      {
        from: "process.env.NYX_PYTHON_PATH,",
        to: "env.NYX_PYTHON_PATH,"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/logger.ts',
    changes: [
      {
        from: "const _isProd = process.env.NODE_ENV === 'production' || process.env.IS_PACKAGED === 'true';",
        to: "const _isProd = env.NODE_ENV === 'production' || env.IS_PACKAGED;"
      },
      {
        from: "if (process.env.NYX_WORKSPACE_ROOT) {",
        to: "if (env.NYX_WORKSPACE_ROOT) {"
      },
      {
        from: "return path.resolve(process.env.NYX_WORKSPACE_ROOT);",
        to: "return path.resolve(env.NYX_WORKSPACE_ROOT);"
      },
      {
        from: "{ stream: fileStream, level: (process.env.LOG_LEVEL as pino.Level) || 'info' },",
        to: "{ stream: fileStream, level: (env.LOG_LEVEL as pino.Level) || 'info' },"
      },
      {
        from: "{ stream: process.stdout, level: (process.env.LOG_LEVEL as pino.Level) || 'info' },",
        to: "{ stream: process.stdout, level: (env.LOG_LEVEL as pino.Level) || 'info' },"
      },
      {
        from: "level: process.env.LOG_LEVEL || 'info',",
        to: "level: env.LOG_LEVEL || 'info',"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/gateway.ts',
    changes: [
      {
        from: "const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;",
        to: "const accountId = env.CLOUDFLARE_ACCOUNT_ID;"
      },
      {
        from: "const gatewayName = process.env.CLOUDFLARE_GATEWAY_NAME;",
        to: "const gatewayName = env.CLOUDFLARE_GATEWAY_NAME;"
      },
      {
        from: "const useGateway = process.env.USE_CLOUDFLARE_GATEWAY === 'true';",
        to: "const useGateway = env.USE_CLOUDFLARE_GATEWAY;"
      },
      {
        from: "gemini: process.env.GEMINI_API_KEY || process.env.LLM_API_KEY || '',",
        to: "gemini: env.GEMINI_API_KEY || env.LLM_API_KEY || '',"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/alerts.ts',
    changes: [
      {
        from: "private static slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;",
        to: "private static slackWebhookUrl = env.SLACK_WEBHOOK_URL;"
      },
      {
        from: "private static pagerDutyRoutingKey = process.env.PAGERDUTY_ROUTING_KEY;",
        to: "private static pagerDutyRoutingKey = env.PAGERDUTY_ROUTING_KEY;"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/lib/aiEngine.ts',
    changes: [
      {
        from: "const port = process.env.ANTIGRAVITY_PORT || '3003';",
        to: "const port = env.ANTIGRAVITY_PORT || 3003;"
      },
      {
        from: "const port = process.env.ANTIGRAVITY_PORT || '3003';",
        to: "const port = env.ANTIGRAVITY_PORT || 3003;"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/fastify/webhook.service.ts',
    changes: [
      {
        from: "host: process.env.REDIS_HOST || '127.0.0.1',",
        to: "host: env.REDIS_HOST || '127.0.0.1',"
      },
      {
        from: "port: parseInt(process.env.REDIS_PORT || '6379'),",
        to: "port: env.REDIS_PORT || 6379,"
      }
    ],
    importPath: '../config/env.js'
  },
  {
    file: 'server/features/terminal/terminal.service.ts',
    changes: [
      {
        from: "process.env.NYX_ALLOW_RAW_TERMINAL === 'true' && process.env.NODE_ENV === 'development';",
        to: "env.NYX_ALLOW_RAW_TERMINAL && env.NODE_ENV === 'development';"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/vault/vault.router.ts',
    changes: [
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/system/system.service.ts',
    changes: [
      {
        from: "const llamaPort = process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString();",
        to: "const llamaPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/model-proxy/modelProxy.service.ts',
    changes: [
      {
        from: "process.env.ANTIGRAVITY_URL || `http://127.0.0.1:${process.env.ANTIGRAVITY_PORT || '3003'}`",
        to: "env.ANTIGRAVITY_URL || `http://127.0.0.1:${env.ANTIGRAVITY_PORT || 3003}`"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/nyx/search.service.ts',
    changes: [
      {
        from: "const apiKey = keys['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY;",
        to: "const apiKey = keys['GEMINI_API_KEY'] || env.GEMINI_API_KEY;"
      },
      {
        from: "const apiKey = keys['GEMINI_API_KEY'] || process.env.GEMINI_API_KEY;",
        to: "const apiKey = keys['GEMINI_API_KEY'] || env.GEMINI_API_KEY;"
      },
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/nyx/memory.service.ts',
    changes: [
      {
        from: "const llamaPort = process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString();",
        to: "const llamaPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      },
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/nyx/agent.service.ts',
    changes: [
      {
        from: "const llamaPort = process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString();",
        to: "const llamaPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      },
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/local-models/localModels.service.ts',
    changes: [
      {
        from: "const port = process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString();",
        to: "const port = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/local-models/qwenLocal.service.ts',
    changes: [
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/local-models/localModelRunner.ts',
    changes: [
      {
        from: "let activePort = parseInt(process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString(), 10);",
        to: "let activePort = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      },
      {
        from: "const defaultPort = parseInt(process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString(), 10);",
        to: "const defaultPort = env.LLAMA_PORT || LOCAL_MODEL_PORT;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/chat/chat.service.ts',
    changes: [
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      },
      {
        from: "const scraplingPort = process.env.SCRAPLING_PORT || '3002';",
        to: "const scraplingPort = env.SCRAPLING_PORT || 3002;"
      }
    ],
    importPath: '../../config/env.js'
  },
  {
    file: 'server/features/auth/auth.router.ts',
    changes: [
      {
        from: "secure: process.env.NODE_ENV === 'production',",
        to: "secure: env.NODE_ENV === 'production',"
      },
      {
        from: "secure: process.env.NODE_ENV === 'production',",
        to: "secure: env.NODE_ENV === 'production',"
      }
    ],
    importPath: '../../config/env.js'
  }
];

for (const rep of replacements) {
  const filePath = path.join(baseDir, rep.file);
  if (!fs.existsSync(filePath)) {
    console.error(`File not found: ${filePath}`);
    continue;
  }

  let content = fs.readFileSync(filePath, 'utf8');
  let originalContent = content;

  // Add env import if not present
  if (!content.includes('import { env }')) {
    // Add import statement after the last import or at the top
    const lines = content.split('\n');
    let insertIdx = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) {
        insertIdx = i + 1;
      }
    }
    lines.splice(insertIdx, 0, `import { env } from '${rep.importPath}';`);
    content = lines.join('\n');
  }

  for (const change of rep.changes) {
    if (!content.includes(change.from)) {
      console.warn(`Target not found in ${rep.file}: "${change.from}"`);
    } else {
      content = content.replace(new RegExp(escapeRegExp(change.from), 'g'), change.to);
    }
  }

  if (content !== originalContent) {
    fs.writeFileSync(filePath, content, 'utf8');
    console.log(`Updated ${rep.file}`);
  }
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
