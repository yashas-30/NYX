const fs = require('fs');
let code = fs.readFileSync('e:/NYX/server/features/local-models/localModelRunner.ts', 'utf8');

const startRegex = /async _startInternal\([\s\S]*?const port = getLlamaPort\(\);/;
code = code.replace(startRegex, `async _startInternal(
    modelId: string,
    settings?: any,
    optimizationProfile?: OptimizationProfile,
    fallbackStage: 'none' | 'vulkan' | 'cpu' = 'none'
  ): Promise<void> {
    if (
      activeModelId === modelId &&
      activeProcess &&
      activeContextSize >= (settings?.contextSize || 8192)
    ) {
      return;
    }

    const defaultPort = parseInt(process.env.LLAMA_PORT || LOCAL_MODEL_PORT.toString(), 10);
    // Use dynamic port finding starting from default port
    const port = await findAvailablePort(activePort || defaultPort);
    activePort = port;`);

// Since port is now dynamic and we check if the requested port is free, we might bypass the kill logic 
// because if a port is in use, findAvailablePort will just pick port+1.
// So the zombie killing is mostly for our OWN zombies (which we would track if they held activePort).
// The existing `killProcessOnPort(port)` is still fine because `findAvailablePort(activePort)` might
// return `activePort` if we already own it, and we might kill it to restart.

fs.writeFileSync('e:/NYX/server/features/local-models/localModelRunner.ts', code);
console.log('port logic rewritten');
