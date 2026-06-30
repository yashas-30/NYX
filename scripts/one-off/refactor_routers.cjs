const fs = require('fs');
const path = require('path');

const featuresDir = path.join(__dirname, 'server', 'features');

function walk(dir) {
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach((file) => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else if (file.endsWith('.router.ts')) {
      results.push(filePath);
    }
  });
  return results;
}

const files = walk(featuresDir);

files.forEach(file => {
  let content = fs.readFileSync(file, 'utf8');

  // 1. Replace import { Router } from 'express' with import { FastifyInstance } from 'fastify'
  content = content.replace(/import\s*\{\s*Router\s*\}\s*from\s*'express';?/, "import { FastifyInstance } from 'fastify';");
  content = content.replace(/import\s*express\s*,\s*\{\s*Router\s*\}\s*from\s*'express';?/, "import { FastifyInstance } from 'fastify';");
  content = content.replace(/import\s+express\s+from\s+'express';?/, "");

  // 2. Export plugin function instead of const router
  // e.g. export const adminRouter = Router(); -> export async function adminRouter(fastify: FastifyInstance) {
  const routerMatch = content.match(/export\s+const\s+(\w+Router)\s*=\s*(?:express\.)?Router\(\s*\);?/);
  let routerName = '';
  if (routerMatch) {
    routerName = routerMatch[1];
    content = content.replace(routerMatch[0], `export async function ${routerName}(fastify: FastifyInstance) {`);
    
    // We need to add a closing brace at the very end of the file.
    // We'll do this after all replacements.
  }

  // 3. Replace router methods (e.g. adminRouter.get -> fastify.get)
  if (routerName) {
    const routerRegex = new RegExp(`${routerName}\\.(get|post|put|delete|patch|use)\\(`, 'g');
    content = content.replace(routerRegex, 'fastify.$1(');
  }

  // 4. Replace (req, res) -> (request, reply)
  content = content.replace(/\(req(uest)?\s*,\s*res(ponse)?(,\s*next)?\)\s*=>/g, '(request, reply) =>');
  content = content.replace(/\(req(uest)?\s*:\s*[^,]+,\s*res(ponse)?\s*:\s*[^)]+\)\s*=>/g, '(request, reply) =>');

  // 5. Replace req.* and res.* with request.* and reply.*
  // To avoid replacing non-express req/res, we'll try to be somewhat specific
  content = content.replace(/\breq\./g, 'request.');
  content = content.replace(/\bres\./g, 'reply.');
  
  // 6. Replace reply.status(X).json(Y) -> reply.code(X).send(Y)
  content = content.replace(/reply\.status\((\d+)\)\.json\(/g, 'reply.code($1).send(');
  // Replace reply.json(Y) -> reply.send(Y)
  content = content.replace(/reply\.json\(/g, 'reply.send(');
  // Replace reply.status(X).send(Y) -> reply.code(X).send(Y)
  content = content.replace(/reply\.status\((\d+)\)\.send\(/g, 'reply.code($1).send(');
  
  // 7. Express reply.setHeader(A, B) -> reply.header(A, B)
  content = content.replace(/reply\.setHeader\(/g, 'reply.header(');
  
  // 8. Express request.body -> request.body as any (to avoid ts errors temporarily, since fastify has strict types)
  content = content.replace(/request\.body(?![\s]*as)/g, '(request.body as any)');
  content = content.replace(/request\.query(?![\s]*as)/g, '(request.query as any)');

  // SSE replacements
  content = content.replace(/reply\.write\(/g, 'reply.raw.write(');
  content = content.replace(/reply\.end\(/g, 'reply.raw.end(');

  if (routerMatch) {
    content += '\n}\n';
  }

  fs.writeFileSync(file, content, 'utf8');
  console.log('Updated ' + file);
});
