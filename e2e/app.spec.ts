import { test, expect } from '@playwright/test';

test('has title', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveTitle(/NYX/i);
});

test('sidebar renders correctly', async ({ page }) => {
  await page.goto('/');
  const sidebar = page.locator('nav');
  await expect(sidebar).toBeVisible();
});
