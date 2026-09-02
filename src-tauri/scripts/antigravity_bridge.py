"""
antigravity_bridge.py
Official Google Antigravity Python SDK bridge for NYX.
Accepts JSON payload via stdin, executes via google.antigravity.Agent,
and streams events as JSON lines to stdout.
"""

import sys
import json
import asyncio
from google.antigravity import (
    Agent,
    LocalAgentConfig,
    LocalOpenAIAgentConfig,
    CapabilitiesConfig,
    policy,
)

def emit(event: str, data: any):
    print(json.dumps({"event": event, "data": data}), flush=True)

async def main():
    try:
        raw_input = sys.stdin.read()
        if not raw_input.strip():
            emit("error", "Empty input received")
            return

        req = json.loads(raw_input)
        provider = req.get("provider", "gemini").lower()
        model = req.get("model")
        if not model:
            emit("error", "No model selected. Please select a model in the model selector.")
            return
        api_key = req.get("api_key", "")
        base_url = req.get("base_url")
        prompt = req.get("prompt", "")
        system_instructions = req.get("system_instructions")
        caps_dict = req.get("capabilities") or {}

        capabilities = CapabilitiesConfig(
            read_only=caps_dict.get("read_only", False),
            allow_terminal=caps_dict.get("allow_terminal", True),
            allow_files=caps_dict.get("allow_files", True),
            allow_web=caps_dict.get("allow_web", True),
        )

        # Provider routing
        if provider in ["gemini", "google"]:
            config = LocalAgentConfig(
                model=model,
                api_key=api_key if api_key else None,
                system_instructions=system_instructions,
                capabilities=capabilities,
                policies=[policy.allow_all()],
            )
        else:
            # Multi-provider via OpenAI-compatible bridge
            resolved_base_url = base_url
            if not resolved_base_url:
                if provider == "openrouter":
                    resolved_base_url = "https://openrouter.ai/api/v1"
                elif provider == "mistral":
                    resolved_base_url = "https://api.mistral.ai/v1"
                elif provider == "nvidia":
                    resolved_base_url = "https://integrate.api.nvidia.com/v1"
                elif provider == "groq":
                    resolved_base_url = "https://api.groq.com/openai/v1"
                elif provider in ["local", "nyx-native"]:
                    resolved_base_url = "http://localhost:11434/v1"

            config = LocalOpenAIAgentConfig(
                model=model,
                base_url=resolved_base_url,
                system_instructions=system_instructions,
                capabilities=capabilities,
            )

        emit("status", f"Antigravity Python Agent initialized with model {model} ({provider})")

        # REQUIRED: use async context manager — direct .chat() raises RuntimeError
        async with Agent(config) as agent:
            response = await agent.chat(prompt)

            # Stream tokens from the async generator
            full_text = ""
            async for token in response:
                full_text += token
                emit("token", token)

            emit("done", full_text)

    except Exception as e:
        emit("error", str(e))

if __name__ == "__main__":
    asyncio.run(main())
