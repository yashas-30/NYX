const fs = require('fs');
const path = require('path');

function walk(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const res = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(res, files);
    } else if (entry.name.endsWith('.ts')) {
      files.push(res);
    }
  }
  return files;
}

const files = walk('apps/server');
// This regex targets things like '.js' that are NOT followed by a closing quote
// But wait, the previous script just added .js before the closing quote.
// The problem was the regex: (['"]\.\.?\/[^'"]+?)(?<!\.(js|ts|json|mjs|jsx|tsx))(['"])
// If the content was "import './path'", it became "import './path.js'".
// BUT if it was already "import './path.js'", it might have become "import './path.js.js'".
// Actually, the `(?<!\.(js|ts|json|mjs|jsx|tsx))` is a lookbehind.
// Let's look at drizzle.config.ts:
// out: './server/db/migrations.js,
// It seems it replaced something and broke the string.

// Let's just revert the files that were "Fixed extension" in the last run.
const fixedFiles = [
  'apps/server/drizzle.config.ts',
  'apps/server/server/features/upload/upload.router.ts',
  'apps/server/server/lib/inferenceOptimizations.ts',
  'apps/server/server/lib/localServer.ts',
  'apps/server/server/lib/modelTools.ts',
  'apps/server/server/lib/pluginRegistry.ts',
  'apps/server/server.ts'
];

// Since I don't have backups, I'll try to undo the .js addition if it's at the end of a relative path before a quote.
// But the safest is to fix the files manually or use a more precise regex.
// Let's first read the damaged files.
