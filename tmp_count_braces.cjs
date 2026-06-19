const fs = require('fs');
const f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
const lines = f.split('\n');

// Find the runAgentLoop function start and track brace depth
let inFunc = false;
let depth = 0;
let funcStart = 0;
for(let i=0;i<lines.length;i++) {
  const l = lines[i];
  if(l.includes('async function* runAgentLoop')) {
    inFunc = true;
    funcStart = i;
    process.stdout.write('Function starts at line '+(i+1)+'\n');
  }
  if(inFunc) {
    // Count openings and closings
    const opens = (l.match(/\{/g)||[]).length;
    const closes = (l.match(/\}/g)||[]).length;
    if(opens > 0 || closes > 0) {
      depth += opens - closes;
      if(depth === 0 && i > funcStart) {
        process.stdout.write('Function ends at line '+(i+1)+', depth 0\n');
        break;
      }
    }
  }
}
process.stdout.write('End of file depth: '+depth+'\n');
process.stdout.write('Total lines: '+lines.length+'\n');
