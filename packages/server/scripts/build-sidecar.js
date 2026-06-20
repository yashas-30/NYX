import { build } from 'esbuild';
import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function run() {
  const serverPath = path.resolve(__dirname, '../server.ts');
  const distDir = path.resolve(__dirname, '../dist');
  const outPath = path.join(distDir, 'server.cjs');

  console.log('Building with esbuild...');
  await build({
    entryPoints: [serverPath],
    bundle: true,
    platform: 'node',
    target: 'node18',
    format: 'cjs',
    outfile: outPath,
    // Externalize ONLY native bindings and packages that fail with esbuild/pkg
    external: [
      '@lancedb/lancedb',
      'onnxruntime-node',
      'dockerode', // Dockerode uses modem, sometimes better externalized but it's JS. We'll externalize to be safe
      'keytar'
    ],
    // Alias node:sqlite to a dummy built-in to prevent pkg from crashing on Node 18
    alias: {
      'node:sqlite': 'path'
    }
  });

  console.log('Packaging with pkg...');
  
  // Tauri expects binary named specific to the target architecture, e.g., nyx-server-x86_64-pc-windows-msvc.exe
  const exeName = process.platform === 'win32' 
    ? 'nyx-server-x86_64-pc-windows-msvc.exe' 
    : process.platform === 'darwin'
      ? 'nyx-server-x86_64-apple-darwin'
      : 'nyx-server-x86_64-unknown-linux-gnu';
      
  const outExe = path.join(distDir, exeName);

  execSync(`npx pkg ${outPath} --targets node18-${process.platform === 'win32' ? 'win' : process.platform === 'darwin' ? 'macos' : 'linux'}-x64 --output ${outExe}`, { stdio: 'inherit' });
  
  console.log(`Sidecar build complete! Executable at: ${outExe}`);
}

run().catch(err => {
  console.error('Failed to build sidecar:', err);
  process.exit(1);
});
