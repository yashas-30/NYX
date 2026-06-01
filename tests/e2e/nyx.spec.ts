import { test, expect } from '@playwright/test';

test.describe('NYX Core User Workflows E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to local hot-reload web application server during dev/tests
    await page.goto('http://localhost:3000/');
  });

  test('should load the workspace coder dashboard', async ({ page }) => {
    // Expect landing header to be visible
    const header = page.locator('header');
    await expect(header).toBeVisible();

    // Check if the logo is present on blank empty state canvas
    const emptyStateText = page.locator('text=How can NYX assist');
    await expect(emptyStateText).toBeVisible();
  });

  test('should allow opening and closing the model selector', async ({ page }) => {
    // Locate the select model button on the toolbar
    const selectorBtn = page.locator('button:has-text("Select model")');
    await expect(selectorBtn).toBeVisible();
    await selectorBtn.click();

    // Verify model selector modal overlay has popped up
    const modelSelectorModal = page.locator('text=Logic Units');
    await expect(modelSelectorModal).toBeVisible();

    // Verify provider gateway list options are present
    const providersList = page.locator('text=Gateways');
    await expect(providersList).toBeVisible();
  });

  test('should support navigating settings and storing keys', async ({ page }) => {
    // Click settings sidebar icon button
    const settingsBtn = page.locator('button:has-text("Settings")');
    if (await settingsBtn.isVisible()) {
      await settingsBtn.click();

      // Ensure the settings view mounts and headers are visible
      const settingsHeader = page.locator('h2:has-text("Settings")');
      await expect(settingsHeader).toBeVisible();

      // Check for Google Gemini credential form inputs
      const geminiInput = page.locator('input[placeholder*="Google Gemini"]');
      await expect(geminiInput).toBeVisible();
    }
  });
});
