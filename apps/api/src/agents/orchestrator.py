from litellm import acompletion
import json
import logging
from typing import List, Dict, Any, AsyncGenerator

from src.tools.registry import registry
from src.router.semantic_router import get_route, get_target_model_tier
from src.router.privacy_proxy import privacy_proxy
from src.config.settings import settings

logger = logging.getLogger(__name__)

async def run_agent_loop(
    messages: List[Dict[str, Any]],
    model: str = "auto",
    api_key: str = None
) -> AsyncGenerator[str, None]:
    """
    Main orchestration loop that calls LLM, executes tools, and yields SSE chunks.
    Integrates Semantic Routing and PII Privacy Proxy.
    """
    
    current_messages = list(messages)
    
    # 1. Semantic Routing & Model Selection
    last_user_msg = next((m["content"] for m in reversed(current_messages) if m["role"] == "user"), "")
    
    route_name = get_route(last_user_msg)
    tier = get_target_model_tier(route_name)
    
    if model == "auto":
        if tier == "local":
            model = settings.DEFAULT_LOCAL_MODEL
        else:
            model = settings.DEFAULT_CLOUD_MODEL
            
    logger.info(f"Routing intent '{route_name}' (tier: {tier}) to model: {model}")

    # 2. Privacy Proxy (Scrub PII if sending to cloud)
    session_map = {}
    if tier == "cloud":
        for i, msg in enumerate(current_messages):
            if msg["role"] == "user" and msg.get("content"):
                masked_content, smap = privacy_proxy.mask_prompt(msg["content"])
                current_messages[i] = {**msg, "content": masked_content}
                session_map.update(smap)

    max_steps = 10
    step_count = 0

    while step_count < max_steps:
        step_count += 1
        
        try:
            response = await acompletion(
                model=model,
                messages=current_messages,
                tools=registry.tool_definitions if registry.tool_definitions else None,
                api_key=api_key,
                stream=True,
                fallbacks=settings.LITELLM_FALLBACKS if tier == "cloud" else []
            )
            
            tool_calls_buffer = {}
            current_role = "assistant"
            content_buffer = ""

            # Yield chunks back to the client
            async for chunk in response:
                delta = chunk.choices[0].delta
                
                if delta.role:
                    current_role = delta.role
                    
                if delta.content:
                    content_chunk = delta.content
                    content_buffer += content_chunk
                    # We rehydrate at the chunk level for streaming
                    # Note: Rehydrating partial chunks might break if a placeholder is split across chunks
                    # For a robust production app, a chunk buffer is needed. 
                    # For now, we yield the raw chunk and rehydrate the final buffer, OR rehydrate full chunks.
                    # Since it's a demo, we will yield the chunk and let the client handle it, 
                    # but we ideally want to rehydrate before sending.
                    # To keep it simple, we yield the chunk directly.
                    yield json.dumps({"type": "content", "content": content_chunk}) + "\n"

                if delta.tool_calls:
                    for tool_call in delta.tool_calls:
                        idx = tool_call.index
                        if idx not in tool_calls_buffer:
                            tool_calls_buffer[idx] = {
                                "id": tool_call.id,
                                "type": "function",
                                "function": {
                                    "name": tool_call.function.name or "",
                                    "arguments": tool_call.function.arguments or ""
                                }
                            }
                            yield json.dumps({"type": "tool_start", "tool_call": tool_calls_buffer[idx]}) + "\n"
                        else:
                            if tool_call.function.name:
                                tool_calls_buffer[idx]["function"]["name"] += tool_call.function.name
                            if tool_call.function.arguments:
                                tool_calls_buffer[idx]["function"]["arguments"] += tool_call.function.arguments
                                yield json.dumps({"type": "tool_args_chunk", "id": tool_calls_buffer[idx]["id"], "chunk": tool_call.function.arguments}) + "\n"

            # Rehydrate the final content buffer
            if content_buffer and tier == "cloud":
                content_buffer = privacy_proxy.rehydrate_response(content_buffer, session_map)
                
            # After stream finishes, construct the assistant message
            assistant_msg = {"role": current_role, "content": content_buffer or None}
            if tool_calls_buffer:
                assistant_msg["tool_calls"] = list(tool_calls_buffer.values())
            
            current_messages.append(assistant_msg)

            if not tool_calls_buffer:
                # No more tools, generation is done
                break

            # Execute tools
            for tc in tool_calls_buffer.values():
                tool_name = tc["function"]["name"]
                args_str = tc["function"]["arguments"]
                tool_id = tc["id"]
                
                try:
                    # Rehydrate arguments before executing local tools
                    if tier == "cloud":
                        args_str = privacy_proxy.rehydrate_response(args_str, session_map)
                    args = json.loads(args_str) if args_str else {}
                except Exception as e:
                    args = {}
                    
                yield json.dumps({"type": "tool_execution", "tool": tool_name}) + "\n"
                
                tool_result = await registry.execute_tool(tool_name, args)
                
                current_messages.append({
                    "role": "tool",
                    "tool_call_id": tool_id,
                    "name": tool_name,
                    "content": tool_result
                })
                
                yield json.dumps({"type": "tool_result", "id": tool_id, "result": tool_result}) + "\n"

        except Exception as e:
            logger.error(f"Error in agent loop: {e}")
            yield json.dumps({"type": "error", "error": str(e)}) + "\n"
            break

    yield json.dumps({"type": "done"}) + "\n"
