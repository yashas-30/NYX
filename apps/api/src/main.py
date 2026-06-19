from fastapi import FastAPI, Depends, Request
from fastapi.middleware.cors import CORSMiddleware
from sse_starlette.sse import EventSourceResponse
from typing import AsyncGenerator
import json

from src.database.config import init_db
from src.models.api import ChatRequest
from src.agents.orchestrator import run_agent_loop
from src.tools.builtin import init_builtin_tools
from src.routes.agent_routes import router as agent_router

app = FastAPI(title="NYX Agent API", version="1.0.0")

# Enable CORS for the local React/Tauri frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def startup_event():
    await init_db()
    init_builtin_tools()
    print("NYX API Started and DB Initialized.")

# Register the new Agentic V2 Routes
app.include_router(agent_router, prefix="/api/v2/agents")

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    # Convert Pydantic models to dicts for litellm
    messages = [msg.model_dump(exclude_none=True) for msg in request.messages]
    
    # Add system instruction if provided
    if request.system_instruction:
        if not messages or messages[0].get("role") != "system":
            messages.insert(0, {"role": "system", "content": request.system_instruction})

    # The agent loop returns an async generator yielding JSON strings
    generator = run_agent_loop(
        messages=messages,
        model=request.model,
        api_key=request.api_key
    )

    return EventSourceResponse(generator)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("src.main:app", host="127.0.0.1", port=8000, reload=True)
