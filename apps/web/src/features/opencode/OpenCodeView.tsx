/**
 * @file src/views/OpenCodeView.tsx
 * @description Dedicated OpenCode CLI page hosting the authentic OpenCode interactive terminal interface.
 * Pixel-perfect ConPTY rendering, zero padding to prevent column wrapping, convertEol: false, and alternate screen buffer.
 */

import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';

export const OpenCodeView: React.FC = () => {
  const terminalRef = useRef<HTMLDivElement>(null);
  const xtermInstance = useRef<XTerm | null>(null);
  const fitAddonInstance = useRef<FitAddon | null>(null);
  const currentSessionId = useRef<string>('');
  const resizeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    let unlistenData: (() => void) | null = null;
    let unlistenExit: (() => void) | null = null;
    let active = true;

    // ConPTY emits raw VT/ANSI sequences. convertEol MUST BE false so that
    // vertical cursor positioning in TUI applications (like Bubbletea) does not force
    // line-resets back to column 0.
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'block',
      fontFamily: "'Cascadia Code', 'Consolas', 'JetBrains Mono', 'Fira Code', monospace",
      fontSize: 14,
      lineHeight: 1.0, // Strict 1.0 line-height ensures box-drawing characters connect seamlessly
      letterSpacing: 0,
      convertEol: false, // Critical: ConPTY handles carriage returns; true breaks TUI layout
      scrollback: 0, // Full-screen TUI (alternate buffer) mode: eliminates reflow ghosting on resize
      theme: {
        background: '#000000',
        foreground: '#f4f4f5',
        cursor: '#ffffff',
        cursorAccent: '#000000',
        selectionBackground: 'rgba(255, 255, 255, 0.25)',
        black: '#09090b',
        red: '#ef4444',
        green: '#22c55e',
        yellow: '#eab308',
        blue: '#3b82f6',
        magenta: '#a855f7',
        cyan: '#06b6d4',
        white: '#f4f4f5',
        brightBlack: '#71717a',
        brightRed: '#f87171',
        brightGreen: '#4ade80',
        brightYellow: '#fde047',
        brightBlue: '#60a5fa',
        brightMagenta: '#c084fc',
        brightCyan: '#22d3ee',
        brightWhite: '#ffffff',
      },
      allowTransparency: false,
    });

    const fitAddon = new FitAddon();
    const webLinksAddon = new WebLinksAddon();

    term.loadAddon(fitAddon);
    term.loadAddon(webLinksAddon);

    if (terminalRef.current) {
      term.open(terminalRef.current);
    }

    xtermInstance.current = term;
    fitAddonInstance.current = fitAddon;

    const sessionId = `opencode-${Date.now()}`;
    currentSessionId.current = sessionId;

    // Send keystrokes directly to OpenCode PTY
    const dataDisposable = term.onData((data) => {
      if (currentSessionId.current) {
        invoke('pty_write', {
          id: currentSessionId.current,
          data,
        }).catch(() => {});
      }
    });

    // Debounced resize observer that guards against zero-dimensions during tab switches
    const resizeObserver = new ResizeObserver(() => {
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      resizeTimeoutRef.current = setTimeout(() => {
        if (!terminalRef.current || !active) return;
        const width = terminalRef.current.clientWidth;
        const height = terminalRef.current.clientHeight;
        if (width < 100 || height < 100) return;

        try {
          fitAddon.fit();
          if (currentSessionId.current && term.rows >= 10 && term.cols >= 20) {
            invoke('pty_resize', {
              id: currentSessionId.current,
              rows: term.rows,
              cols: term.cols,
            }).catch(() => {});
          }
        } catch {}
      }, 50);
    });

    if (terminalRef.current) {
      resizeObserver.observe(terminalRef.current);
    }

    // Initialize session with pre-registered listeners to guarantee zero dropped bytes
    const initSession = async () => {
      // 1. Attach listeners BEFORE spawning so initial screen clear & banner are never missed
      unlistenData = await listen<string>(`pty-data-${sessionId}`, (event) => {
        if (active && term) {
          term.write(event.payload);
        }
      });

      unlistenExit = await listen(`pty-exit-${sessionId}`, () => {
        if (active && term) {
          term.write('\r\n\x1b[90m[OpenCode process exited]\x1b[0m\r\n');
        }
      });

      // 2. Allow DOM to complete layout before measuring exact dimensions
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

      try {
        fitAddon.fit();
      } catch {}

      const rows = term.rows > 10 ? term.rows : 32;
      const cols = term.cols > 20 ? term.cols : 120;

      // 3. Spawn OpenCode CLI natively
      try {
        await invoke('opencode_spawn_session', {
          sessionId,
          cwd: null,
          args: [],
          rows,
          cols,
        });
        if (active) {
          term.focus();
        }
      } catch (err: any) {
        if (active) {
          term.write(`\r\n\x1b[31m[Failed to launch OpenCode]: ${err}\x1b[0m\r\n`);
        }
      }
    };

    initSession();

    return () => {
      active = false;
      if (resizeTimeoutRef.current) clearTimeout(resizeTimeoutRef.current);
      dataDisposable.dispose();
      resizeObserver.disconnect();
      term.dispose();
      if (unlistenData) unlistenData();
      if (unlistenExit) unlistenExit();
      if (currentSessionId.current) {
        invoke('pty_close', { id: currentSessionId.current }).catch(() => {});
      }
    };
  }, []);

  return (
    <div
      className="flex flex-col h-full w-full bg-black overflow-hidden relative select-none"
      onClick={() => xtermInstance.current?.focus()}
    >
      <div
        ref={terminalRef}
        className="w-full h-full p-0 m-0 overflow-hidden bg-black"
        style={{ height: '100%', width: '100%' }}
      />
    </div>
  );
};

export default OpenCodeView;
