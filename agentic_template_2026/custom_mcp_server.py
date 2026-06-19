import os
import subprocess
import urllib.request
import urllib.parse
from mcp.server.fastmcp import FastMCP

# Create a FastMCP server instance
mcp = FastMCP("Workspace Toolkit 2026")

@mcp.tool()
def read_directory(path: str) -> str:
    """Reads the contents of a specified local directory."""
    try:
        if not os.path.isdir(path):
            return f"Error: {path} is not a valid directory."
        items = os.listdir(path)
        if not items:
            return f"Directory {path} is empty."
        result = [f"Contents of {path}:"]
        for item in items:
            item_path = os.path.join(path, item)
            item_type = "DIR" if os.path.isdir(item_path) else "FILE"
            result.append(f"- [{item_type}] {item}")
        return "\n".join(result)
    except Exception as e:
        return f"Error reading directory: {str(e)}"

@mcp.tool()
def read_file(path: str) -> str:
    """Reads the contents of a specific file."""
    try:
        if not os.path.isfile(path):
            return f"Error: {path} is not a valid file."
        with open(path, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Error reading file: {str(e)}"

@mcp.tool()
def write_file(path: str, content: str) -> str:
    """Writes content to a specific file, overwriting it if it exists."""
    try:
        os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        return f"Successfully wrote to {path}"
    except Exception as e:
        return f"Error writing file: {str(e)}"

@mcp.tool()
def run_shell_command(command: str) -> str:
    """
    Executes a shell command on the host system. 
    WARNING: Use with caution.
    """
    try:
        result = subprocess.run(
            command, 
            shell=True, 
            capture_output=True, 
            text=True, 
            timeout=30
        )
        output = result.stdout if result.returncode == 0 else result.stderr
        return output if output else "Command executed successfully with no output."
    except Exception as e:
        return f"Error executing command: {str(e)}"

@mcp.tool()
def fetch_webpage(url: str) -> str:
    """Fetches the raw HTML content of a given URL."""
    try:
        if not url.startswith('http'):
            url = 'https://' + url
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8')
        # Return first 4000 chars to avoid overwhelming the LLM context 
        return html[:4000] + "\n...[truncated for context limits]"
    except Exception as e:
        return f"Error fetching URL: {str(e)}"

@mcp.tool()
def search_web(query: str) -> str:
    """
    Searches the web using DuckDuckGo HTML search.
    """
    try:
        url = "https://html.duckduckgo.com/html/?q=" + urllib.parse.quote(query)
        req = urllib.request.Request(
            url, 
            headers={'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'}
        )
        with urllib.request.urlopen(req, timeout=10) as response:
            html = response.read().decode('utf-8')
        # A simple string extraction for demonstration (in production, use BeautifulSoup)
        # We just return the raw text block containing the results
        return html[:3000] + "\n...[truncated]"
    except Exception as e:
        return f"Error searching web: {str(e)}"

if __name__ == "__main__":
    # Start the server using standard input/output
    print("Starting Workspace Toolkit 2026 MCP Server on stdio...", flush=True)
    mcp.run(transport='stdio')
