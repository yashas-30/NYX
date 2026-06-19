import { test, expect } from '@playwright/test';

test('Tauri environment startup check', async ({ page }) => {
  // Catch any uncaught exception in the page
  const pageErrors: Error[] = [];
  page.on('pageerror', (err) => {
    pageErrors.push(err);
  });

  // Inject Tauri mock variables
  await page.addInitScript(() => {
    (window as any).__TAURI__ = {};
    (window as any).__TAURI_INTERNALS__ = {};
    // Mock the invoke function or any window.nyxIPC
    (window as any).__TAURI_INVOKE__ = async (cmd: string, args: any) => {
      console.log(`Mock Tauri invoke: ${cmd}`, args);
      if (cmd === 'server_get_ports') {
        return { success: true, data: { express_port: 3001 } };
      }
      return { success: true };
    };
  });

  // Go to the app page
  await page.goto('/');

  // Wait for 5 seconds for any startup errors to settle
  await page.waitForTimeout(5000);

  // If there are errors, print them
  if (pageErrors.length > 0) {
    console.error('Captured Page Errors during Tauri simulation:');
    pageErrors.forEach((err) => {
      console.error(err.stack || err.message);
    });
  }

  expect(pageErrors.length).toBe(0);
});
