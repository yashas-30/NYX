import os
from fastmcp import FastMCP
from duckduckgo_search import DDGS

# Initialize the MCP Server
# This decoupling enforces the 2026 standard where tools live outside the agent logic.
mcp = FastMCP("NYX-Core-Tools")

@mcp.tool()
def web_search(query: str, max_results: int = 3) -> str:
    """
    Search the web using DuckDuckGo.
    This is used by the Research Workflow to gather live data.
    """
    try:
        results = DDGS().text(query, max_results=max_results)
        if not results:
            return "No results found."
        
        formatted_results = []
        for r in results:
            formatted_results.append(f"Title: {r.get('title')}\nURL: {r.get('href')}\nSnippet: {r.get('body')}\n")
            
        return "\n---\n".join(formatted_results)
    except Exception as e:
        return f"Web search failed: {str(e)}"

@mcp.tool()
def read_file_contents(filepath: str) -> str:
    """
    Read the contents of a local file.
    Must be an absolute path or relative to the workspace root.
    """
    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    except Exception as e:
        return f"Failed to read file: {str(e)}"

if __name__ == "__main__":
    # When run directly, start the MCP STDIO server
    mcp.run()
