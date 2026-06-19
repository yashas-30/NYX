import os
import glob
import re

def migrate_router(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    # Imports
    content = re.sub(r"import\s+\{\s*FastifyInstance\s*(?:,\s*FastifyRequest\s*)?(?:,\s*FastifyReply\s*)?\}\s+from\s+'fastify';", "import { Router, Request, Response } from 'express';", content)
    
    # Export signature
    content = re.sub(r"export\s+async\s+function\s+(\w+)\s*\(\s*\w+\s*:\s*FastifyInstance\s*\)\s*\{", r"export const \1 = Router();\n\n{\n// Wrapping block to avoid scope issues, typically you can remove the wrapper entirely\nconst fastify = \1;", content)
    
    # fastify to router
    content = re.sub(r"\bfastify\.(get|post|put|delete|patch|options)\b", r"router.\1", content)
    # Actually wait, the variable in the wrapper is fastify. I'll just replace `fastify.` with `router.` directly.
    content = re.sub(r"\bfastify\.(get|post|put|delete|patch|options)\b", r"router.\1", content)
    
    # Remove the wrapper idea.
    content = re.sub(r"export\s+async\s+function\s+(\w+)\s*\(\s*\w+\s*:\s*FastifyInstance\s*\)\s*\{", r"export const \1 = Router();", content)
    
    # Because there might be a trailing `}` closing the old function block at the very end of the file, we can optionally strip it.
    if content.endswith('}'):
        content = content[:-1]
    elif content.strip().endswith('}'):
        # Find last closing brace
        last_brace = content.rfind('}')
        if last_brace != -1:
            content = content[:last_brace] + content[last_brace+1:]
            
    # req/res instead of request/reply
    content = re.sub(r"\b(request|req)\s*,\s*(reply|res)\b", "req, res", content)
    
    # reply.send to res.json
    content = re.sub(r"reply\.send\s*\(", "res.json(", content)
    
    # reply.code(xxx).send to res.status(xxx).json
    content = re.sub(r"reply\.code\s*\(\s*(\d+)\s*\)\.send\s*\(", r"res.status(\1).json(", content)
    
    # reply.raw to res
    content = re.sub(r"reply\.raw", "res", content)
    
    # request.body to req.body
    content = re.sub(r"request\.body", "req.body", content)
    content = re.sub(r"request\.query", "req.query", content)
    content = re.sub(r"request\.headers", "req.headers", content)
    content = re.sub(r"request\.params", "req.params", content)

    # Some routers have fastify.addHook
    content = re.sub(r"fastify\.addHook\s*\(\s*'onRequest'\s*,\s*", "router.use(", content)

    # Replace all references to the old parameter `fastify` with `router`
    content = re.sub(r"\bfastify\b", "router", content)

    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(content)

routers = glob.glob('E:/NYX/apps/server/server/features/**/*.router.ts', recursive=True)
for r in routers:
    migrate_router(r)
    print(f"Migrated {r}")
