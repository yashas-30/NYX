import React, { useEffect } from 'react';

/**
 * WindowResizeSync
 *
 * IMPORTANT: Since NYX uses decorations: true (native Windows frame),
 * the OS handles all resize dragging natively. We must NOT add custom
 * overlay divs — they block the native resize zones.
 *
 * This component ONLY listens for the Tauri resize event and forces a
 * WebView2 layout reflow so content fills the new window size correctly.
 */
export const WindowResizeHandles: React.FC = () => {
  const isTauri =
    typeof window !== 'undefined' &&
    ('__TAURI__' in window || '__TAURI_INTERNALS__' in window);

  useEffect(() => {
    if (!isTauri) return;

    let unlisten: (() => void) | undefined;

    const setup = async () => {
      try {
        const { getCurrentWindow } = await import('@tauri-apps/api/window');
        const appWindow = getCurrentWindow();

        // On every OS resize event, force a CSS reflow so WebView2 syncs correctly.
        unlisten = await appWindow.onResized(({ payload }) => {
          const root = document.documentElement;
          // Toggling a dummy property triggers a guaranteed Chromium style recalc.
          const tick = root.getAttribute('data-resize-tick') === '1' ? '0' : '1';
          root.setAttribute('data-resize-tick', tick);

          // Also explicitly sync the root element to the new physical size
          // in case the percentage chain hasn't caught up yet.
          root.style.width = payload.width + 'px';
          root.style.height = payload.height + 'px';
          // Allow a frame then clear the override so CSS takes over cleanly.
          requestAnimationFrame(() => {
            root.style.width = '';
            root.style.height = '';
          });
        });
      } catch (err) {
        console.warn('[WindowResizeSync] resize listener failed:', err);
      }
    };

    setup();
    return () => { unlisten?.(); };
  }, [isTauri]);

  // Render nothing — native decorations handle resize drag.
  return null;
};
