const fs = require('fs');
const f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
// Just append a } at the end
fs.writeFileSync('apps/web/src/core/agents/agentLoop.ts', f + '\n}');
process.stdout.write('DONE: Added closing brace\n');
