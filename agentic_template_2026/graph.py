from langgraph.graph import StateGraph, END
from langgraph.prebuilt import ToolNode
from typing import Dict, Any
from langchain_core.messages import HumanMessage, AIMessage, SystemMessage
from state import AgentState
from router import HybridModelRouter
from mcp_client import MCPClientManager
from memory import MemorySystem

router = HybridModelRouter()
mcp_manager = MCPClientManager()
memory_sys = MemorySystem()
tools = mcp_manager.get_langchain_tools()

def node_intent_parsing(state: AgentState) -> Dict[str, Any]:
    """Node 1: Parses intent and retrieves memory."""
    local_model = router.get_router_model()
    latest_msg = state["messages"][-1].content if state["messages"] else ""
    try:
        response = local_model.invoke(f"Extract the primary intent from this message in one word: {latest_msg}")
        intent = response.content.strip()
    except Exception:
        intent = "general_task"
    episodes = memory_sys.retrieve_relevant_episodes(intent)
    return {"intent": intent, "episodes": episodes, "status": "reasoning", "revision_count": 0}

def node_reasoning_and_action(state: AgentState) -> Dict[str, Any]:
    """Node 2: Generates a response or calls tools."""
    cloud_model = router.get_reasoning_model()
    model_with_tools = cloud_model.bind_tools(tools)
    
    # Inject the GenUI System prompt that used to be in the router
    sys_prompt = """You are an advanced 2026 AI Agent. 
You MUST follow two core UI patterns:

1. PROGRESSIVE DISCLOSURE:
Before you provide your final answer, you MUST enclose your internal reasoning, tool strategy, and logic inside <think>...</think> tags.

2. GENERATIVE UI (GenUI):
If you are providing structured data like a list of files, a code snippet, or web search results, DO NOT just write it as raw text. Instead, emit a UI Component rendering tag in this exact format:
[RENDER_COMPONENT: component_name]
{ "json": "data" }
[/RENDER_COMPONENT]

Supported components:
- `directory_tree`: For displaying folder contents.
- `search_results`: For displaying web search results.
- `markdown_card`: For general structured text or code.
"""
    messages = [SystemMessage(content=sys_prompt)] + list(state["messages"])
    
    # If there's a critique from the Reflection node, inject it as a system message
    if state.get("critique"):
        critique_msg = SystemMessage(content=f"CRITIQUE FROM AUDITOR:\n{state['critique']}\nPlease revise your answer based on this feedback.")
        messages.append(critique_msg)
        
    print(f"-> Node[ReasoningAction] Invoking generator (Revision {state.get('revision_count', 0)})...")
    try:
        response = model_with_tools.invoke(messages)
    except Exception as e:
        response = AIMessage(content=f"Mocked response. Error: {e}")
        
    return {"messages": [response]}

tool_node = ToolNode(tools)

def node_reflection(state: AgentState) -> Dict[str, Any]:
    """Node 4: The 2026 Standard Critic loop for quality assurance."""
    critic_model = router.get_critic_model()
    
    last_message = state["messages"][-1].content
    user_prompt = state["messages"][0].content
    
    prompt = f"""
    You are an expert Auditor. Review the following response against the user's initial prompt.
    User Prompt: {user_prompt}
    Agent Response: {last_message}
    """
    
    print("-> Node[Reflection] Auditing output quality...")
    try:
        critique = critic_model.invoke(prompt)
        # Handle case where the API key is missing and mock is returned
        if not hasattr(critique, "is_passing"):
            is_passing = True
            feedback = "Mocked pass."
        else:
            is_passing = critique.is_passing
            feedback = f"Score: {critique.score}/10. Flaws: {critique.flaws}. Feedback: {critique.feedback}"
    except Exception as e:
        print(f"[Warning] Critic failed: {e}")
        is_passing = True
        feedback = "Critic error, bypassing."
        
    print(f"   [Reflection Result] Pass: {is_passing}")
    
    current_revisions = state.get("revision_count", 0) + 1
    
    # If the response passes or we've hit max revisions, we stop
    if is_passing or current_revisions >= 3:
        return {"status": "complete"}
    else:
        return {"critique": feedback, "revision_count": current_revisions}

def should_continue_from_reasoning(state: AgentState) -> str:
    """Edge logic from reasoning."""
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and last_message.tool_calls:
        return "tools"
    # If no tools called, go to reflection instead of END
    return "reflect"
    
def should_continue_from_reflection(state: AgentState) -> str:
    """Edge logic from reflection."""
    if state.get("status") == "complete":
        print("-> Edge[Decision] Response approved. Ending.")
        return "end"
    print("-> Edge[Decision] Response rejected. Looping back to revision.")
    return "revise"

def build_graph() -> StateGraph:
    workflow = StateGraph(AgentState)
    
    workflow.add_node("intent_parsing", node_intent_parsing)
    workflow.add_node("reasoning", node_reasoning_and_action)
    workflow.add_node("tools", tool_node)
    workflow.add_node("reflection", node_reflection)  # The new critic node
    
    workflow.set_entry_point("intent_parsing")
    workflow.add_edge("intent_parsing", "reasoning")
    
    workflow.add_conditional_edges(
        "reasoning",
        should_continue_from_reasoning,
        {"tools": "tools", "reflect": "reflection"}
    )
    workflow.add_edge("tools", "reasoning")
    
    workflow.add_conditional_edges(
        "reflection",
        should_continue_from_reflection,
        {"revise": "reasoning", "end": END}
    )
    
    return workflow
