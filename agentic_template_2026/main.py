from graph import build_graph
import sqlite3
import json
import re
from langchain_core.messages import HumanMessage

try:
    from langgraph.checkpoint.sqlite import SqliteSaver
    HAS_SAVER = True
except ImportError:
    HAS_SAVER = False

def print_event(event_type: str, data: dict):
    """
    2026 Standard: Emulates AG-UI event streaming JSON structure.
    """
    event_payload = {
        "event": event_type,
        "data": data
    }
    print(json.dumps(event_payload, indent=2))

def parse_and_print_response(content: str):
    """
    Parses the <think> blocks and GenUI components out of the response.
    """
    # 1. Parse Progressive Disclosure (Thoughts)
    think_pattern = re.compile(r'<think>(.*?)</think>', re.DOTALL)
    thoughts = think_pattern.findall(content)
    content_no_thoughts = think_pattern.sub('', content).strip()
    
    if thoughts:
        print_event("THOUGHT_BLOCK", {"thoughts": thoughts})
        
    # 2. Parse Generative UI Components
    genui_pattern = re.compile(r'\[RENDER_COMPONENT:\s*(.*?)\](.*?)\[/RENDER_COMPONENT\]', re.DOTALL)
    components = genui_pattern.findall(content_no_thoughts)
    final_text = genui_pattern.sub('', content_no_thoughts).strip()
    
    if components:
        for comp_name, comp_data in components:
            print_event("UI_COMPONENT", {
                "component": comp_name.strip(),
                "props_payload": comp_data.strip()
            })
            
    # 3. Print remaining final answer text
    if final_text:
        print_event("FINAL_ANSWER", {"text": final_text})

def main():
    print_event("SYSTEM", {"message": "Booting 2026 Standard Agentic Workflow Template (With GenUI)"})

    workflow = build_graph()
    
    if HAS_SAVER:
        conn = sqlite3.connect("agent_checkpoints.db", check_same_thread=False)
        memory = SqliteSaver(conn)
        app = workflow.compile(checkpointer=memory)
    else:
        app = workflow.compile()
    
    user_prompt = "Can you list the files in the current directory and display them using a Generative UI component?"
    
    initial_state = {
        "messages": [HumanMessage(content=user_prompt)],
        "intent": None,
        "required_tools": [],
        "episodes": [],
        "status": "start",
        "error_count": 0,
        "final_response": None,
        "revision_count": 0,
        "critique": None
    }
    
    print_event("USER_PROMPT", {"text": user_prompt})
    
    config = {"configurable": {"thread_id": "session_004"}}
    
    try:
        # Stream processing
        for output in app.stream(initial_state, config=config):
            for node_name, state_update in output.items():
                print_event("STATUS_UPDATE", {"node": node_name, "status": state_update.get('status', 'processing')})
                
                if "messages" in state_update and state_update["messages"]:
                    latest_msg = state_update["messages"][-1]
                    if hasattr(latest_msg, "tool_calls") and latest_msg.tool_calls:
                        for tool in latest_msg.tool_calls:
                            print_event("TOOL_CALL", {"tool": tool['name'], "args": tool['args']})
                            
                if "critique" in state_update and state_update["critique"]:
                    print_event("REFLECTION_CRITIQUE", {"feedback": state_update["critique"]})

        # At the very end, parse the final message for GenUI and progressive disclosure UX
        final_state = app.get_state(config).values
        if "messages" in final_state and final_state["messages"]:
            final_content = final_state["messages"][-1].content
            parse_and_print_response(final_content)
            
    except Exception as e:
        print_event("ERROR", {"message": str(e)})
            
    print_event("SYSTEM", {"message": "Workflow Execution Complete."})

if __name__ == "__main__":
    main()
