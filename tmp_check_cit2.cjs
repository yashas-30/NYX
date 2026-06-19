const fs = require('fs');

// Check what's in shared types
const shared = fs.readFileSync('packages/shared/src/types.ts','utf8');
const idx = shared.indexOf('citations');
if(idx >= 0) {
  process.stdout.write('SHARED types.ts has citations at position ' + idx + '\n');
  process.stdout.write('Context: ' + shared.substring(idx, idx+200) + '\n');
} else {
  process.stdout.write('SHARED types.ts does NOT have citations\n');
}

// Check what's in useChatPipeline for the Citation interface
const pipe = fs.readFileSync('apps/web/src/features/chat/hooks/useChatPipeline.ts','utf8');
const ci = pipe.indexOf('interface Citation');
if(ci >= 0) {
  process.stdout.write('\nPIPELINE Citation interface:\n' + pipe.substring(ci, ci+200) + '\n');
}
