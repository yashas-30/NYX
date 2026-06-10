import { chromium, Browser, BrowserContext, Page } from 'playwright';
import logger from '../../lib/logger.js';

class BrowserService {
  private browser: Browser | null = null;
  private context: BrowserContext | null = null;
  private page: Page | null = null;

  async start(): Promise<void> {
    if (!this.browser) {
      logger.info('[BrowserService] Launching headless browser...');
      this.browser = await chromium.launch({ headless: true });
      this.context = await this.browser.newContext({
        viewport: { width: 1280, height: 800 },
        userAgent: 'NYX-Coder-Agent/1.0',
      });
      this.page = await this.context.newPage();
      logger.info('[BrowserService] Browser launched.');
    }
  }

  async stop(): Promise<void> {
    if (this.browser) {
      logger.info('[BrowserService] Closing browser...');
      await this.browser.close();
      this.browser = null;
      this.context = null;
      this.page = null;
    }
  }

  async navigate(url: string): Promise<string> {
    await this.start();
    if (!this.page) throw new Error('Page not initialized');
    
    logger.info(`[BrowserService] Navigating to ${url}`);
    await this.page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });
    return `Navigated to ${url}. Title: ${await this.page.title()}`;
  }

  async click(selector: string): Promise<string> {
    await this.start();
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.click(selector, { timeout: 5000 });
    return `Clicked on ${selector}`;
  }

  async type(selector: string, text: string): Promise<string> {
    await this.start();
    if (!this.page) throw new Error('Page not initialized');
    
    await this.page.fill(selector, text, { timeout: 5000 });
    return `Typed text into ${selector}`;
  }

  async getScreenshotBase64(): Promise<string> {
    await this.start();
    if (!this.page) throw new Error('Page not initialized');
    
    const buffer = await this.page.screenshot({ type: 'png', fullPage: false });
    return buffer.toString('base64');
  }

  async getPageHtml(): Promise<string> {
    await this.start();
    if (!this.page) throw new Error('Page not initialized');
    return await this.page.content();
  }
}

export const browserService = new BrowserService();
