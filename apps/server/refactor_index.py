import os
import re

filepath = 'E:/NYX/apps/server/server/routes/index.ts'
with open(filepath, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace Fastify imports with Express
content = re.sub(r"import\s+\{\s*FastifyInstance(?:[^}]+)?\}\s+from\s+'fastify';", "import { Application, Router, Request, Response, NextFunction } from 'express';", content)

# Replace the main function signature
content = re.sub(r"export\s+async\s+function\s+registerRoutes\s*\(\s*app\s*:\s*FastifyInstance\s*\)\s*\{", "export async function registerRoutes(app: Application) {", content)

# Replace app.register(async function v1Router(v1: FastifyInstance) { ... }, { prefix: '/api/v1' });
# with const v1 = Router(); app.use('/api/v1', v1);
content = re.sub(r"await\s+app\.register\s*\(\s*async\s+function\s+v1Router\s*\(\s*v1\s*:\s*FastifyInstance\s*\)\s*\{", "const v1 = Router();\n  app.use('/api/v1', v1);\n  {", content)
content = re.sub(r"await\s+app\.register\s*\(\s*async\s+function\s+v2Router\s*\(\s*v2\s*:\s*FastifyInstance\s*\)\s*\{", "const v2 = Router();\n  app.use('/api/v2', v2);\n  {", content)

# Remove the trailing }, { prefix: '/api/v1' } );
content = re.sub(r"\}\s*,\s*\{\s*prefix\s*:\s*'/api/v1'\s*\}\s*\)\s*;", "}", content)
content = re.sub(r"\}\s*,\s*\{\s*prefix\s*:\s*'/api/v2'\s*\}\s*\)\s*;", "}", content)

# Replace v1.register(someRouter, { prefix: '/some' });
content = re.sub(r"v1\.register\s*\(\s*(\w+)\s*,\s*\{\s*prefix\s*:\s*'([^']+)'\s*\}\s*\)\s*;", r"v1.use('\2', \1);", content)
content = re.sub(r"v2\.register\s*\(\s*(\w+)\s*,\s*\{\s*prefix\s*:\s*'([^']+)'\s*\}\s*\)\s*;", r"v2.use('\2', \1);", content)

# Replace app.get(...) with app.get(..., (req, res) => ...)
content = re.sub(r"\b(app|v1|v2)\.(get|post|put|delete|patch|options)\s*\(\s*'([^']+)'\s*,\s*async\s*\(\s*request\s*,\s*reply\s*\)\s*=>", r"\1.\2('\3', async (req, res) =>", content)

# reply.send -> res.json
content = re.sub(r"reply\.send\s*\(", "res.json(", content)
content = re.sub(r"reply\.code\s*\(\s*(\d+)\s*\)\.send\s*\(", r"res.status(\1).json(", content)

# Add hooks
content = re.sub(r"v1\.addHook\s*\(\s*'onRequest'\s*,\s*", "v1.use(", content)

# The hook signatures
content = re.sub(r"async\s*\(\s*request\s*:\s*FastifyRequest\s*,\s*reply\s*:\s*FastifyReply\s*\)", "async (req: Request, res: Response, next: NextFunction)", content)

# In hooks, return reply; becomes return; next();
# Actually we can just do a sed on `return reply;`
content = re.sub(r"return\s+reply\s*;", "return;", content)

# Add next() at the end of custom inline middlewares if missing. 
# It's better to manually replace the inline auth middleware since it's tricky.
content = content.replace("v1.use(async (req: Request, res: Response, next: NextFunction) => {\n        const fullPath = req.url.split('?')[0].replace(/\\/$/, '');", 
"v1.use(async (req: Request, res: Response, next: NextFunction) => {\n        const fullPath = req.url.split('?')[0].replace(/\\/$/, '');")

# Replace the specific return; logic with next()
content = content.replace("if (isPublic) return;", "if (isPublic) return next();")
content = content.replace("if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {\n          return;\n        }", "if (authHeader?.startsWith('Bearer ') && verifySessionToken(authHeader.substring(7))) {\n          return next();\n        }")

# The geminiRouter has a specific scope function registration.
# v1.register(
#   async function geminiScope(scope) {
#     scope.addHook('onRequest', providerRateLimiter('gemini'));
#     scope.register(geminiRouter);
#   },
#   { prefix: '/gemini' }
# );
gemini_pattern = r"v1\.register\s*\(\s*async\s+function\s+geminiScope\s*\(\s*scope\s*\)\s*\{\s*scope\.use\(\s*providerRateLimiter\s*\(\s*'gemini'\s*\)\s*\)\s*;\s*scope\.register\s*\(\s*geminiRouter\s*\)\s*;\s*\}\s*,\s*\{\s*prefix\s*:\s*'/gemini'\s*\}\s*\)\s*;"
gemini_replacement = r"const geminiScope = Router();\ngeminiScope.use(providerRateLimiter('gemini'));\ngeminiScope.use('/', geminiRouter);\nv1.use('/gemini', geminiScope);"
content = re.sub(r"v1\.register\s*\(\s*async\s+function\s+geminiScope\s*\(\s*scope\s*\)\s*\{[^}]+\}\s*,\s*\{\s*prefix\s*:\s*'/gemini'\s*\}\s*\)\s*;", gemini_replacement, content)

with open(filepath, 'w', encoding='utf-8') as f:
    f.write(content)
