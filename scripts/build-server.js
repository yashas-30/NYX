import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');

function build() {
  console.log('🚀 Starting optimized server build...');

  // 1. Run esbuild to bundle server.ts
  const esbuildCmd = 'npx esbuild server.ts --bundle --minify --platform=node --target=node22 --format=esm --outfile=dist-server/server.mjs --external:better-sqlite3 --external:onnxruntime-node --external:sharp --external:pino --external:pino-pretty --external:thread-stream';
  console.log(`📦 Running esbuild: ${esbuildCmd}`);
  execSync(esbuildCmd, { cwd: rootDir, stdio: 'inherit' });

  // 2. Ensure python server folder is copied
  const srcPythonDir = path.join(rootDir, 'server/python');
  const destPythonDir = path.join(rootDir, 'dist-server/server/python');
  fs.mkdirSync(destPythonDir, { recursive: true });
  if (fs.existsSync(srcPythonDir)) {
    fs.readdirSync(srcPythonDir).forEach(f => {
      const srcFile = path.join(srcPythonDir, f);
      const destFile = path.join(destPythonDir, f);
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, destFile);
      }
    });
  }
  console.log('🐍 Copied python handlers.');

  // 3. Read root package.json to match exact versions of required dependencies
  const rootPackagePath = path.join(rootDir, 'package.json');
  const rootPackage = JSON.parse(fs.readFileSync(rootPackagePath, 'utf8'));

  const getVer = (name, fallback) => rootPackage.dependencies[name] || fallback;

  // 4. Construct a minimal package.json specifically for the production server
  const minimalPackage = {
    name: 'nyx-server',
    version: rootPackage.version || '3.0.0',
    private: true,
    type: 'module',
    dependencies: {
      'better-sqlite3': getVer('better-sqlite3', '^12.10.0'),
      'onnxruntime-node': '1.14.0', // Explicit version for local GGUF embedding/transformers compatibility
      'sharp': getVer('sharp', '^0.34.5'),
      'pino': getVer('pino', '^10.3.1'),
      'pino-pretty': getVer('pino-pretty', '^13.1.3')
    }
  };

  const distServerDir = path.join(rootDir, 'dist-server');
  fs.mkdirSync(distServerDir, { recursive: true });
  fs.writeFileSync(
    path.join(distServerDir, 'package.json'),
    JSON.stringify(minimalPackage, null, 2),
    'utf8'
  );
  console.log('📝 Generated minimal package.json in dist-server.');

  // 5. Install production-only dependencies in dist-server
  console.log('📥 Installing minimal production dependencies...');
  execSync('npm install --omit=dev --no-audit --no-fund', {
    cwd: distServerDir,
    stdio: 'inherit'
  });
  console.log('✅ Installed minimal dependencies.');

  // 6. Clean up symlinks and unwanted files (.bin, tests, docs) to prevent makensis compile hangs and installer bloat
  const cleanDir = path.join(distServerDir, 'node_modules');
  console.log('🧹 Cleaning up symlinks, tests, and binary directories to prevent NSIS hangs...');

  const rm = (p) => {
    if (fs.existsSync(p)) {
      fs.rmSync(p, { recursive: true, force: true });
    }
  };

  // Remove .bin folder inside node_modules immediately
  rm(path.join(cleanDir, '.bin'));

  const cleanSymlinksAndDirs = (dir) => {
    if (!fs.existsSync(dir)) return;
    fs.readdirSync(dir).forEach(file => {
      const p = path.join(dir, file);
      try {
        const s = fs.lstatSync(p);
        if (s.isSymbolicLink()) {
          fs.unlinkSync(p);
        } else if (s.isDirectory()) {
          if (file === '.bin' || file === 'tests' || file === 'docs' || file === 'test') {
            rm(p);
          } else {
            cleanSymlinksAndDirs(p);
          }
        }
      } catch (e) {
        // Safe catch for permission/file lock issues
      }
    });
  };

  cleanSymlinksAndDirs(cleanDir);
  console.log('✅ Done cleaning directories.');

  // 7. Kept node_modules as node_modules for Electron's standard resolution

  console.log('🎉 Server build finished successfully!');
}

build();
