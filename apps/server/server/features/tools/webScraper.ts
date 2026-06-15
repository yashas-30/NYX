import logger from '../../lib/logger.js';

export async function scrapeUrl(url: string) {
  try {
    logger.info(`[WebScraper] Extracting content via crawl4ai for: ${url}`);
    const response = await fetch('http://localhost:1122/crawl', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url }),
      signal: AbortSignal.timeout(15000),
    });

    if (response.ok) {
      const data: any = await response.json();
      return data.markdown || data.content || 'No content found at URL.';
    } else {
      throw new Error(`Crawl4AI returned ${response.status}`);
    }
  } catch (error: any) {
    logger.error({ err: error.message, url }, '[WebScraper] Failed to crawl URL');
    return `Error: Failed to crawl URL. ${error.message}`;
  }
}
