import { invoke } from '@tauri-apps/api/core';
import TurndownService from 'turndown';
import { Readability } from '@mozilla/readability';

export class BrowserService {
  /**
   * Fetches the HTML of a URL via the Tauri Rust backend to bypass CORS,
   * then uses Readability.js and Turndown to extract a clean Markdown representation
   * of the page's main content.
   */
  static async readPage(url: string): Promise<string> {
    try {
      const html = await invoke<string>('fetch_page_html_command', { url });
      
      // Parse the HTML document in the browser
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');
      
      // Remove scripts and styles for safety and cleaner parsing
      const scripts = doc.querySelectorAll('script, style, noscript, link, meta, iframe');
      scripts.forEach(el => el.remove());
      
      // Use Readability to extract the main article content
      const reader = new Readability(doc);
      const article = reader.parse();
      
      if (!article) {
        return 'Error: Could not extract content from the page.';
      }
      
      // Convert the extracted HTML to Markdown
      const turndownService = new TurndownService({
        headingStyle: 'atx',
        codeBlockStyle: 'fenced'
      });
      
      // Remove images to save tokens unless specifically needed
      turndownService.remove('img');
      
      const markdown = turndownService.turndown(article.content);
      
      return `# ${article.title}\n\n${markdown}`;
    } catch (error: any) {
      console.error('[BrowserService] Failed to read page:', error);
      return `Error fetching page: ${error.message || String(error)}`;
    }
  }
}
