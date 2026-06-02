const fs = require('fs');
let code = fs.readFileSync('e:/NYX/server/features/local-models/localModelRunner.ts', 'utf8');

const regex = /getFreeVram\(\): Promise<number> {[\s\S]*?getOptimalVulkanDevice\(\):/;

const newVram = `getFreeVram(): Promise<number> {
    return new Promise(async (resolve) => {
      if (process.platform === 'darwin') {
        // macOS Unified Memory
        const total = os.totalmem();
        const free = os.freemem();
        resolve(Math.max(0, free - 1024 * 1024 * 1024)); // Reserve 1GB for OS
        return;
      }

      const commands = [
        'nvidia-smi --query-gpu=memory.free --format=csv,noheader,nounits',
        '"C:\\\\Windows\\\\System32\\\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits',
        '"C:\\\\Program Files\\\\NVIDIA Corporation\\\\NVSMI\\\\nvidia-smi.exe" --query-gpu=memory.free --format=csv,noheader,nounits',
        'rocm-smi --showmeminfo vram --json' // AMD ROCm fallback
      ];

      const tryExec = (idx: number) => {
        if (idx >= commands.length) {
           // Fallback to generic system free memory for integrated graphics
           resolve(Math.max(0, os.freemem() - 1024 * 1024 * 1024));
           return;
        }
        exec(commands[idx], (error: any, stdout: string) => {
          if (error) {
            tryExec(idx + 1);
          } else {
             if (commands[idx].includes('rocm')) {
                try {
                   const data = JSON.parse(stdout);
                   // Extract VRAM from first GPU
                   const key = Object.keys(data)[0];
                   const vram = parseInt(data[key]?.['VRAM Total Memory (B)'] || '0', 10) - parseInt(data[key]?.['VRAM Total Used Memory (B)'] || '0', 10);
                   resolve(vram > 0 ? vram : 0);
                } catch { tryExec(idx + 1); }
             } else {
                const mem = parseInt(stdout.trim(), 10);
                resolve(isNaN(mem) ? 0 : mem * 1024 * 1024);
             }
          }
        });
      };

      tryExec(0);
    });
  },

  getOptimalVulkanDevice():`;

code = code.replace(regex, newVram);
fs.writeFileSync('e:/NYX/server/features/local-models/localModelRunner.ts', code);
console.log('getFreeVram rewritten');
