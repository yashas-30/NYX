import os
from autogen import AssistantAgent, UserProxyAgent
from src.config.settings import settings

# 1. Configuration for the Agents
# OpenCode Crew is an Autonomous Agent (Anthropic Paradigm) designed to explore
# and write code in an open-ended loop, unlike the strict Research Workflow.
llm_config = {
    "config_list": [
        {
            "model": settings.CLOUD_MODEL,
            "api_key": os.environ.get("OPENAI_API_KEY", "dummy"), # Using litellm proxy underneath if configured
        }
    ],
    "temperature": 0.2,
}

# 2. Agent Skills (Anthropic Paradigm)
# Instead of stuffing the system prompt, we load modular "Skills" for the agent.
# In a full implementation, these would be read from markdown files in .agents/skills/
CODE_STYLE_SKILL = """
SKILL: Python FastApi Guidelines
- Always use type hints.
- Always use Pydantic models for validation.
- Avoid global state.
"""

# 3. Agent Initialization
generator = AssistantAgent(
    name="Code_Generator",
    system_message=f"You are a Senior Python Engineer. You write clean, production-ready code.\n\n{CODE_STYLE_SKILL}",
    llm_config=llm_config,
)

critic = AssistantAgent(
    name="Code_Critic",
    system_message="You are a strict Code Reviewer. You evaluate code for security, performance, and style. "
                   "If the code passes, reply with 'TERMINATE'. If it fails, explain why.",
    llm_config=llm_config,
)

user_proxy = UserProxyAgent(
    name="Execution_Sandbox",
    human_input_mode="NEVER", # Automated execution
    max_consecutive_auto_reply=3,
    is_termination_msg=lambda x: x.get("content", "") and x.get("content", "").rstrip().endswith("TERMINATE"),
    code_execution_config={
        "work_dir": "workspace",
        "use_docker": False, # In production, set to True for security!
    },
)

# 4. MCP Tool Binding (Simulated Client)
# In 2026 standards, tools are provided via MCP (Model Context Protocol).
def bind_mcp_tools(agent):
    """
    Connects to the NYX-Core-Tools FastMCP server and registers its tools 
    (like read_file_contents) to the AutoGen agent.
    """
    # Pseudo-code for MCP Client binding:
    # async with MCPClient(server_url="stdio://mcp_servers/core_tools.py") as client:
    #     tools = await client.list_tools()
    #     agent.register_for_llm(tools)
    pass

bind_mcp_tools(generator)

def run_coding_crew(task: str):
    """
    Kicks off the autonomous coding loop between the Generator and the Critic.
    """
    user_proxy.initiate_chat(
        generator,
        message=f"Task: {task}\n\nWrite the code. The Critic will review it.",
    )
    
    # Return the final conversation history or the generated code
    return user_proxy.chat_messages[generator]
