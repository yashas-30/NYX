const fs = require('fs');
let f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
// Remove the extra } added at the end
if(f.endsWith('\n}\n}')) {
  f = f.replace(/\n\}\n\}$/, '\n}');
} else if(f.endsWith('\n}')) {
  f = f.replace(/\n\}$/, '');
}
fs.writeFileSync('apps/web/src/core/agents/agentLoop.ts', f);
process.stdout.write('Reverted extra brace\n');
