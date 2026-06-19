import json
import os
from typing import List
from langchain_core.tools import BaseTool, tool

# Note: In a true 2026 production app, you would use:
# from langchain_mcp import MCPToolkit
# toolkit = MCPToolkit.from_stdio(command="python", args=["server.py"])
# return toolkit.get_tools()
# For this template, since we don't have an event loop running, 
# we emulate the dynamic JSON-RPC binding by importing the tools directly 
# or wrapping them in LangChain tools.

class MCPClientManager:
    """
    2026 Standard: Dynamic Tool Integration.
    Reads `mcp_config.json` to load installed MCP servers.
    """
    def __init__(self, config_path: str = "mcp_config.json"):
        self.config_path = config_path
        self.servers = self._load_config()

    def _load_config(self) -> dict:
        if not os.path.exists(self.config_path):
            print(f"[MCP] Config not found at {self.config_path}")
            return {}
        with open(self.config_path, "r") as f:
            return json.load(f).get("mcp_servers", {})

    def get_langchain_tools(self) -> List[BaseTool]:
        """
        Returns a list of LangChain tools connected to the MCP servers.
        We emulate the MCP connection here to keep the LangGraph sync loop simple.
        """
        tools = []
        
        # Load the custom workspace toolkit if specified in config
        if "workspace_toolkit" in self.servers:
            # We import the python functions from our custom server to act as tools
            try:
                import custom_mcp_server
                
                @tool
                def read_directory(path: str) -> str:
                    """Reads the contents of a specified local directory."""
                    return custom_mcp_server.read_directory(path)
                    
                @tool
                def read_file(path: str) -> str:
                    """Reads the contents of a specific file."""
                    return custom_mcp_server.read_file(path)
                    
                @tool
                def write_file(path: str, content: str) -> str:
                    """Writes content to a specific file."""
                    return custom_mcp_server.write_file(path, content)
                    
                @tool
                def run_shell_command(command: str) -> str:
                    """Executes a shell command on the host system."""
                    return custom_mcp_server.run_shell_command(command)
                    
                @tool
                def fetch_webpage(url: str) -> str:
                    """Fetches the raw HTML content of a given URL."""
                    return custom_mcp_server.fetch_webpage(url)
                    
                @tool
                def search_web(query: str) -> str:
                    """Searches the web using DuckDuckGo."""
                    return custom_mcp_server.search_web(query)
                    
                tools.extend([
                    read_directory, read_file, write_file, 
                    run_shell_command, fetch_webpage, search_web
                ])
                print("[MCP] Successfully connected to 'Workspace Toolkit'. Loaded 6 tools.")
            except ImportError:
                print("[MCP] Error loading custom_mcp_server.py")

        # Mock sqlite if specified
        if "sqlite" in self.servers:
            @tool
            def query_sqlite(query: str) -> str:
                """Execute a read-only SQL query via the sqlite MCP server."""
                return f"[MCP SQLite Execution] Result for: {query}"
            tools.append(query_sqlite)
            print("[MCP] Successfully connected to 'SQLite'. Loaded 1 tool.")
            
        return tools
