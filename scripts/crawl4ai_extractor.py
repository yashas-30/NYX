import sys
import json
import argparse
import asyncio
from typing import Optional

def extract_clean_markdown_bs4(html_content: str, base_url: str = "") -> str:
    """Fallback high-speed HTML to LLM Markdown converter using BeautifulSoup."""
    try:
        from bs4 import BeautifulSoup, Comment
    except ImportError:
        return html_content

    soup = BeautifulSoup(html_content, "html.parser")

    # Remove script, style, nav, footer, header, iframe, noscript, svg, form tags
    for tag in soup(["script", "style", "nav", "footer", "header", "iframe", "noscript", "svg", "form", "aside"]):
        tag.decompose()

    # Remove comments
    for comment in soup.find_all(string=lambda text: isinstance(text, Comment)):
        comment.extract()

    # Try finding main content container
    main_content = (
        soup.find("article")
        or soup.find("main")
        or soup.find(attrs={"role": "main"})
        or soup.find(id=lambda i: i and "content" in i.lower())
        or soup.find(class_=lambda c: c and any(k in str(c).lower() for k in ["content", "post", "article", "entry"]))
        or soup.body
        or soup
    )

    lines = []
    for element in main_content.find_all(["h1", "h2", "h3", "h4", "h5", "h6", "p", "ul", "ol", "li", "pre", "code", "blockquote", "table"]):
        tag_name = element.name.lower()
        text = element.get_text(strip=True)

        if not text:
            continue

        if tag_name == "h1":
            lines.append(f"\n# {text}\n")
        elif tag_name == "h2":
            lines.append(f"\n## {text}\n")
        elif tag_name in ("h3", "h4", "h5", "h6"):
            lines.append(f"\n### {text}\n")
        elif tag_name == "p":
            lines.append(f"\n{text}\n")
        elif tag_name == "li":
            lines.append(f"- {text}")
        elif tag_name in ("pre", "code"):
            lines.append(f"\n```\n{text}\n```\n")
        elif tag_name == "blockquote":
            lines.append(f"> {text}")

    output = "\n".join(lines).strip()
    return output if len(output) > 50 else soup.get_text(separator="\n", strip=True)

async def fn_crawl_url(url: str, max_chars: int = 15000) -> str:
    """Crawl a URL using Crawl4AI (with BS4 fallback) and return clean LLM Markdown."""
    try:
        from crawl4ai import AsyncWebCrawler, CrawlerRunConfig, CacheMode
        from crawl4ai.markdown_generation_strategy import DefaultMarkdownGenerator

        config = CrawlerRunConfig(
            cache_mode=CacheMode.BYPASS,
            markdown_generator=DefaultMarkdownGenerator(),
            excluded_tags=["nav", "footer", "header", "aside", "form"],
            remove_overlay_elements=True,
            verbose=False,
        )

        async with AsyncWebCrawler(verbose=False) as crawler:
            result = await crawler.arun(url=url, config=config)
            if result.success and result.markdown:
                md_text = result.markdown.raw_markdown if hasattr(result.markdown, 'raw_markdown') else str(result.markdown)
                if len(md_text.strip()) > 50:
                    return md_text[:max_chars]
    except Exception as e:
        sys.stderr.write(f"[crawl4ai_extractor] Crawl4AI fallback to BS4: {e}\n")

    # Fallback to requests + BeautifulSoup
    try:
        import urllib.request
        req = urllib.request.Request(
            url,
            headers={
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            }
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode("utf-8", errors="ignore")
            clean_md = extract_clean_markdown_bs4(html, url)
            return clean_md[:max_chars]
    except Exception as e:
        return f"Error crawling {url}: {e}"

def main():
    parser = argparse.ArgumentParser(description="NYX Crawl4AI LLM Markdown Extractor")
    parser.add_argument("--url", type=str, help="URL to crawl and convert to LLM Markdown")
    parser.add_argument("--max-chars", type=int, default=15000, help="Maximum character output limit")
    args = parser.parse_args()

    if args.url:
        result = asyncio.run(fn_crawl_url(args.url, args.max_chars))
        print(result)
    else:
        parser.print_help()

if __name__ == "__main__":
    main()
