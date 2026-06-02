const fs = require('fs');
const path = require('path');

const EXCLUDE_DIRS = ['node_modules', 'dist', 'target', '.git', 'dist-server'];
const ALLOWED_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.json', '.css', '.html', '.md', '.rs', '.toml'];

function walkDir(dir, fileList = []) {
  if (!fs.existsSync(dir)) return fileList;
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat.isDirectory()) {
      if (!EXCLUDE_DIRS.includes(file)) {
        walkDir(filePath, fileList);
      }
    } else {
      if (ALLOWED_EXTS.includes(path.extname(file))) {
        fileList.push(filePath);
      }
    }
  }
  return fileList;
}

const rootFiles = ['package.json', 'tsconfig.json', 'vite.config.ts', 'DESIGN.md', 'tailwind.config.js'];
let files = [];
for (const rf of rootFiles) {
  if (fs.existsSync(rf)) files.push(path.resolve(rf));
}
files = files.concat(walkDir(path.resolve('src')));
files = files.concat(walkDir(path.resolve('src-tauri/src')));
if (fs.existsSync(path.resolve('src-tauri/Cargo.toml'))) files.push(path.resolve('src-tauri/Cargo.toml'));
if (fs.existsSync(path.resolve('src-tauri/tauri.conf.json'))) files.push(path.resolve('src-tauri/tauri.conf.json'));

let output = '# NYX Codebase Export\n\n';
for (const file of files) {
  output += `\n\n## File: ${path.relative(process.cwd(), file)}\n\n\`\`\`\n`;
  try {
    output += fs.readFileSync(file, 'utf8');
  } catch (e) {
    output += '// Error reading file';
  }
  output += '\n```\n';
}

fs.writeFileSync('NYX_Codebase_For_AI_Studio.md', output);
console.log('Successfully created NYX_Codebase_For_AI_Studio.md');
