import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { codeToHtml } from 'shiki';
import { useTheme } from '@src/shared/context/ThemeContext';
import {
  X,
  Copy,
  Check,
  Download,
  Pencil,
  Sparkles,
  Send,
  FileCode,
  Play,
  Code2,
  MonitorPlay,
  ArrowDown,
} from 'lucide-react';
import { toast } from '@src/shared/components/ui/sonner';

import { invoke } from '@tauri-apps/api/core';

export interface CodeBlockItem {
  code: string;
  language: string;
  filename?: string;
  title?: string;
  messageIndex?: number;
  isStreaming?: boolean;
  activeEditLine?: number;
  activeEditRange?: { startLine: number; endLine: number };
  initialTab?: 'code' | 'preview';
}

export interface CodeBlockPanelProps {
  codeBlock: CodeBlockItem | null;
  isOpen: boolean;
  onClose: () => void;
  onCodeChange?: (oldCode: string, newCode: string, language?: string) => void;
  onAskAiEdit?: (instruction: string) => void;
}

/** Languages that can be rendered directly in an iframe */
const RENDERABLE_LANGS = new Set(['html', 'svg', 'diagram', 'diagram-design']);

/** Languages that can be executed in native runtime or browser sandbox */
const EXECUTABLE_LANGS = new Set([
  'javascript',
  'js',
  'typescript',
  'ts',
  'jsx',
  'tsx',
  'python',
  'py',
  'bash',
  'sh',
  'shell',
  'node',
]);

