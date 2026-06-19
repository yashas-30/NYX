import argparse
import os
from typing import TypedDict
from pydantic import BaseModel, Field
from langgraph.graph import StateGraph, END
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.prompts import ChatPromptTemplate
from langchain_community.tools import DuckDuckGoSearchRun
from langchain_core.messages import SystemMessage, HumanMessage

# Initialize Model (Gemini 3.1 Flash Lite as requested)
# Assumes GEMINI_API_KEY is in environment variables
llm = ChatGoogleGenerativeAI(model="gemini-3.1-flash-lite", temperature=0)

# Web Search Tool
search_tool = DuckDuckGoSearchRun()

# 1. Define State
class AgentState(TypedDict):
    prompt: str
    context: str
    plan: str
    draft_code: str
    review_comments: str
    final_code: str
    needs_more_context: bool
    review_passed: bool

# 2. Define Structured Outputs for Nodes
class ArchitectOutput(BaseModel):
    plan: str = Field(description="Step-by-step implementation plan.")
    needs_more_context: bool = Field(description="True if you need the ResearchAgent to search the web for documentation or context before you can write a solid plan. False if you know exactly how to do it.")

class ReviewerOutput(BaseModel):
    review_passed: bool = Field(description="True if the code has no obvious bugs, syntax errors, or missing imports.")
    review_comments: str = Field(description="If review_passed is False, provide specific instructions on what the Coder must fix.")

# 3. Define Node Functions (The Subagents)
def architect_node(state: AgentState) -> AgentState:
    print("\n--> [ArchitectAgent]: Analyzing prompt...")
    
    # Prompt the architect
    sys_msg = "You are a master software architect. Create a high-level plan to solve the user's request. If the user mentions a specific library or API you are unsure about, set needs_more_context to True."
    user_msg = f"Task: {state['prompt']}\n\nAdditional Context Provided by Researcher:\n{state.get('context', 'None')}"
    
    structured_llm = llm.with_structured_output(ArchitectOutput)
    result = structured_llm.invoke([SystemMessage(content=sys_msg), HumanMessage(content=user_msg)])
    
    state["plan"] = result.plan
    state["needs_more_context"] = result.needs_more_context
    
    if result.needs_more_context:
        print("    - Missing context. Routing to ResearchAgent...")
    else:
        print(f"    - Plan generated:\n{result.plan}")
    
    return state

def research_node(state: AgentState) -> AgentState:
    print("\n--> [ResearchAgent]: Executing Web Search...")
    # For PoC, we do a basic search based on the original prompt
    query = f"documentation or best practices for: {state['prompt']}"
    search_result = search_tool.invoke(query)
    
    print("    - Found context from web.")
    state["context"] = search_result
    return state

def coder_node(state: AgentState) -> AgentState:
    print("\n--> [CoderAgent]: Writing pure code based on Architect's plan...")
    
    sys_msg = "You are an expert programmer. Write pure, high-quality code to fulfill the plan. Output ONLY the code, no markdown blocks (```python) or explanations. Just the raw code."
    
    user_content = f"Original Request: {state['prompt']}\nPlan: {state['plan']}\nContext: {state.get('context', '')}"
    
    if state.get("review_comments"):
        print(f"    - Applying review fixes: {state['review_comments']}")
        user_content += f"\n\nThe Reviewer found issues with your previous draft. Please fix them:\n{state['review_comments']}"
        
    prompt = ChatPromptTemplate.from_messages([("system", sys_msg), ("user", "{content}")])
    chain = prompt | llm
    
    result = chain.invoke({"content": user_content})
    state["draft_code"] = result.content
    print("    - Code draft generated.")
    return state

def reviewer_node(state: AgentState) -> AgentState:
    print("\n--> [ReviewerAgent]: Statically verifying Coder's draft...")
    
    sys_msg = "You are a strict code reviewer. Statically analyze the provided code. Look for missing imports, syntax errors, or logical flaws. You do not execute the code."
    user_msg = f"Code to review:\n{state['draft_code']}"
    
    structured_llm = llm.with_structured_output(ReviewerOutput)
    result = structured_llm.invoke([SystemMessage(content=sys_msg), HumanMessage(content=user_msg)])
    
    if not result.review_passed:
        print(f"    - [ERROR] Discovered issues: {result.review_comments}")
        state["review_comments"] = result.review_comments
        state["review_passed"] = False
    else:
        print("    - [PASS] Code looks good.")
        state["review_passed"] = True
        state["final_code"] = state["draft_code"]
    
    return state

# 4. Routing Logic
def route_architect(state: AgentState) -> str:
    if state["needs_more_context"]:
        return "researcher"
    return "coder"

def route_reviewer(state: AgentState) -> str:
    if state["review_passed"]:
        return END
    return "coder"

# 5. Build Graph
workflow = StateGraph(AgentState)

workflow.add_node("architect", architect_node)
workflow.add_node("researcher", research_node)
workflow.add_node("coder", coder_node)
workflow.add_node("reviewer", reviewer_node)

workflow.set_entry_point("architect")
workflow.add_conditional_edges("architect", route_architect, {"researcher": "researcher", "coder": "coder"})
workflow.add_edge("researcher", "architect")
workflow.add_edge("coder", "reviewer")
workflow.add_conditional_edges("reviewer", route_reviewer, {"coder": "coder", END: END})

app = workflow.compile()

def main():
    parser = argparse.ArgumentParser(description="Agentic Coding Workflow CLI")
    parser.add_argument("--prompt", type=str, required=True, help="The coding task prompt.")
    args = parser.parse_args()
    
    if not os.environ.get("GEMINI_API_KEY"):
        print("Error: GEMINI_API_KEY environment variable is not set.")
        print("Please run: $env:GEMINI_API_KEY='your_key' (Windows) or export GEMINI_API_KEY='your_key' (Linux/Mac)")
        return

    print("=== Starting Agentic Coding Workflow ===")
    initial_state = AgentState(
        prompt=args.prompt,
        context="",
        plan="",
        draft_code="",
        review_comments="",
        final_code="",
        needs_more_context=False,
        review_passed=False
    )
    
    final_state = app.invoke(initial_state)
    print("\n=== Workflow Complete ===")
    print("=== Final Code Output ===")
    print(final_state.get('final_code'))

if __name__ == "__main__":
    main()
