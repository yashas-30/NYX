from .registry import registry
import os

def init_builtin_tools():
    registry.register_tool(
        name="web_search",
        description="Search the web for current information.",
        parameters={
            "type": "object",
            "properties": {
                "query": {"type": "string", "description": "The search query"},
                "num_results": {"type": "integer", "description": "Number of results to return (default: 5)"}
            },
            "required": ["query"]
        },
        func=web_search
    )

    registry.register_tool(
        name="list_directory",
        description="List all files and folders in a directory.",
        parameters={
            "type": "object",
            "properties": {
                "path": {"type": "string", "description": "Absolute path to the directory"}
            },
            "required": ["path"]
        },
        func=list_directory
    )

async def web_search(query: str, num_results: int = 5) -> str:
    try:
        from duckduckgo_search import DDGS
        with DDGS() as ddgs:
            results = list(ddgs.text(query, max_results=num_results))
            if not results:
                return f"No results found for '{query}'."
            
            output = f"Search results for '{query}':\n\n"
            for i, res in enumerate(results, 1):
                output += f"{i}. {res.get('title', 'No Title')}\n"
                output += f"   URL: {res.get('href', 'No URL')}\n"
                output += f"   Snippet: {res.get('body', 'No Snippet')}\n\n"
            return output
    except Exception as e:
        return f"Error executing web search: {str(e)}"

def list_directory(path: str) -> str:
    try:
        entries = os.listdir(path)
        return "\n".join(entries)
    except Exception as e:
        return f"Error reading directory: {str(e)}"
