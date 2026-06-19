from semantic_router import Route, SemanticRouter
from semantic_router.encoders import HuggingFaceEncoder

# Initialize the embedding model for the router
# all-MiniLM-L6-v2 is fast and efficient for local routing
encoder = HuggingFaceEncoder(name="sentence-transformers/all-MiniLM-L6-v2")

# Define our semantic routes

# 1. Chitchat / General conversation (Can go to Local Model)
chitchat = Route(
    name="chitchat",
    utterances=[
        "hello",
        "how are you?",
        "what's up",
        "tell me a joke",
        "good morning",
        "who are you?",
        "hi there",
        "thanks",
        "thank you",
        "ok",
        "got it"
    ],
)

# 2. Coding / Development (Should go to Cloud Model)
coding = Route(
    name="coding",
    utterances=[
        "write a python script",
        "build a react app",
        "debug this code",
        "what is wrong with my typescript",
        "create a fastapi server",
        "refactor this function",
        "explain this error message",
        "write unit tests for this",
        "how do i center a div",
        "generate a database schema"
    ],
)

# 3. Research / Web Browsing (Should go to Hybrid LangGraph)
research = Route(
    name="research",
    utterances=[
        "search the web for the latest news",
        "find information about hybrid agent architectures",
        "who won the recent election",
        "research the history of the roman empire",
        "what is the stock price of Apple",
        "find me scholarly articles on quantum computing",
        "scrape this website and summarize it",
        "look up the documentation for langchain"
    ],
)

# 4. System / Diagnostics / Background Tasks (Should go to Local Model)
system_ops = Route(
    name="system_ops",
    utterances=[
        "check system health",
        "run a diagnostic",
        "manage cron jobs",
        "save this to memory",
        "what is in the background queue",
        "update my preferences"
    ],
)

# Initialize the RouteLayer
routes = [chitchat, coding, research, system_ops]
route_layer = SemanticRouter(encoder=encoder, routes=routes)

def get_route(query: str) -> str:
    """
    Given a user query, returns the name of the semantic route it belongs to.
    Returns 'default' if no specific route is matched with high confidence.
    """
    route = route_layer(query)
    if route.name:
        return route.name
    return "default"

def get_target_model_tier(route_name: str) -> str:
    """
    Maps a route name to the appropriate model tier.
    """
    if route_name in ["chitchat", "system_ops"]:
        return "local"
    elif route_name in ["coding", "default"]:
        # Default defaults to cloud for safety on unknown complex tasks
        return "cloud"
    elif route_name == "research":
        return "hybrid"
    return "cloud"
