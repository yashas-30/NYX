const fs = require('fs');
const path = require('path');

// 1. Bust HTML Cache for main.tsx (Disabled for Vite dev stability)
// try {
//   let html = fs.readFileSync('index.html', 'utf8');
//   html = html.replace(/src="\/src\/main\.tsx(\?t=\d+)?"/, 'src="/src/main.tsx?t=' + Date.now() + '"');
//   fs.writeFileSync('index.html', html);
//   console.log('[pre-dev] Cache busted index.html');
// } catch (e) {
//   console.error('[pre-dev] Error updating index.html:', e.message);
// }

// 2. Physically nuke Tauri WebView2 cache (safely, non-blocking)
try {
  const localAppData = process.env.LOCALAPPDATA;
  if (localAppData) {
    const cacheDir = path.join(localAppData, 'com.nyx.desktop', 'EBWebView');
    if (fs.existsSync(cacheDir)) {
      try {
        fs.rmSync(cacheDir, { recursive: true, force: true, maxRetries: 1, retryDelay: 50 });
        console.log('[pre-dev] Purged Tauri EBWebView cache');
      } catch (rmErr) {
        // Non-fatal if locked by running webview instance
      }
    }
  }
} catch (e) {
  // Silent fallback
}

// 3. Launch NYX Debug Console in a new terminal window
try {
  const { spawn, exec } = require('child_process');
  if (process.platform === 'win32') {
    // Spawns a new visible command prompt window on Windows, avoiding PowerShell syntax errors
    const child = spawn('cmd.exe', ['/c', 'start', 'cmd.exe', '/k', 'title NYX Debug Console & node scripts/debug-console.cjs'], { 
      detached: true, 
      stdio: 'ignore' 
    });
    child.unref();
    console.log('[pre-dev] Spawned NYX Debug Console');
  } else if (process.platform === 'darwin') {
    // macOS
    exec('osascript -e \'tell application "Terminal" to do script "cd ' + process.cwd() + ' && node scripts/debug-console.cjs"\'');
  } else {
    // Linux (GNOME terminal as fallback)
    exec('gnome-terminal -- node scripts/debug-console.cjs');
  }
} catch (e) {
  console.error('[pre-dev] Error launching Debug Console:', e.message);
}

