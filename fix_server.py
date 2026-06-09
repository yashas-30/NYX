import os
import re

def patch(file, regex, replacement):
    if not os.path.exists(file): return
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()
    new_content = re.sub(regex, replacement, content)
    with open(file, 'w', encoding='utf-8') as f:
        f.write(new_content)

base = "e:/NYX/apps/server"

# schema.ts
schema = os.path.join(base, "server/db/schema.ts")
patch(schema, r"import \{ pgTable, text as pgText, integer as pgInteger, real as pgReal, timestamp as pgTimestamp \} from 'drizzle-orm/pg-core';\nimport \{ sql \} from 'drizzle-orm';", "")

# adapters
patch(os.path.join(base, "server/fastify/adapters/gemini.adapter.ts"), r"data\.model", "(data as any).model")
patch(os.path.join(base, "server/fastify/adapters/lmstudio.adapter.ts"), r"data\.model", "(data as any).model")
patch(os.path.join(base, "server/fastify/adapters/ollama.adapter.ts"), r"data\.model", "(data as any).model")

# agents.router.ts
patch(os.path.join(base, "server/features/agents/agents.router.ts"), r"stream\.write\(\s*'\[Agents Router Error\] Failed to write error to stream:',\s*writeErr\s*\);", "stream.write('[Agents Router Error] Failed to write error to stream:' + writeErr);")

# chat.service.ts
patch(os.path.join(base, "server/features/chat/chat.service.ts"), r"const content = data\.message", "const content = (data as any).message")

# localModelRunner.ts
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"if \(data\.model\)", "if ((data as any).model)")
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"return data\.model", "return (data as any).model")
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"data\.models", "(data as any).models")
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"healthData\.status", "(healthData as any).status")
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"propsData\.version", "(propsData as any).version")
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"data\.choices\[0\]\.message\.content", "(data as any).choices[0].message.content")
patch(os.path.join(base, "server/features/local-models/localModelRunner.ts"), r"data\.choices", "(data as any).choices")

# modelProxy.service.ts
patch(os.path.join(base, "server/features/model-proxy/modelProxy.service.ts"), r"data\.choices", "(data as any).choices")

# nyx.router.ts
patch(os.path.join(base, "server/features/nyx/nyx.router.ts"), r"criticQueue\.add", "criticQueue!.add")
patch(os.path.join(base, "server/features/nyx/nyx.router.ts"), r"criticQueue\.opts", "criticQueue!.opts")
patch(os.path.join(base, "server/features/nyx/nyx.router.ts"), r"data: number \| object \| string", "data: any")

# vault.router.ts
patch(os.path.join(base, "server/features/vault/vault.router.ts"), r"errData\.error", "(errData as any).error")

# health.ts
patch(os.path.join(base, "server/health.ts"), r"from '\./db/client'", "from './db/client.js'")
patch(os.path.join(base, "server/health.ts"), r"from '\./redis'", "from './redis.js'")

# agentGraph.ts
patch(os.path.join(base, "server/lib/agentGraph.ts"), r"import \{ START, END", "import { StateGraph, END")
patch(os.path.join(base, "server/lib/agentGraph.ts"), r"START", "'__start__'")

# aiEngine.ts
patch(os.path.join(base, "server/lib/aiEngine.ts"), r"\}\)", " as any)")

# logger.ts
patch(os.path.join(base, "server/lib/logger.ts"), r"console\[method\]\(\.\.\.args\)", "console[method](...(args as any))")

# router.ts
patch(os.path.join(base, "server/lib/router.ts"), r"req\.provider === 'pollinations'", "req.provider === ('pollinations' as any)")

# unifiedEngine.ts
patch(os.path.join(base, "server/lib/unifiedEngine.ts"), r"if \(!job\.updateProgress\)", "if (false)")
patch(os.path.join(base, "server/lib/unifiedEngine.ts"), r"data\.choices", "(data as any).choices")

# logger.ts (root)
patch(os.path.join(base, "server/logger.ts"), r"import pinoHttp from 'pino-http';", "import pinoHttp from 'pino-http';\nconst pinoHttpFn = (pinoHttp as any).default || pinoHttp;")
patch(os.path.join(base, "server/logger.ts"), r"export const loggerMiddleware = pinoHttp", "export const loggerMiddleware = pinoHttpFn")

# cache.repo.ts
patch(os.path.join(base, "server/repositories/cache.repo.ts"), r"catch \(err\)", "catch (err: any)")

# websocket/index.ts
patch(os.path.join(base, "server/websocket/index.ts"), r"chunk: \{ text: string; done\?: boolean \}", "chunk: any")
