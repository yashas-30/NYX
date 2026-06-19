const fs = require('fs');
const f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
const lines = f.split('\n');
for(let i=975;i<990;i++) {
  process.stdout.write((i+1)+': '+(lines[i]||'(empty)')+'\n');
}
