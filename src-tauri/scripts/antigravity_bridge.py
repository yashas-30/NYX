# /// script
# requires-python = ">=3.10"
# dependencies = [
#     "google-antigravity",
#     "aiohttp",
# ]
# ///
"""
antigravity_bridge.py
Official Google Antigravity Python SDK bridge for NYX.
Accepts JSON payload via stdin, executes via google.antigravity.Agent,
and streams events as JSON lines to stdout.
"""

import sys
import json
import asyncio

try:
    from google.antigravity import (
        Agent,
        LocalAgentConfig,
        LocalOpenAIAgentConfig,
        CapabilitiesConfig,
        SubagentConfig,
        BuiltinTools,
        policy,
    )
except ImportError:
    from google.antigravity import (
        Agent,
        LocalAgentConfig,
        LocalOpenAIAgentConfig,
        CapabilitiesConfig,
        policy,
    )
    SubagentConfig = None
    BuiltinTools = None

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

        # Parse subagents
        subagents_payload = req.get("subagents") or []
        subagents = []
        if SubagentConfig and subagents_payload:
            for s in subagents_payload:
                subagents.append(
                    SubagentConfig(
                        name=s.get("name"),
                        description=s.get("description", ""),
                        system_instructions=s.get("system_instructions", ""),
                        tools=s.get("tools"),
                    )
                )

        caps_kwargs = {
            "read_only": caps_dict.get("read_only", False),
            "allow_terminal": caps_dict.get("allow_terminal", True),
            "allow_files": caps_dict.get("allow_files", True),
            "allow_web": caps_dict.get("allow_web", True),
        }
        if "enable_subagents" in caps_dict:
            caps_kwargs["enable_subagents"] = caps_dict["enable_subagents"]
        elif subagents:
            caps_kwargs["enable_subagents"] = True

        if "enabled_tools" in caps_dict and caps_dict["enabled_tools"] is not None:
            caps_kwargs["enabled_tools"] = caps_dict["enabled_tools"]
        if "disabled_tools" in caps_dict and caps_dict["disabled_tools"] is not None:
            caps_kwargs["disabled_tools"] = caps_dict["disabled_tools"]

        capabilities = CapabilitiesConfig(**caps_kwargs)

        policies = [policy.allow_all()]
        if req.get("safe_defaults"):
            policies = [policy.safe_defaults()]

        # Provider routing
        if provider in ["gemini", "google"]:
            config_kwargs = {
                "model": model,
                "system_instructions": system_instructions,
                "capabilities": capabilities,
                "policies": policies,
            }
            if api_key:
                config_kwargs["api_key"] = api_key
            if subagents:
                config_kwargs["subagents"] = subagents

            config = LocalAgentConfig(**config_kwargs)
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

            full_text = ""

            async def stream_tokens():
                nonlocal full_text
                try:
                    async for token in response:
                        full_text += token
                        emit("token", token)
                except Exception as ex:
                    emit("error", f"Token stream error: {ex}")

            async def stream_thoughts():
                if hasattr(response, "thoughts"):
                    try:
                        async for thought in response.thoughts:
                            emit("thought", thought)
                    except Exception:
                        pass

            await asyncio.gather(stream_tokens(), stream_thoughts())

            # Emit usage metadata if available
            if hasattr(response, "usage_metadata") and response.usage_metadata:
                try:
                    meta = (
                        response.usage_metadata.to_dict()
                        if hasattr(response.usage_metadata, "to_dict")
                        else dict(response.usage_metadata)
                    )
                    emit("usage", meta)
                except Exception:
                    pass

            emit("done", full_text)

    except Exception as e:
        emit("error", str(e))

if __name__ == "__main__":
    asyncio.run(main())
