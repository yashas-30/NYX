import os
from semantic_router import Route, SemanticRouter
from semantic_router.encoders import HuggingFaceEncoder

# 1. Initialize the embedding model for the router
# We use a fast, local HuggingFace embedding model (Gemma paradigm: Local execution)
encoder = HuggingFaceEncoder(name="all-MiniLM-L6-v2")

# 2. Define our Routes (The OpenAI "Handoff" Pattern)
# Each route acts as an intent that "hands off" execution to a specific specialized Agent or Workflow.

chitchat = Route(
    name="chitchat",
    utterances=[
        "hello", "how are you", "who are you", "tell me a joke", "what's up",
        "good morning", "goodbye", "thanks", "test"
    ],
)

code_generation = Route(
    name="code_generator",
    utterances=[
        "write a python script", "create a fast api server", "debug this code",
        "build a react component", "can you write a function to", "fix this error",
        "write tests for this"
    ],
)

research_workflow = Route(
    name="research_workflow",
    utterances=[
        "search the web for", "find the latest news on", "research the history of",
        "what is the current price of", "look up", "can you search for"
    ],
)

system_ops = Route(
    name="system_ops",
    utterances=[
        "check the server status", "restart the database", "clear the cache",
        "how much memory is being used", "ping the api"
    ],
)

# 3. Initialize the Semantic Router (The Triage Agent)
routes = [chitchat, code_generation, research_workflow, system_ops]
triage_router = SemanticRouter(encoder=encoder, routes=routes)

def get_handoff_target(query: str) -> str:
    """
    Acts as the Triage Agent. Routes the incoming query to the appropriate
    downstream Agent or Workflow (Handoff Pattern).
    """
    route = triage_router(query)
    
    if route.name:
        return route.name
    else:
        # Default fallback
        return "chitchat"

def get_target_model_tier(handoff_target: str) -> str:
    """
    Determines if the handed-off task requires a Local SLM, a Cloud LLM, or a Hybrid approach.
    """
    if handoff_target in ["chitchat", "system_ops"]:
        return "local" # Fast, cheap, local models
    elif handoff_target == "code_generator":
        return "cloud" # Complex reasoning frontier models (e.g. Claude 3.5 Sonnet)
    elif handoff_target == "research_workflow":
        return "hybrid" # Local scraping + Cloud synthesis
    
    return "local"
