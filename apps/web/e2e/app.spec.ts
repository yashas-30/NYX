import { test, expect } from '@playwright/test';

/**
 * Smoke tests for NYX — verify the app loads and key UI elements are present.
 */

test.describe('App shell', () => {
  test('loads the home page without errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/');
    await expect(page).toHaveTitle(/NYX/i);
    expect(errors).toHaveLength(0);
  });

  test('renders the prompt textarea', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea[aria-label="Prompt input"]');
    await expect(textarea).toBeVisible({ timeout: 10_000 });
  });

  test('send button is disabled when textarea is empty', async ({ page }) => {
    await page.goto('/');
    const sendBtn = page.locator('button[aria-label="Send prompt"]');
    await expect(sendBtn).toBeDisabled();
  });

  test('send button enables after typing in the prompt', async ({ page }) => {
    await page.goto('/');
    const textarea = page.locator('textarea[aria-label="Prompt input"]');
    await textarea.fill('Hello NYX');
    const sendBtn = page.locator('button[aria-label="Send prompt"]');
    await expect(sendBtn).toBeEnabled();
  });
});

test.describe('Model selector', () => {
  test('opens the model dropdown when the model button is clicked', async ({ page }) => {
    await page.goto('/');
    const modelBtn = page.locator('button[aria-label="Select model"]');
    await modelBtn.click();
    // The model selector panel should appear
    await expect(page.locator('[role="dialog"], [role="listbox"]').first()).toBeVisible();
  });
});
