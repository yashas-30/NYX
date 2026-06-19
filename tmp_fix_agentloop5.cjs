const fs = require('fs');
let f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
const oldText = '  }\n    for (const tr of toolResults) {';
const newText = `  }\n  }\n    for (const tr of toolResults) {`;
if(f.includes(oldText)) {
  f = f.replace(oldText, newText);
  fs.writeFileSync('apps/web/src/core/agents/agentLoop.ts', f);
  process.stdout.write('DONE: Replaced\n');
} else {
  // Print what's actually there for debugging
  const idx = f.indexOf('for (const tr of toolResults)');
  process.stdout.write('NOT FOUND, context: ' + f.substring(idx-20, idx+60) + '\n');
}
