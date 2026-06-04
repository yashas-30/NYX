import { execSync } from 'child_process';
// The 'crawl4ai' npm package is typically a wrapper or CLI tool for scraping.
import crawl4ai from 'crawl4ai';

export async function scrapeUrl(url: string) {
  try {
    // Utilize crawl4ai for extraction
    const crawler = crawl4ai as any;
    const result = await crawler.crawl(url);
    return result;
  } catch (error) {
    console.error('Failed to crawl', url, error);
    return null;
  }
}
