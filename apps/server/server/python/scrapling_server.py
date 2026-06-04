#!/usr/bin/env python3
import sys
import os
import json
import argparse
import urllib.request
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import traceback
import logging

# Configure standard logging to direct to stdout and filter out INFO logs
logging.basicConfig(level=logging.WARNING, stream=sys.stdout)
# Explicitly mute scrapling's verbose GET logs
logging.getLogger('scrapling').setLevel(logging.WARNING)

print("[Scrapling Server] Initializing dependencies...")
try:
    from ddgs import DDGS
    from scrapling import Fetcher
    import html2text
    print("[Scrapling Server] ddgs, scrapling, and html2text imported successfully.")
except ImportError as e:
    print(f"\n[Scrapling Server] CRITICAL ERROR: Missing dependency: {e}", file=sys.stderr)
    print("[Scrapling Server] Please run: pip install ddgs scrapling html2text curl_cffi playwright browserforge", file=sys.stderr)
    sys.exit(1)

class ScraplingHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Mute logging to keep console clean
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

        if self.path in ('/health', '/api/health', '/'):
            res = {
                "status": "ok",
                "service": "scrapling-local-scraper"
            }
        else:
            res = {"status": "error", "message": "Endpoint not found"}
        
        self.wfile.write(json.dumps(res).encode('utf-8'))

    def do_POST(self):
        # Expose both /v1/search and /v1/scrape to match Firecrawl API endpoints
        if self.path in ('/v1/search', '/search'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                req_body = json.loads(post_data.decode('utf-8'))
            except Exception:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b"Invalid JSON")
                return

            query = req_body.get('query', '')
            limit = req_body.get('limit', 3)
            engine = req_body.get('engine', 'duckduckgo')
            search_type = req_body.get('type', 'text')
            timeout_sec = int(req_body.get('timeout', 30))
            site_filter = req_body.get('siteFilter', '')

            try:
                limit = int(limit)
            except ValueError:
                limit = 3

            if site_filter:
                query = f"site:{site_filter} {query}"

            print(f"[Scrapling Server] Processing search query: '{query}' (engine: {engine}, type: {search_type}, limit: {limit})")

            results = []
            if query.strip():
                try:
                    search_results_meta = []

                    if engine == 'google':
                        serper_api_key = os.environ.get('SERPER_API_KEY')
                        if serper_api_key:
                            print(f"[Scrapling Server] Using Serper API for Google search...")
                            try:
                                req_url = "https://google.serper.dev/search"
                                if search_type == 'image':
                                    req_url = "https://google.serper.dev/images"
                                
                                payload = json.dumps({
                                    "q": query,
                                    "num": limit
                                }).encode('utf-8')
                                
                                req = urllib.request.Request(req_url, data=payload, headers={
                                    'X-API-KEY': serper_api_key,
                                    'Content-Type': 'application/json'
                                })
                                with urllib.request.urlopen(req) as response:
                                    resp_body = response.read().decode('utf-8')
                                    serper_data = json.loads(resp_body)
                                    
                                    if search_type == 'image':
                                        images = serper_data.get('images', [])
                                        for i, img in enumerate(images[:limit]):
                                            search_results_meta.append({
                                                'url': img.get('imageUrl'),
                                                'title': img.get('title', 'Image'),
                                                'snippet': img.get('snippet', ''),
                                                'rank': i + 1,
                                                'is_image': True
                                            })
                                    else:
                                        organic = serper_data.get('organic', [])
                                        for i, item in enumerate(organic[:limit]):
                                            search_results_meta.append({
                                                'url': item.get('link'),
                                                'title': item.get('title', 'No Title'),
                                                'snippet': item.get('snippet', ''),
                                                'rank': item.get('position', i + 1),
                                                'is_image': False
                                            })
                            except Exception as serper_err:
                                print(f"[Scrapling Server] Serper API failed: {serper_err}", file=sys.stderr)
                                engine = 'duckduckgo' # fallback
                        else:
                            print("[Scrapling Server] Warning: SERPER_API_KEY not found in env, falling back to DDG")
                            engine = 'duckduckgo'

                    if engine == 'duckduckgo':
                        try:
                            with DDGS() as ddgs:
                                if search_type == 'image':
                                    ddgs_res = list(ddgs.images(query, max_results=limit))
                                    for i, item in enumerate(ddgs_res):
                                        search_results_meta.append({
                                            'url': item.get('image'),
                                            'title': item.get('title', 'Image'),
                                            'snippet': '',
                                            'rank': i + 1,
                                            'is_image': True
                                        })
                                else:
                                    ddgs_res = list(ddgs.text(query, max_results=limit))
                                    for i, item in enumerate(ddgs_res):
                                        search_results_meta.append({
                                            'url': item.get('href') or item.get('url'),
                                            'title': item.get('title', 'No Title'),
                                            'snippet': item.get('body', ''),
                                            'rank': i + 1,
                                            'is_image': False
                                        })
                        except Exception as ddg_err:
                            print(f"[Scrapling Server] DDG Search failed: {ddg_err}", file=sys.stderr)
                    
                    # 2. Iterate and scrape each page using Scrapling
                    for item in search_results_meta:
                        url = item['url']
                        title = item['title']
                        snippet = item['snippet']
                        rank = item['rank']
                        is_image = item.get('is_image')
                        
                        if not url:
                            continue
                            
                        if is_image:
                            results.append({
                                "title": title,
                                "url": url,
                                "markdown": f"![{title}]({url})\n\n{snippet}",
                                "rank": rank
                            })
                            continue
                        
                        print(f"[Scrapling Server] Scraping URL via Scrapling: {url}")
                        try:
                            # Use Scrapling's Fetcher with chrome impersonation to bypass blocks
                            resp = Fetcher.get(url, impersonate='chrome', timeout=timeout_sec)
                            html_content = resp.html_content
                            
                            # Convert fetched HTML to clean markdown
                            if html_content:
                                # Safe regex cleaning of non-essential elements to reduce token size and skip sidebars
                                import re
                                cleaned_html = html_content
                                for tag in ['script', 'style', 'head', 'nav', 'footer', 'header', 'aside']:
                                    cleaned_html = re.sub(rf'<{tag}\b[^>]*>([\s\S]*?)<\/{tag}>', '', cleaned_html, flags=re.IGNORECASE)
                                
                                # Extract main content if article or main tags exist to skip headers/navigation
                                article_match = re.search(r'<article\b[^>]*>([\s\S]*?)<\/article>', cleaned_html, flags=re.IGNORECASE)
                                if article_match:
                                    cleaned_html = article_match.group(1)
                                else:
                                    main_match = re.search(r'<main\b[^>]*>([\s\S]*?)<\/main>', cleaned_html, flags=re.IGNORECASE)
                                    if main_match:
                                        cleaned_html = main_match.group(1)
                                
                                converter = html2text.HTML2Text()
                                converter.ignore_links = True
                                converter.ignore_images = True
                                converter.ignore_emphasis = False
                                markdown_content = converter.handle(cleaned_html)
                            else:
                                markdown_content = resp.get_all_text() or snippet
                        except Exception as scrape_err:
                            print(f"[Scrapling Server] Failed to scrape {url}: {scrape_err}", file=sys.stderr)
                            markdown_content = snippet # Fallback to search snippet on failure
                        
                        if snippet:
                            markdown_content = f"Search Snippet Summary: {snippet}\n\nScraped Page Content:\n{markdown_content}"
                        
                        results.append({
                            "title": title,
                            "url": url,
                            "markdown": markdown_content,
                            "rank": rank
                        })
                except Exception as run_err:
                    print(f"[Scrapling Server] Search processing error: {run_err}", file=sys.stderr)
                    traceback.print_exc()

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            res_body = {
                "success": True,
                "data": results
            }
            self.wfile.write(json.dumps(res_body).encode('utf-8'))

        elif self.path in ('/v1/scrape', '/scrape'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                req_body = json.loads(post_data.decode('utf-8'))
            except Exception:
                self.send_response(400)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(b"Invalid JSON")
                return

            url = req_body.get('url', '')
            print(f"[Scrapling Server] Processing scrape request for URL: '{url}'")

            markdown_content = ""
            success = False
            title = ""

            if url:
                try:
                    resp = Fetcher.get(url, impersonate='chrome', timeout=10)
                    html_content = resp.html_content
                    title = resp.xpath('//title/text()').extract_first() or "Scraped Page"
                    if html_content:
                        # Safe regex cleaning of non-essential elements to reduce token size
                        import re
                        cleaned_html = html_content
                        for tag in ['script', 'style', 'head', 'nav', 'footer', 'header', 'aside']:
                            cleaned_html = re.sub(rf'<{tag}\b[^>]*>([\s\S]*?)<\/{tag}>', '', cleaned_html, flags=re.IGNORECASE)
                        
                        # Extract main content if article or main tags exist to skip headers/navigation
                        article_match = re.search(r'<article\b[^>]*>([\s\S]*?)<\/article>', cleaned_html, flags=re.IGNORECASE)
                        if article_match:
                            cleaned_html = article_match.group(1)
                        else:
                            main_match = re.search(r'<main\b[^>]*>([\s\S]*?)<\/main>', cleaned_html, flags=re.IGNORECASE)
                            if main_match:
                                cleaned_html = main_match.group(1)
                        
                        converter = html2text.HTML2Text()
                        converter.ignore_links = True
                        converter.ignore_images = True
                        markdown_content = converter.handle(cleaned_html)
                        success = True
                    else:
                        markdown_content = resp.get_all_text()
                        success = True
                except Exception as scrape_err:
                    print(f"[Scrapling Server] Scrape failed for {url}: {scrape_err}", file=sys.stderr)

            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            
            res_body = {
                "success": success,
                "data": {
                    "metadata": {
                        "title": title,
                        "sourceURL": url
                    },
                    "markdown": markdown_content
                }
            }
            self.wfile.write(json.dumps(res_body).encode('utf-8'))

        else:
            self.send_response(404)
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            self.wfile.write(b"Endpoint not found")

def run_server():
    parser = argparse.ArgumentParser(description="NYX Local Scrapling Web Search/Scraper Service")
    parser.add_argument("--port", type=int, default=3002, help="Port to run the HTTP server on")
    args = parser.parse_args()

    port = args.port
    server_address = ('127.0.0.1', port)
    httpd = ThreadingHTTPServer(server_address, ScraplingHandler)
    print(f"\n[Scrapling Server] Local web scraping proxy running on http://127.0.0.1:{port}")
    
    import threading
    def monitor_parent():
        try:
            sys.stdin.read()
        except Exception:
            pass
        print("[Scrapling Server] Parent process died, exiting...")
        os._exit(0)
    threading.Thread(target=monitor_parent, daemon=True).start()

    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    print("[Scrapling Server] Shutting down...")

if __name__ == '__main__':
    run_server()
