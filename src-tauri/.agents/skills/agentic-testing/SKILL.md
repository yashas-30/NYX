---
name: agentic-testing
description: Use this skill to write and execute robust AI-powered end-to-end (E2E) tests for the web application using Playwright and Zerostep.
---

# Agentic Testing with Playwright & Zerostep

This skill is designed for writing resilient, AI-powered End-to-End tests using **Playwright** and **Zerostep**. By leveraging `ai()` from `@zerostep/playwright`, you can interact with the DOM using natural language (e.g., "Click the login button", "Fill the email field with user@example.com") instead of brittle CSS/XPath selectors.

## Prerequisites

1.  Playwright and `@zerostep/playwright` must be installed in the target workspace (e.g., `apps/web`).
2.  A valid `ZEROSTEP_TOKEN` environment variable must be present, or the tool will fail to authenticate with the AI locator service.

## Usage Guidelines

When the user asks you to test a flow or create an E2E test, follow these steps:

### 1. Test Location
Create or update tests inside the `e:\NYX\apps\web\tests\e2e\` directory. Use the `.spec.ts` suffix.

### 2. Writing the Test
Import both `test` and `expect` from `@playwright/test`, and `ai` from `@zerostep/playwright`.

**Example:**
```typescript
import { test, expect } from '@playwright/test';
import { ai } from '@zerostep/playwright';

test('User can log in', async ({ page }) => {
  await page.goto('http://localhost:3000/login');
  
  // Use AI to perform actions
  await ai('Fill the email input with "test@example.com"', { page });
  await ai('Fill the password input with "password123"', { page });
  await ai('Click the Sign In button', { page });
  
  // Use AI to verify state
  const isLoggedIn = await ai('Is the user avatar visible?', { page });
  expect(isLoggedIn).toBe(true);
});
```

### 3. Execution
To run the tests, execute the Playwright test command within the correct workspace.
- Command: `npx playwright test`
- For a specific file: `npx playwright test tests/e2e/login.spec.ts`
- *Note:* Always pass the `ZEROSTEP_TOKEN` if required by the CI or local environment.

### 4. Self-Healing
If a test fails due to visual changes in the UI, do **NOT** fallback to complex CSS selectors. Instead:
1. Update the `ai('...')` string prompt to be more descriptive.
2. Re-run the test to verify that the AI locator successfully identifies the new UI element.

## Important Constraints
- **Never** use strict structural locators like `page.locator('div > span > button.btn-primary')` unless specifically testing a component's internal structural integrity. Always prefer `ai()` for user interactions.
- Always ensure the server is running on the expected port before executing tests.
