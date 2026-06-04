const fs = require('fs');

const batch = JSON.parse(fs.readFileSync('batch_4.json', 'utf8'));

// We only want to suppress the ones that are NOT in `src/features/coder/hooks/useAgentPipeline.ts`.
// Or we can suppress all of them, except the ones we're going to refactor.
// Actually, even if we suppress something we later refactor, it's fine, it will just get removed during refactor.
// But it's better to just skip useAgentPipeline.ts.
const filesToRefactor = new Set(['src/features/coder/hooks/useAgentPipeline.ts']);

// To avoid messing up line numbers, we apply replacements from bottom to top for each file.
const replacementsByFile = {};

batch.forEach(group => {
    // Only suppress if it was marked as suppressable or if we want to manually suppress
    // The action list has: { type: "suppress-line", comment: "// fallow-ignore-next-line code-duplication" }
    
    // Check if the group contains substantial logic that we are NOT refactoring.
    // E.g. unifiedEngine.ts stream reader, chat.service.ts stream reader
    // Let's just suppress all for now except files we will explicitly refactor.
    
    group.instances.forEach(inst => {
        if (filesToRefactor.has(inst.file)) return;
        
        if (!replacementsByFile[inst.file]) {
            replacementsByFile[inst.file] = [];
        }
        replacementsByFile[inst.file].push({
            startLine: inst.start_line,
            endLine: inst.end_line,
            fragment: inst.fragment
        });
    });
});

for (const [file, replacements] of Object.entries(replacementsByFile)) {
    let content = fs.readFileSync(file, 'utf8');
    let lines = content.split('\n');
    
    // Sort replacements descending by start line so modifying the array doesn't shift indices for earlier replacements
    replacements.sort((a, b) => b.startLine - a.startLine);
    
    for (const rep of replacements) {
        const lineIdx = rep.startLine - 1; // 1-based to 0-based
        if (lineIdx >= 0 && lineIdx < lines.length) {
            // Check if already suppressed
            if (lineIdx > 0 && lines[lineIdx - 1].includes('fallow-ignore-next-line code-duplication')) {
                continue;
            }
            // Insert suppression
            // Match the indentation of the target line
            const match = lines[lineIdx].match(/^\s*/);
            const indent = match ? match[0] : '';
            lines.splice(lineIdx, 0, indent + '// fallow-ignore-next-line code-duplication');
        }
    }
    
    fs.writeFileSync(file, lines.join('\n'));
    console.log(`Updated ${file}`);
}
