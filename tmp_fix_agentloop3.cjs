const fs = require('fs');
let f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');

// Find the second "for (const tr of toolResults)" and add a closing brace before it
f = f.replace('  }\n    for (const tr of toolResults) {\n      if (tr.result.startsWith(\'SCREENSHOT_BASE64:\'))',
  '  }\n  }\n    for (const tr of toolResults) {\n      if (tr.result.startsWith(\'SCREENSHOT_BASE64:\'))');

fs.writeFileSync('apps/web/src/core/agents/agentLoop.ts', f);
process.stdout.write('DONE\n');
