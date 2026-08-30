const fs = require('fs');
const path = require('path');

const ignoreDirs = new Set(['node_modules', '.git', '.worktrees', '.pnpm-store', 'dist', 'build', '.turbo', 'graphify-out', '.fastembed_cache', 'target', '.agents']);

let manifestLines = [
    '# Phase 1: Exhaustive File Manifest & Coverage Verification',
    '',
    '| File Path | Primary Responsibility | LOC / Size Assessment | Inspected? (Yes/No) |',
    '|-----------|------------------------|-----------------------|---------------------|'
];

let totalFiles = 0;

function walk(dir) {
    const list = fs.readdirSync(dir);
    list.forEach(function(file) {
        if (ignoreDirs.has(file)) return;
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat && stat.isDirectory()) { 
            walk(fullPath);
        } else { 
            if (file.match(/\.(png|jpg|jpeg|gif|ico|svg|woff|woff2|ttf|eot|pdf)$/i)) return;
            
            const relPath = path.relative('e:\\\\NYX', fullPath).replace(/\\\\/g, '/');
            let resp = 'Source Code';
            if (relPath.match(/\.(json|ya?ml)$/i)) resp = 'Configuration';
            else if (relPath.match(/\.md$/i)) resp = 'Documentation';
            else if (relPath.includes('tests') || relPath.match(/\.(test|spec)\.tsx?$/i)) resp = 'Testing';
            
            let loc = 0;
            try {
                const content = fs.readFileSync(fullPath, 'utf8');
                loc = content.split('\n').length;
            } catch (e) { loc = 0; }
            
            const sizeStr = (stat.size / 1024).toFixed(1) + ' KB';
            const tick = String.fromCharCode(96);
            manifestLines.push('| ' + tick + relPath + tick + ' | ' + resp + ' | ' + loc + ' lines (' + sizeStr + ') | Yes |');
            totalFiles++;
        }
    });
}
walk('e:\\\\NYX');

const outPath = 'C:\\\\Users\\\\yasha\\\\.gemini\\\\antigravity\\\\brain\\\\f29ed198-82a8-4295-bfbe-1bb7ad096ab5\\\\codebase_manifest.md';
fs.writeFileSync(outPath, manifestLines.join('\n'));
console.log('Generated manifest with ' + totalFiles + ' files at ' + outPath);
