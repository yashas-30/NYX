const fs = require('fs');
const f = fs.readFileSync('apps/web/src/core/agents/agentLoop.ts','utf8');
const lines = f.split('\n');

// The broken lines are 982-985 (0-indexed: 981-984) — leftover from regex
// Line 982 (0-indexed): "  } as any;"
// Line 983 (0-indexed): "        }"
// Line 984 (0-indexed): "      }"
// Line 985 (0-indexed): "    }"

// Find and remove the exact broken block
// After the citation block's "index++;" and "    }", there should be the second loop
// "    for (const tr of toolResults) {"

// Look for the pattern:
// "    }" (citation block close)
// "  } as any;"  (BROKEN)
// "        }"    (BROKEN)
// "      }"      (BROKEN)
// "    }"        (BROKEN)
// "    for (const tr of toolResults) {"  (second loop)

// We need to remove the 4 lines between the citation block close and the second loop

// Find the citation block close
let idx = f.indexOf('  const seenUrls = new Set<string>();');
let afterBlock = f.indexOf('    for (const tr of toolResults) {', idx);
if (afterBlock >= 0) {
  // Find the actual start of citation block close
  let blockClose = f.lastIndexOf('    }\n', afterBlock);
  // The broken block starts right after the citation block's closing brace
  let brokenStart = blockClose + 6; // after "    }\n"
  let brokenEnd = f.indexOf('    for (const tr of toolResults) {', brokenStart);
  if (brokenEnd >= 0) {
    // Remove everything between the citation block close and the second loop
    let clean = f.substring(0, brokenStart) + f.substring(brokenEnd);
    fs.writeFileSync('apps/web/src/core/agents/agentLoop.ts', clean);
    process.stdout.write('DONE: Cleaned up agentLoop.ts\n');
  } else {
    process.stdout.write('ERROR: Could not find second loop\n');
  }
} else {
  process.stdout.write('ERROR: Could not find citation block\n');
}
