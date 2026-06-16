import React, { useState, useEffect } from 'react';
import { PlayIcon as Play, TerminalIcon as Terminal } from '@animateicons/react/lucide';
import { Image as ImageIcon, Loader2 } from 'lucide-react';

interface PythonSandboxProps {
  code: string;
}

export const PythonSandbox: React.FC<PythonSandboxProps> = ({ code }) => {
  const [pyodide, setPyodide] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [loadingStatus, setLoadingStatus] = useState('Loading Python runtime (CDN)...');
  const [output, setOutput] = useState<string[]>([]);
  const [plotUrl, setPlotUrl] = useState<string | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    let active = true;

    const loadPyodideRuntime = async () => {
      try {
        if ((window as any).loadPyodide) {
          initPyodide();
          return;
        }

        // Dynamically inject Pyodide script
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/pyodide.js';
        script.async = true;
        script.onload = () => {
          if (active) initPyodide();
        };
        script.onerror = () => {
          if (active) {
            setLoadingStatus('Failed to load Pyodide script from CDN.');
            setLoading(false);
          }
        };
        document.body.appendChild(script);
      } catch (err: any) {
        if (active) {
          setLoadingStatus(`Error: ${err.message}`);
          setLoading(false);
        }
      }
    };

    const initPyodide = async () => {
      try {
        setLoadingStatus('Initializing WebAssembly runtime...');
        const py = await (window as any).loadPyodide({
          indexURL: 'https://cdn.jsdelivr.net/pyodide/v0.26.1/full/',
        });
        
        setLoadingStatus('Loading packages (numpy, pandas, matplotlib)...');
        await py.loadPackage(['numpy', 'pandas', 'matplotlib']);
        
        if (active) {
          setPyodide(py);
          setLoading(false);
        }
      } catch (err: any) {
        if (active) {
          setLoadingStatus(`Initialization failed: ${err.message}`);
          setLoading(false);
        }
      }
    };

    loadPyodideRuntime();

    return () => {
      active = false;
    };
  }, []);

  const runCode = async () => {
    if (!pyodide || running) return;
    setRunning(true);
    setOutput([]);
    setPlotUrl(null);

    const logs: string[] = [];
    pyodide.setStdout({
      batched: (text: string) => {
        logs.push(text);
        setOutput([...logs]);
      },
    });
    pyodide.setStderr({
      batched: (text: string) => {
        logs.push(`[Error] ${text}`);
        setOutput([...logs]);
      },
    });

    try {
      // Setup Matplotlib mock backend to capture figures
      await pyodide.runPythonAsync(`
import sys
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
plt.close('all')
`);

      // Run user code
      await pyodide.runPythonAsync(code);

      // Check if figure exists and extract it as base64
      const plotData = await pyodide.runPythonAsync(`
import io
import base64
fig = plt.gcf()
if fig.get_axes():
    buf = io.BytesIO()
    plt.savefig(buf, format='png', bbox_inches='tight')
    buf.seek(0)
    img_data = base64.b64encode(buf.read()).decode('utf-8')
    plt.close('all')
    img_data
else:
    None
`);
      if (plotData) {
        setPlotUrl(`data:image/png;base64,${plotData}`);
      }
    } catch (err: any) {
      logs.push(`Runtime Exception: ${err.message}`);
      setOutput([...logs]);
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3 p-8 bg-zinc-950 text-white/50 text-xs">
        <Loader2 className="w-5 h-5 animate-spin text-indigo-400" />
        <p className="font-mono">{loadingStatus}</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-zinc-950 text-white font-mono text-xs overflow-hidden">
      {/* Run Bar */}
      <div className="flex items-center justify-between p-3 border-b border-white/5 bg-white/[0.02]">
        <div className="flex items-center gap-2 text-white/40">
          <Terminal className="w-3.5 h-3.5" />
          <span>Python WASM Console</span>
        </div>
        <button
          onClick={runCode}
          disabled={running}
          className="flex items-center gap-1.5 px-3 py-1 bg-indigo-600 hover:bg-indigo-500 disabled:bg-indigo-800 text-white font-semibold rounded transition-colors cursor-pointer"
        >
          {running ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <Play className="w-3 h-3 fill-current" />
          )}
          <span>Run Code</span>
        </button>
      </div>

      {/* Outputs */}
      <div className="flex-1 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5 overflow-hidden">
        {/* Terminal logs */}
        <div className="flex-1 p-3 overflow-y-auto space-y-1 bg-black/40 min-h-[150px]">
          {output.length === 0 ? (
            <p className="text-white/20">Click 'Run Code' to execute in WASM sandbox...</p>
          ) : (
            output.map((line, idx) => (
              <p
                key={idx}
                className={line.startsWith('[Error]') || line.startsWith('Runtime Exception') ? 'text-red-400' : 'text-zinc-300'}
              >
                {line}
              </p>
            ))
          )}
        </div>

        {/* Matplotlib plot display */}
        {plotUrl && (
          <div className="flex-1 flex flex-col bg-[#141618] overflow-hidden">
            <div className="flex items-center gap-1.5 p-2 border-b border-white/5 text-white/30 text-[10px]">
              <ImageIcon className="w-3 h-3" />
              <span>Plot Output</span>
            </div>
            <div className="flex-1 flex items-center justify-center p-4 overflow-auto">
              <img
                src={plotUrl}
                alt="Matplotlib Figure"
                className="max-w-full max-h-full rounded border border-white/5 shadow-lg object-contain bg-white"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
