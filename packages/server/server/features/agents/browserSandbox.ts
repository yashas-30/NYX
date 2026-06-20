import { chromium, Browser, Page } from 'playwright';

export interface AccessibilityNode {
  role: string;
  name?: string;
  value?: string;
  children?: AccessibilityNode[];
}

export class BrowserSandbox {
  private browser: Browser | null = null;
  private page: Page | null = null;

  async init() {
    this.browser = await chromium.launch({ headless: true });
    this.page = await this.browser.newPage();
  }

  async navigateAndGetAOM(url: string): Promise<string> {
    if (!this.page) await this.init();
    
    try {
      await this.page!.goto(url, { waitUntil: 'networkidle' });
      
      // Instead of raw HTML, we return the Accessibility Tree (AOM)
      // This is vastly more token-efficient and represents what a user actually interacts with,
      // as learned from the browser-use project.
      const snapshot = await this.page!.accessibility.snapshot();
      
      return JSON.stringify(this.simplifyAOM(snapshot), null, 2);
    } catch (e: any) {
      return `Failed to navigate: ${e.message}`;
    }
  }

  private simplifyAOM(node: any): AccessibilityNode | null {
    if (!node) return null;

    // Filter out visually hidden or irrelevant nodes to save tokens
    if (node.hidden) return null;

    const simplified: AccessibilityNode = {
      role: node.role,
    };

    if (node.name) simplified.name = node.name;
    if (node.value !== undefined) simplified.value = String(node.value);

    if (node.children && node.children.length > 0) {
      simplified.children = node.children
        .map((child: any) => this.simplifyAOM(child))
        .filter((child: any): child is AccessibilityNode => child !== null);
      
      if (simplified.children.length === 0) {
        delete simplified.children;
      }
    }

    return simplified;
  }

  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }
}
