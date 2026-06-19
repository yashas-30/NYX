from typing import TypedDict, Annotated, Sequence, List
from langchain_core.messages import BaseMessage
from operator import add

class AgentState(TypedDict):
    """
    2026 Standard: The Stateful Object passed between LangGraph nodes.
    Now includes Reflection/Critique tracking.
    """
    messages: Annotated[Sequence[BaseMessage], add]
    intent: str
    required_tools: List[str]
    episodes: List[dict]
    status: str
    error_count: int
    final_response: str
    
    # 2026 Reflection Loop State
    revision_count: int
    critique: str
