const fs = require('fs');
const f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
// Add a closing brace between the citation block close and the second toolResults loop
const fixed = f.replace('    } // close citation block\n  } // close first toolResults loop\n\n    for (const tr of toolResults) {',
  '    }\n  }\n\n    for (const tr of toolResults) {');
fs.writeFileSync('apps/web/src/core/agents/agentLoop.ts', fixed);
process.stdout.write('DONE\n');
