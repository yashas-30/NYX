from typing import Dict, Any, Callable, List
import inspect
import asyncio

class PipelineRegistry:
    def __init__(self):
        self.tools: Dict[str, Callable] = {}
        self.tool_definitions: List[Dict[str, Any]] = []

    def register_tool(self, name: str, description: str, func: Callable, parameters: Dict[str, Any]):
        self.tools[name] = func
        self.tool_definitions.append({
            "type": "function",
            "function": {
                "name": name,
                "description": description,
                "parameters": parameters
            }
        })

    async def execute_tool(self, name: str, args: Dict[str, Any]) -> str:
        if name not in self.tools:
            return f"Error: Tool {name} not found."
        try:
            func = self.tools[name]
            if inspect.iscoroutinefunction(func):
                result = await func(**args)
            else:
                result = await asyncio.to_thread(func, **args)
            return str(result)
        except Exception as e:
            return f"Error executing {name}: {str(e)}"

# Global registry
registry = PipelineRegistry()
