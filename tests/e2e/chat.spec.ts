import { test, expect } from '@playwright/test';

test.describe('Chat Flow', () => {
  test('send message and receive response', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.fill('[data-testid="prompt-input"]', 'Hello, NYX!');
    await page.click('[data-testid="send-button"]');
    await expect(page.locator('[data-testid="assistant-message"]')).toBeVisible();
    await expect(page.locator('[data-testid="assistant-message"]')).toContainText('NYX');
  });

  test('switch between local and cloud models', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.click('[data-testid="model-selector"]');
    await page.click('[data-testid="model-gemini-3.5-flash"]');
    await page.fill('[data-testid="prompt-input"]', 'Test with Gemini');
    await page.click('[data-testid="send-button"]');
    
    await page.click('[data-testid="model-selector"]');
    await page.click('[data-testid="model-local-gemma"]');
    await page.fill('[data-testid="prompt-input"]', 'Test with local model');
    await page.click('[data-testid="send-button"]');
  });

  test('settings persistence', async ({ page }) => {
    await page.goto('http://localhost:3000/settings');
    await page.fill('[data-testid="api-key-input"]', 'test-key-123');
    await page.click('[data-testid="save-settings"]');
    await page.reload();
    await expect(page.locator('[data-testid="api-key-input"]')).toHaveValue('test-key-123');
  });

  test('session management', async ({ page }) => {
    await page.goto('http://localhost:3000');
    await page.fill('[data-testid="prompt-input"]', 'Message 1');
    await page.click('[data-testid="send-button"]');
    await page.click('[data-testid="new-session"]');
    await expect(page.locator('[data-testid="message-list"]')).toBeEmpty();
  });
});
