import os

def patch(file, old, new):
    p = os.path.join("e:/NYX/apps/server", file)
    if not os.path.exists(p): return
    with open(p, 'r', encoding='utf-8') as f:
        content = f.read()
    content = content.replace(old, new)
    with open(p, 'w', encoding='utf-8') as f:
        f.write(content)

patch("server/fastify/adapters/lmstudio.adapter.ts", "const data = await res.json();", "const data = await res.json() as any;")

patch("server/features/agents/agents.router.ts", "stream.write('[Agents Router Error] Failed to write error to stream:', writeErr);", "stream.write('[Agents Router Error] Failed to write error to stream:' + String(writeErr));")

patch("server/features/chat/chat.service.ts", "const data = await res.json();", "const data = await res.json() as any;")

patch("server/features/local-models/localModelRunner.ts", "const data = await res.json();", "const data = await res.json() as any;")
patch("server/features/local-models/localModelRunner.ts", "const healthData = await healthRes.json();", "const healthData = await healthRes.json() as any;")
patch("server/features/local-models/localModelRunner.ts", "const propsData = await propsRes.json();", "const propsData = await propsRes.json() as any;")

patch("server/features/model-proxy/modelProxy.service.ts", "const data = await res.json();", "const data = await res.json() as any;")

# agentGraph.ts fixes
patch("server/lib/agentGraph.ts", "import { StateGraph, END } from '@langchain/langgraph';", "import { START, StateGraph, END } from '@langchain/langgraph';")
patch("server/lib/agentGraph.ts", "workflow.addEdge('planner', 'coder');", "workflow.addEdge(START, 'planner');\\nworkflow.addEdge('planner', 'coder');")

# aiEngine.ts fixes
patch("server/lib/aiEngine.ts", "const verifyData = await verifyResponse.json();", "const verifyData = await verifyResponse.json() as any;")

# logger.ts fixes
patch("server/lib/logger.ts", "console[method](...args)", "console[method](...(args as any))")

# router.ts fixes
patch("server/lib/router.ts", "req.provider === 'pollinations'", "req.provider === ('pollinations' as any)")

# unifiedEngine.ts fixes
patch("server/lib/unifiedEngine.ts", "if (!job.updateProgress) {", "if (false) {")
patch("server/lib/unifiedEngine.ts", "const data = await preprocessRes.json();", "const data = await preprocessRes.json() as any;")

# logger.ts (root) fixes
patch("server/logger.ts", "export const loggerMiddleware = pinoHttp({", "const pinoHttpFn = (pinoHttp as any).default || pinoHttp;\\nexport const loggerMiddleware = pinoHttpFn({")

# cache.repo.ts fixes
patch("server/repositories/cache.repo.ts", "catch (err)", "catch (err: any)")
