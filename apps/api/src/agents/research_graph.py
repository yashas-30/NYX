import os
import json
from typing import TypedDict, Annotated, List, Sequence
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langchain_core.messages import BaseMessage, HumanMessage, SystemMessage, AIMessage
from langchain_community.tools import DuckDuckGoSearchRun
from src.config.settings import settings
from src.database.postgres import get_postgres_saver
import litellm

# 1. State Definition
class AgentState(TypedDict):
    messages: Annotated[Sequence[BaseMessage], add_messages]
    query: str
    search_results: str
    final_report: str

# 2. Nodes: Strict Workflow (Anthropic Paradigm)
# Instead of an autonomous agent deciding when to search and when to stop,
# this is a deterministic workflow (DAG) ensuring predictable execution.

def extract_query(state: AgentState):
    """Extracts the core search query from the user's message."""
    messages = state['messages']
    last_user_message = next((m.content for m in reversed(messages) if isinstance(m, HumanMessage)), "")
    
    # In a real app, you might use a fast SLM to extract the exact search term.
    # For now, we'll just use the raw message.
    return {"query": last_user_message}

def execute_search(state: AgentState):
    """Executes the search using our external MCP/Tool (simulated here with DuckDuckGo)."""
    query = state['query']
    try:
        search = DuckDuckGoSearchRun()
        results = search.run(query)
    except Exception as e:
        results = f"Search failed: {e}"
    
    return {"search_results": results}

def synthesize_report(state: AgentState):
    """Synthesizes the search results using a Cloud LLM (e.g., Claude 3.5)."""
    query = state['query']
    search_results = state['search_results']
    
    system_prompt = "You are a Research Synthesizer. Based on the provided search results, create a comprehensive and objective report."
    user_prompt = f"Original Query: {query}\n\nSearch Results:\n{search_results}\n\nPlease synthesize this information."
    
    response = litellm.completion(
        model=settings.CLOUD_MODEL,
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt}
        ]
    )
    
    report = response.choices[0].message.content
    return {"final_report": report, "messages": [AIMessage(content=report)]}

# 3. Graph Construction
workflow = StateGraph(AgentState)

workflow.add_node("extract_query", extract_query)
workflow.add_node("execute_search", execute_search)
workflow.add_node("synthesize_report", synthesize_report)

workflow.add_edge(START, "extract_query")
workflow.add_edge("extract_query", "execute_search")
workflow.add_edge("execute_search", "synthesize_report")
workflow.add_edge("synthesize_report", END)

# 4. Persistence Compilation
# We connect the workflow to our PostgreSQL checkpointer
try:
    checkpointer, _ = get_postgres_saver()
    research_graph = workflow.compile(checkpointer=checkpointer)
except Exception as e:
    print(f"Failed to initialize postgres checkpointer, falling back to memory: {e}")
    # Fallback to in-memory for basic testing if postgres is down
    from langgraph.checkpoint.memory import MemorySaver
    research_graph = workflow.compile(checkpointer=MemorySaver())

def run_research_workflow(user_query: str, thread_id: str):
    """
    Executes the deterministic research workflow with a thread ID for state tracking.
    """
    config = {"configurable": {"thread_id": thread_id}}
    
    final_state = research_graph.invoke(
        {"messages": [HumanMessage(content=user_query)]},
        config=config
    )
    
    return final_state["final_report"]