function buildIframeSrcDoc(code: string, lang: string): string {
  if (!code || !code.trim()) return '';

  const cleanupHook = `
    <script>
      (function() {
        var _activeRAFs = new Set();
        var _origRAF = window.requestAnimationFrame ? window.requestAnimationFrame.bind(window) : null;
        var _origCAF = window.cancelAnimationFrame ? window.cancelAnimationFrame.bind(window) : null;
        if (_origRAF) {
          window.requestAnimationFrame = function(cb) {
            var id;
            id = _origRAF(function(t) {
              _activeRAFs.delete(id);
              cb(t);
            });
            _activeRAFs.add(id);
            return id;
          };
        }
        if (_origCAF) {
          window.cancelAnimationFrame = function(id) {
            _activeRAFs.delete(id);
            _origCAF(id);
          };
        }

        var _activeGlContexts = new Set();
        if (typeof HTMLCanvasElement !== 'undefined' && HTMLCanvasElement.prototype.getContext) {
          var _origGetContext = HTMLCanvasElement.prototype.getContext;
          HTMLCanvasElement.prototype.getContext = function(type) {
            var ctx = _origGetContext.apply(this, arguments);
            if (ctx && (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl')) {
              _activeGlContexts.add(ctx);
            }
            return ctx;
          };
        }

        var _activeAudioContexts = new Set();
        var AudioCtxClass = window.AudioContext || window.webkitAudioContext;
        if (AudioCtxClass) {
          window.AudioContext = function() {
            var a = new AudioCtxClass();
            _activeAudioContexts.add(a);
            return a;
          };
        }

        window.__nyx_teardown = function() {
          if (_origCAF) {
            _activeRAFs.forEach(function(id) {
              try { _origCAF(id); } catch(e) {}
            });
          }
          _activeRAFs.clear();

          _activeGlContexts.forEach(function(gl) {
            try {
              var ext = gl.getExtension('WEBGL_lose_context');
              if (ext && ext.loseContext) ext.loseContext();
            } catch(e) {}
          });
          _activeGlContexts.clear();

          _activeAudioContexts.forEach(function(a) {
            try { a.close(); } catch(e) {}
          });
          _activeAudioContexts.clear();

          var highestId = window.setTimeout(function() {}, 0);
          for (var i = 0; i <= highestId; i++) {
            window.clearTimeout(i);
            window.clearInterval(i);
          }
          if (document.body) {
            document.body.innerHTML = '';
          }
        };

        window.addEventListener('message', function(e) {
          if (e.data === 'NYX_TEARDOWN_PREVIEW') {
            window.__nyx_teardown();
          }
        });
        window.addEventListener('beforeunload', function() {
          window.__nyx_teardown();
        });
        window.addEventListener('pagehide', function() {
          window.__nyx_teardown();
        });
      })();
    </script>
  `;

  if (lang === 'svg') {
    return `<!DOCTYPE html><html><head><meta charset="UTF-8">${cleanupHook}</head><body style="margin:0;background:#000;display:flex;align-items:center;justify-content:center;min-height:100vh">${code}</body></html>`;
  }

  if (/<head\b[^>]*>/i.test(code)) {
    return code.replace(/<head\b[^>]*>/i, `$&${cleanupHook}`);
  } else if (/<html\b[^>]*>/i.test(code)) {
    return code.replace(/<html\b[^>]*>/i, `$&<head>${cleanupHook}</head>`);
  }

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${cleanupHook}</head><body>${code}</body></html>`;
}

/**
 * Execute JS/TS (as JS) in a sandboxed Worker and collect console output.
 * Returns a cleanup function with a 15-second execution timeout guard.
 */
function runInWorker(
  code: string,
  onLine: (line: string, level: 'log' | 'warn' | 'error') => void,
  onDone: () => void
): () => void {
  const workerScript = `
    const _lines = [];
    const _orig = { log: console.log, warn: console.warn, error: console.error };
    ['log','warn','error'].forEach(lvl => {
      console[lvl] = (...args) => {
        postMessage({ type: lvl, text: args.map(a => {
          try { return typeof a === 'object' ? JSON.stringify(a, null, 2) : String(a); }
          catch { return String(a); }
        }).join(' ') });
      };
    });
    try {
      ${code}
    } catch (e) {
      postMessage({ type: 'error', text: String(e) });
    }
    postMessage({ type: '__done__' });
  `;
  const blob = new Blob([workerScript], { type: 'application/javascript' });
  const url = URL.createObjectURL(blob);
  const worker = new Worker(url);

  let cleanedUp = false;
  const timeoutId = setTimeout(() => {
    if (!cleanedUp) {
      onLine('Execution timed out (15s limit reached). Worker terminated.', 'error');
      cleanup();
      onDone();
    }
  }, 15000);

  const cleanup = () => {
    if (cleanedUp) return;
    cleanedUp = true;
    clearTimeout(timeoutId);
    try {
      worker.terminate();
    } catch {}
    try {
      URL.revokeObjectURL(url);
    } catch {}
  };

  worker.onmessage = (e) => {
    const { type, text } = e.data;
    if (type === '__done__') {
      cleanup();
      onDone();
    } else {
      onLine(text, type as 'log' | 'warn' | 'error');
    }
  };

  worker.onerror = (e) => {
    onLine(e.message || 'Worker error', 'error');
    cleanup();
    onDone();
  };

  return cleanup;
}

type Tab = 'code' | 'preview';

/**
 * True Black Minimalist Right-Side Code Panel.
 * Tab 1 — Code: Shiki-highlighted view + edit mode.
 * Tab 2 — Preview: iframe for HTML/SVG, console runner for JS/TS.
 */
export const CodeBlockPanel: React.FC<CodeBlockPanelProps> = ({
  codeBlock,
  isOpen,
  onClose,
  onCodeChange,
  onAskAiEdit,
}) => {
  const { theme } = useTheme();
  const [activeTab, setActiveTab] = useState<Tab>('code');
  const [copied, setCopied] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editedCode, setEditedCode] = useState('');
  const [showAiPrompt, setShowAiPrompt] = useState(false);
  const [aiPrompt, setAiPrompt] = useState('');
  const [highlightedHtml, setHighlightedHtml] = useState('');

  // Preview state
  const [consoleLines, setConsoleLines] = useState<
    { text: string; level: 'log' | 'warn' | 'error' }[]
  >([]);
  const [isRunning, setIsRunning] = useState(false);
  const [hasRun, setHasRun] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const workerCleanupRef = useRef<(() => void) | null>(null);
  const previewTimerRef = useRef<NodeJS.Timeout | null>(null);
  const codeContainerRef = useRef<HTMLDivElement>(null);
  const userScrolledUpInCodeRef = useRef(false);
  const isUserInteractingRef = useRef(false);
  const [showScrollBottomBtn, setShowScrollBottomBtn] = useState(false);
  const prevBlockIdRef = useRef<string>('');
  const [previewDoc, setPreviewDoc] = useState<string>('');
  const [iframeKey, setIframeKey] = useState(0);

  // Sync incoming codeBlock
  useEffect(() => {
    if (codeBlock) {
      const blockId = `${codeBlock.filename || codeBlock.title || ''}_${codeBlock.language || ''}`;
      if (prevBlockIdRef.current !== blockId) {
        prevBlockIdRef.current = blockId;
        setIsEditing(false);
        setShowAiPrompt(false);
        setAiPrompt('');
        setConsoleLines([]);
        setHasRun(false);
        setActiveTab(codeBlock.initialTab || 'code');
        userScrolledUpInCodeRef.current = false;
        setShowScrollBottomBtn(false);
      }
      setEditedCode(codeBlock.code);
    }
  }, [
    codeBlock?.code,
    codeBlock?.filename,
    codeBlock?.title,
    codeBlock?.language,
    codeBlock?.initialTab,
    codeBlock?.isStreaming,
  ]);

  // Real-time auto-scroll when code is streaming or updated
  useLayoutEffect(() => {
    if (activeTab !== 'code' || isEditing) return;
    if (userScrolledUpInCodeRef.current || !codeContainerRef.current) return;

    if (codeBlock?.activeEditLine && codeBlock.activeEditLine > 0) {
      const approxLineHeight = 22; // 13px font with leading-relaxed
      const containerHeight = codeContainerRef.current.clientHeight || 400;
      const targetScroll = Math.max(
        0,
        (codeBlock.activeEditLine - 1) * approxLineHeight - containerHeight / 3
      );
      codeContainerRef.current.scrollTo({
        top: targetScroll,
        behavior: 'smooth',
      });
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = targetScroll;
      }
    } else if (codeBlock?.isStreaming) {
      codeContainerRef.current.scrollTop = codeContainerRef.current.scrollHeight;
      if (lineNumbersRef.current) {
        lineNumbersRef.current.scrollTop = codeContainerRef.current.scrollHeight;
      }
    }
  }, [codeBlock?.code, codeBlock?.activeEditLine, activeTab, isEditing]);

  const handleCodeWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    if (e.deltaY < -2) {
      userScrolledUpInCodeRef.current = true;
      setShowScrollBottomBtn(true);
    } else if (e.deltaY > 2 && codeContainerRef.current) {
      const { scrollHeight, clientHeight, scrollTop } = codeContainerRef.current;
      if (scrollHeight - clientHeight - scrollTop < 50) {
        userScrolledUpInCodeRef.current = false;
        setShowScrollBottomBtn(false);
      }
    }
  }, []);

  const handleCodeScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    if (lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = target.scrollTop;
    }
    const distFromBottom = target.scrollHeight - target.clientHeight - target.scrollTop;
    if (distFromBottom <= 30) {
      userScrolledUpInCodeRef.current = false;
      setShowScrollBottomBtn(false);
    } else if (isUserInteractingRef.current && distFromBottom > 60) {
      userScrolledUpInCodeRef.current = true;
      setShowScrollBottomBtn(true);
    }
  }, []);

  const scrollToCodeBottom = useCallback((smooth = true) => {
    if (!codeContainerRef.current) return;
    if (smooth) {
      codeContainerRef.current.scrollTo({
        top: codeContainerRef.current.scrollHeight,
        behavior: 'smooth',
      });
    } else {
      codeContainerRef.current.scrollTop = codeContainerRef.current.scrollHeight;
    }
    userScrolledUpInCodeRef.current = false;
    setShowScrollBottomBtn(false);
  }, []);

  // Stop and completely dismantle the preview iframe and running scripts
  const stopAndTeardownIframe = useCallback(() => {
    if (iframeRef.current) {
      try {
        iframeRef.current.contentWindow?.postMessage('NYX_TEARDOWN_PREVIEW', '*');
      } catch {}
      try {
        (iframeRef.current.contentWindow as any)?.__nyx_teardown?.();
      } catch {}
      try {
        iframeRef.current.contentWindow?.stop?.();
      } catch {}
      try {
        iframeRef.current.removeAttribute('srcdoc');
        iframeRef.current.src = 'about:blank';
      } catch {}
    }
    setPreviewDoc('');
    setIframeKey((k) => k + 1);
  }, []);

  // Teardown and cancel preview execution when panel is closed or tab changes away from preview
  useEffect(() => {
    if (!isOpen || activeTab !== 'preview') {
      stopAndTeardownIframe();
      if (workerCleanupRef.current) {
        workerCleanupRef.current();
        workerCleanupRef.current = null;
      }
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      setPreviewDoc('');
      setIsRunning(false);
    }
  }, [isOpen, activeTab, stopAndTeardownIframe]);

  // Teardown on unmount
  useEffect(() => {
    return () => {
      stopAndTeardownIframe();
      if (workerCleanupRef.current) {
        workerCleanupRef.current();
        workerCleanupRef.current = null;
      }
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
    };
  }, [stopAndTeardownIframe]);

  const cleanLang = (codeBlock?.language || '').toLowerCase().trim();
  const currentCode = isEditing ? editedCode : codeBlock?.code || '';
  const lineCount = useMemo(() => currentCode.split('\n').length, [currentCode]);
  const charCount = currentCode.length;

  const canRenderIframe = RENDERABLE_LANGS.has(cleanLang);
  const canRunCode = EXECUTABLE_LANGS.has(cleanLang);
  const hasPreview = canRenderIframe || canRunCode;

  // Live preview doc manager: runs when isOpen AND activeTab === 'preview'
  // During active streaming, do NOT render the live preview! Running dynamic scripts/WebGL on partial code thrashes memory.
  useEffect(() => {
    if (!isOpen || activeTab !== 'preview' || !canRenderIframe || codeBlock?.isStreaming) {
      if (previewTimerRef.current) {
        clearTimeout(previewTimerRef.current);
        previewTimerRef.current = null;
      }
      setPreviewDoc('');
      return;
    }

    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    const doc = buildIframeSrcDoc(currentCode, cleanLang);
    setPreviewDoc(doc);
    setIframeKey((k) => k + 1);
  }, [isOpen, activeTab, canRenderIframe, currentCode, cleanLang, codeBlock?.isStreaming]);

  const isTauriEnv = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  const runtimeLabel = useMemo(() => {
    if (canRenderIframe) return 'Sandboxed HTML/SVG Iframe';
    if (cleanLang === 'python' || cleanLang === 'py') {
      return isTauriEnv ? 'Native Python Runtime (Tauri)' : 'Python (Requires Desktop App)';
    }
    if (cleanLang === 'bash' || cleanLang === 'sh' || cleanLang === 'shell') {
      return isTauriEnv ? 'Native Shell Runtime (Tauri)' : 'Shell (Requires Desktop App)';
    }
    return isTauriEnv ? 'Node / JS Sandbox' : 'Browser Web Worker Sandbox';
  }, [canRenderIframe, cleanLang, isTauriEnv]);

  // Shiki highlighting (debounced during streaming to keep UI at maximum framerate)
  const escapeHtml = useCallback(
    (text: string) =>
      text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;'),
    []
  );

  useEffect(() => {
    if (!codeBlock?.code) {
      setHighlightedHtml('');
      return;
    }
    if (codeBlock.isStreaming) {
      // During active streaming, skip heavy Shiki AST parsing to conserve memory & CPU.
      // Fast plain preformatted text is rendered instead.
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      codeToHtml(codeBlock.code, {
        lang: cleanLang || 'text',
        theme: theme === 'dark' ? 'github-dark' : 'github-light',
      })
        .then((out) => {
          if (!cancelled) setHighlightedHtml(out);
        })
        .catch(() => {
          if (!cancelled)
            setHighlightedHtml(`<pre><code>${escapeHtml(codeBlock.code)}</code></pre>`);
        });
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [codeBlock?.code, codeBlock?.isStreaming, cleanLang, theme, escapeHtml]);

  // Actions
  const handleCopy = useCallback(() => {
    if (!currentCode) return;
    navigator.clipboard.writeText(currentCode).then(() => {
      setCopied(true);
      toast.success('Code copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    });
  }, [currentCode]);

  const handleDownload = useCallback(() => {
    if (!currentCode) return;
    const extMap: Record<string, string> = {
      javascript: 'js',
      typescript: 'ts',
      jsx: 'jsx',
      tsx: 'tsx',
      python: 'py',
      py: 'py',
      rust: 'rs',
      go: 'go',
      html: 'html',
      css: 'css',
      json: 'json',
      sql: 'sql',
      bash: 'sh',
      shell: 'sh',
      markdown: 'md',
      md: 'md',
      svg: 'svg',
    };
    const ext = extMap[cleanLang] || cleanLang || 'txt';
    const fname = codeBlock?.filename || `code-snippet-${Date.now()}.${ext}`;
    const blob = new Blob([currentCode], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fname;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Downloaded ${fname}`);
  }, [currentCode, cleanLang, codeBlock?.filename]);

  const handleSaveEdit = useCallback(() => {
    if (!codeBlock) return;
    if (onCodeChange && editedCode !== codeBlock.code) {
      onCodeChange(codeBlock.code, editedCode, codeBlock.language);
      toast.success('Code updated in chat');
    }
    setIsEditing(false);
  }, [codeBlock, editedCode, onCodeChange]);

  const handleCancelEdit = useCallback(() => {
    if (codeBlock) setEditedCode(codeBlock.code);
    setIsEditing(false);
  }, [codeBlock]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const ta = textareaRef.current;
        if (!ta) return;
        const s = ta.selectionStart,
          en = ta.selectionEnd;
        const val = ta.value;
        setEditedCode(val.substring(0, s) + '  ' + val.substring(en));
        setTimeout(() => {
          ta.selectionStart = ta.selectionEnd = s + 2;
        }, 0);
      } else if (e.key === 'Escape') {
        handleCancelEdit();
      }
    },
    [handleCancelEdit]
  );

  const handleEditorScroll = useCallback(() => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  }, []);

  const handleAskAiSubmit = useCallback(
    (e?: React.FormEvent) => {
      e?.preventDefault();
      if (!aiPrompt.trim() || !codeBlock || !onAskAiEdit) return;
      onAskAiEdit(
        `[CODE SNIPPET TO EDIT (${codeBlock.language || 'code'})]:\n\`\`\`${codeBlock.language || ''}\n${currentCode}\n\`\`\`\n\n[USER EDIT REQUEST]:\n${aiPrompt.trim()}`
      );
      toast.success('Edit request sent to AI');
      setAiPrompt('');
      setShowAiPrompt(false);
    },
    [aiPrompt, codeBlock, currentCode, onAskAiEdit]
  );

  const handleRunPreview = useCallback(async () => {
    if (!canRunCode || isRunning) return;
    workerCleanupRef.current?.();
    setConsoleLines([]);
    setIsRunning(true);
    setHasRun(true);

    const isPython = cleanLang === 'python' || cleanLang === 'py';
    const isShell = cleanLang === 'bash' || cleanLang === 'sh' || cleanLang === 'shell';
    const isJs = !isPython && !isShell;

    // Desktop Native Execution (Tauri) for Python or Shell
    if (isTauriEnv && (isPython || isShell)) {
      try {
        if (isPython) {
          const tempPath = '.nyx_temp_exec.py';
          await invoke('fs_write_file', { path: tempPath, content: currentCode, overwrite: true });
          const res = await invoke<{ stdout: string; stderr: string; exitCode: number }>(
            'execute_command',
            {
              command: `python ${tempPath}`,
              cwd: '.',
            }
          );
          if (res.stdout) {
            res.stdout.split('\n').forEach((line) => {
              if (line) setConsoleLines((prev) => [...prev, { text: line, level: 'log' }]);
            });
          }
          if (res.stderr) {
            res.stderr.split('\n').forEach((line) => {
              if (line)
                setConsoleLines((prev) => [
                  ...prev,
                  { text: line, level: res.exitCode === 0 ? 'warn' : 'error' },
                ]);
            });
          }
          if (!res.stdout && !res.stderr) {
            setConsoleLines([
              {
                text: `Process exited with code ${res.exitCode}`,
                level: res.exitCode === 0 ? 'log' : 'warn',
              },
            ]);
          }
        } else if (isShell) {
          const res = await invoke<{ stdout: string; stderr: string; exitCode: number }>(
            'execute_command',
            {
              command: currentCode.trim().split('\n')[0] || 'echo Done',
              cwd: '.',
            }
          );
          if (res.stdout) {
            res.stdout.split('\n').forEach((line) => {
              if (line) setConsoleLines((prev) => [...prev, { text: line, level: 'log' }]);
            });
          }
          if (res.stderr) {
            res.stderr.split('\n').forEach((line) => {
              if (line) setConsoleLines((prev) => [...prev, { text: line, level: 'error' }]);
            });
          }
        }
      } catch (err: any) {
        setConsoleLines([
          { text: `Execution error: ${err?.message || String(err)}`, level: 'error' },
        ]);
      } finally {
        setIsRunning(false);
      }
      return;
    }

    if (!isTauriEnv && (isPython || isShell)) {
      setConsoleLines([
        {
          text: `Running ${cleanLang.toUpperCase()} requires the NYX desktop app native environment.`,
          level: 'warn',
        },
        {
          text: `In web mode, JavaScript/TypeScript execution is supported via Web Worker sandbox.`,
          level: 'log',
        },
      ]);
      setIsRunning(false);
      return;
    }

    // JavaScript / TypeScript Execution via Worker
    const cleanup = runInWorker(
      currentCode,
      (text, level) => setConsoleLines((prev) => [...prev, { text, level }]),
      () => setIsRunning(false)
    );
    workerCleanupRef.current = cleanup;
  }, [canRunCode, isRunning, cleanLang, isTauriEnv, currentCode]);

  const handlePanelClose = useCallback(() => {
    stopAndTeardownIframe();
    if (workerCleanupRef.current) {
      workerCleanupRef.current();
      workerCleanupRef.current = null;
    }
    if (previewTimerRef.current) {
      clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }
    setPreviewDoc('');
    setIsRunning(false);
    onClose();
  }, [onClose, stopAndTeardownIframe]);

  return (
    <AnimatePresence>
      {isOpen && codeBlock && (
        <motion.aside
          initial={{ x: '100%', opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: '100%', opacity: 0 }}
          transition={{ type: 'spring', stiffness: 350, damping: 32 }}
          className="fixed md:absolute top-0 right-0 bottom-0 z-40 w-full md:w-1/2 md:max-w-[50%] bg-[#000000] border-l border-white/10 flex flex-col shadow-2xl overflow-hidden font-sans"
        >
          {/* Header */}
          <div className="h-13 bg-[#09090b] border-b border-white/10 px-4 flex items-center justify-between shrink-0 gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-md bg-white/5 border border-white/10 flex items-center justify-center shrink-0 text-zinc-300">
                <FileCode className="w-4 h-4" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-xs text-zinc-100 truncate tracking-tight">
                    {codeBlock.filename || codeBlock.title || 'Code Block'}
                  </span>
                  <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[10px] font-mono text-zinc-400 font-bold uppercase shrink-0">
                    {cleanLang || 'code'}
                  </span>
                  {codeBlock.isStreaming && (
                    <span className="flex items-center gap-1 text-[10px] font-mono text-primary font-medium shrink-0 animate-pulse">
                      <span className="w-1.5 h-1.5 rounded-full bg-primary" />
                      writing…
                    </span>
                  )}
                </div>
                <span className="text-[10px] font-mono text-zinc-500">
                  {lineCount} lines · {charCount} chars
                </span>
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={handleCopy}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Copy Code"
              >
                {copied ? (
                  <Check className="w-4 h-4 text-emerald-400" />
                ) : (
                  <Copy className="w-4 h-4" />
                )}
              </button>
              <button
                onClick={handleDownload}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Download File"
              >
                <Download className="w-4 h-4" />
              </button>
              <button
                onClick={() => setIsEditing((v) => !v)}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${isEditing ? 'bg-white/15 text-zinc-100 border border-white/20' : 'hover:bg-white/10 text-zinc-400 hover:text-zinc-100'}`}
                title={isEditing ? 'View Highlighted' : 'Edit Code'}
              >
                <Pencil className="w-4 h-4" />
              </button>
              <button
                onClick={() => setShowAiPrompt((v) => !v)}
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${showAiPrompt ? 'bg-primary/20 text-primary border border-primary/30' : 'hover:bg-white/10 text-zinc-400 hover:text-zinc-100'}`}
                title="Ask AI to Edit"
              >
                <Sparkles className="w-4 h-4" />
              </button>
              <div className="w-[1px] h-4 bg-white/10 mx-1" />
              <button
                onClick={handlePanelClose}
                className="p-1.5 rounded-md hover:bg-white/10 text-zinc-400 hover:text-zinc-100 transition-colors cursor-pointer"
                title="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab bar — Code | Preview (only shown when preview is available) */}
          {hasPreview && (
            <div className="flex items-center gap-0 border-b border-white/10 bg-[#09090b] shrink-0">
              <button
                onClick={() => setActiveTab('code')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${activeTab === 'code' ? 'border-primary text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                <Code2 className="w-3.5 h-3.5" />
                Code
              </button>
              <button
                onClick={() => setActiveTab('preview')}
                className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-colors border-b-2 ${activeTab === 'preview' ? 'border-primary text-zinc-100' : 'border-transparent text-zinc-500 hover:text-zinc-300'}`}
              >
                <MonitorPlay className="w-3.5 h-3.5" />
                Live Preview
              </button>
            </div>
          )}

          {/* Ask AI prompt drawer */}
          <AnimatePresence>
            {showAiPrompt && (
              <motion.form
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                onSubmit={handleAskAiSubmit}
                className="bg-[#121214] border-b border-white/10 p-3 flex items-center gap-2 shrink-0 overflow-hidden"
              >
                <Sparkles className="w-4 h-4 text-primary shrink-0 ml-1" />
                <input
                  type="text"
                  value={aiPrompt}
                  onChange={(e) => setAiPrompt(e.target.value)}
                  placeholder="Ask AI to edit, refactor, or fix this code…"
                  className="flex-1 bg-black/40 border border-white/10 rounded-md px-3 py-1.5 text-xs text-zinc-200 placeholder:text-zinc-600 focus:outline-none focus:border-primary/50"
                  autoFocus
                />
                <button
                  type="submit"
                  disabled={!aiPrompt.trim()}
                  className="px-3 py-1.5 rounded-md bg-primary hover:bg-primary/90 text-primary-foreground text-xs font-semibold flex items-center gap-1 cursor-pointer disabled:opacity-50 transition-all"
                >
                  <Send className="w-3 h-3" />
                  <span>Submit</span>
                </button>
              </motion.form>
            )}
          </AnimatePresence>

          {/* Edit mode action banner */}
          {isEditing && (
            <div className="bg-[#121214] border-b border-white/10 px-4 py-2 flex items-center justify-between shrink-0 text-xs">
              <span className="font-mono text-[11px] text-zinc-400">
                Tab = 2 spaces · Esc = Cancel
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 border border-white/10 text-zinc-300 text-[11px] font-medium transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveEdit}
                  className="px-3 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-[11px] font-semibold transition-colors cursor-pointer shadow-sm"
                >
                  Save Edits
                </button>
              </div>
            </div>
          )}

          {/* Body */}
          <div className="flex-1 min-h-0 relative overflow-hidden bg-[#000000]">
            {/* ── CODE TAB ── */}
            {activeTab === 'code' &&
              (isEditing ? (
                <div className="w-full h-full flex overflow-hidden font-mono text-[13px] leading-relaxed">
                  <div
                    ref={lineNumbersRef}
                    className="w-12 bg-[#09090b] border-r border-white/10 py-3 text-right pr-2.5 text-zinc-600 select-none overflow-hidden shrink-0 font-mono text-[12px]"
                  >
                    {Array.from({ length: lineCount }).map((_, i) => (
                      <div key={i} className="leading-relaxed">
                        {i + 1}
                      </div>
                    ))}
                  </div>
                  <textarea
                    ref={textareaRef}
                    value={editedCode}
                    onChange={(e) => setEditedCode(e.target.value)}
                    onKeyDown={handleKeyDown}
                    onScroll={handleEditorScroll}
                    spellCheck={false}
                    autoCapitalize="off"
                    autoComplete="off"
                    className="flex-1 h-full p-3 bg-transparent text-zinc-100 font-mono text-[13px] leading-relaxed resize-none focus:outline-none overflow-auto whitespace-pre selection:bg-primary/30"
                  />
                </div>
              ) : (
                <div className="w-full h-full flex overflow-hidden font-mono text-[13px] leading-relaxed">
                  {/* Line numbers gutter */}
                  <div
                    ref={lineNumbersRef}
                    className="w-12 bg-[#09090b] border-r border-white/10 py-4 text-right pr-2.5 text-zinc-600 select-none overflow-hidden shrink-0 font-mono text-[12px]"
                  >
                    {Array.from({ length: lineCount }).map((_, i) => {
                      const lineNum = i + 1;
                      const isBeingEdited = codeBlock?.activeEditRange
                        ? lineNum >= codeBlock.activeEditRange.startLine &&
                          lineNum <= codeBlock.activeEditRange.endLine
                        : lineNum === codeBlock?.activeEditLine;
                      return (
                        <div
                          key={i}
                          className={`leading-relaxed transition-colors ${
                            isBeingEdited
                              ? 'text-primary font-bold bg-primary/20 -mr-2.5 pr-2.5 rounded-l'
                              : ''
                          }`}
                        >
                          {lineNum}
                        </div>
                      );
                    })}
                  </div>

                  {/* Code viewport */}
                  <div
                    ref={codeContainerRef}
                    onWheel={handleCodeWheel}
                    onTouchStart={() => {
                      isUserInteractingRef.current = true;
                    }}
                    onTouchEnd={() => {
                      isUserInteractingRef.current = false;
                    }}
                    onScroll={handleCodeScroll}
                    className="flex-1 h-full overflow-auto p-4 font-mono text-[13px] leading-relaxed text-zinc-200 selection:bg-primary/30 relative"
                  >
                    {highlightedHtml && !codeBlock.isStreaming ? (
                      <div
                        className="[&_pre]:!bg-transparent [&_pre]:!p-0 [&_code]:!font-mono [&_code]:!text-[13px] [&_code]:!leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: highlightedHtml }}
                      />
                    ) : (
                      <pre className="font-mono text-[13px] leading-relaxed whitespace-pre">
                        {currentCode.split('\n').map((line, idx) => {
                          const lineNum = idx + 1;
                          const isBeingEdited = codeBlock?.activeEditRange
                            ? lineNum >= codeBlock.activeEditRange.startLine &&
                              lineNum <= codeBlock.activeEditRange.endLine
                            : lineNum === codeBlock?.activeEditLine;
                          return (
                            <div
                              key={idx}
                              id={`code-line-${lineNum}`}
                              className={`transition-colors rounded-sm px-1.5 -mx-1.5 ${
                                isBeingEdited
                                  ? 'bg-primary/20 text-white border-l-2 border-primary font-medium'
                                  : ''
                              }`}
                            >
                              {line || ' '}
                            </div>
                          );
                        })}
                      </pre>
                    )}

                    {/* Floating jump to bottom button when user scrolled up during generation */}
                    <AnimatePresence>
                      {showScrollBottomBtn && (
                        <motion.button
                          initial={{ opacity: 0, y: 10, scale: 0.9 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.9 }}
                          onClick={() => scrollToCodeBottom(true)}
                          className="sticky bottom-2 float-right mr-2 z-20 flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-[#18181b]/95 hover:bg-[#27272a] text-zinc-200 hover:text-white text-xs border border-white/15 shadow-xl backdrop-blur-md cursor-pointer transition-all"
                        >
                          <ArrowDown className="w-3.5 h-3.5 text-primary" />
                          <span>Jump to latest</span>
                          {codeBlock.isStreaming && (
                            <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                          )}
                        </motion.button>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              ))}

            {/* ── PREVIEW TAB ── */}
            {isOpen && activeTab === 'preview' && (
              <div className="w-full h-full flex flex-col">
                {canRenderIframe ? (
                  // HTML / SVG / diagram → sandboxed iframe
                  previewDoc && !codeBlock?.isStreaming ? (
                    <iframe
                      key={iframeKey}
                      ref={iframeRef}
                      srcDoc={previewDoc}
                      sandbox="allow-scripts"
                      className="flex-1 w-full border-0 bg-white"
                      title="Live Preview"
                    />
                  ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 p-8 text-center bg-[#000000]">
                      {codeBlock?.isStreaming ? (
                        <>
                          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
                          <p className="text-xs font-mono text-zinc-300 font-semibold">
                            Preparing live preview…
                          </p>
                          <p className="text-[11px] font-mono text-zinc-500 max-w-sm">
                            Live preview will render automatically once generation is complete.
                          </p>
                        </>
                      ) : (
                        <span className="text-zinc-500 text-xs font-mono">
                          No preview available
                        </span>
                      )}
                    </div>
                  )
                ) : canRunCode ? (
                  // Multi-language console runner (Python, Node, Shell, JS)
                  <div className="flex flex-col h-full">
                    {/* Run toolbar */}
                    <div className="flex items-center gap-2 px-4 py-2.5 bg-[#09090b] border-b border-white/10 shrink-0">
                      <button
                        onClick={handleRunPreview}
                        disabled={isRunning}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-600 text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50"
                      >
                        <Play className="w-3.5 h-3.5" />
                        {isRunning ? 'Running…' : 'Run'}
                      </button>
                      {hasRun && (
                        <button
                          onClick={() => setConsoleLines([])}
                          className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer px-2 py-1 rounded hover:bg-white/5"
                        >
                          Clear
                        </button>
                      )}
                      <span className="text-[10px] font-mono text-zinc-500">{runtimeLabel}</span>
                    </div>

                    {/* Console output */}
                    <div className="flex-1 overflow-auto p-4 font-mono text-[12px] leading-relaxed bg-[#000000]">
                      {!hasRun && (
                        <span className="text-zinc-600 text-[11px]">
                          Press Run to execute the code…
                        </span>
                      )}
                      {consoleLines.map((line, i) => (
                        <div
                          key={i}
                          className={`whitespace-pre-wrap break-all ${
                            line.level === 'error'
                              ? 'text-red-400'
                              : line.level === 'warn'
                                ? 'text-amber-400'
                                : 'text-zinc-200'
                          }`}
                        >
                          <span
                            className={`mr-2 text-[10px] ${
                              line.level === 'error'
                                ? 'text-red-600'
                                : line.level === 'warn'
                                  ? 'text-amber-600'
                                  : 'text-zinc-600'
                            }`}
                          >
                            {line.level === 'error' ? '✖' : line.level === 'warn' ? '⚠' : '›'}
                          </span>
                          {line.text}
                        </div>
                      ))}
                      {isRunning && (
                        <div className="text-zinc-500 text-[11px] animate-pulse mt-1">Running…</div>
                      )}
                    </div>
                  </div>
                ) : null}
              </div>
            )}
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
};
