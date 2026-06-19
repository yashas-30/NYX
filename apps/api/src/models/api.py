from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

class ChatMessage(BaseModel):
    role: str
    content: str
    tool_calls: Optional[List[Dict[str, Any]]] = None
    tool_call_id: Optional[str] = None
    name: Optional[str] = None

class ChatRequest(BaseModel):
    messages: List[ChatMessage]
    model: str = "gpt-4o"
    provider: str = "openai"
    api_key: Optional[str] = None
    stream: bool = True
    session_id: Optional[str] = None
    system_instruction: Optional[str] = None
