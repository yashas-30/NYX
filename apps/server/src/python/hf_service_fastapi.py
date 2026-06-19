#!/usr/bin/env python3
import sys
import os
import json
import uuid
import asyncio
from typing import Dict, Any, List, Optional, Union, Generator, AsyncGenerator
from fastapi import FastAPI, HTTPException, Request, Depends, status
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, TextIteratorStreamer
from threading import Thread
from loguru import logger

# ── 1. Structured Logging Setup (NDJSON) ─────────────────────────────────────

def ndjson_sink(message: Any) -> None:
    record = message.record
    log_data: Dict[str, Any] = {
        "level": record["level"].name.lower(),
        "time": int(record["time"].timestamp() * 1000),
        "request_id": record["extra"].get("request_id", "system-main"),
        "stage": record["extra"].get("stage", "critic"),
        "model": record["extra"].get("model", "Qwen2.5-Coder-1.5B"),
        "provider": "hf-local",
        "msg": record["message"]
    }
    sys.stdout.write(json.dumps(log_data) + "\n")
    sys.stdout.flush()

logger.remove()
logger.add(ndjson_sink, level="INFO")

# ── 2. Global Model Variables & Loading ──────────────────────────────────────

model_loaded: bool = False
model_id: str = "Qwen/Qwen2.5-Coder-1.5B-Instruct"
tokenizer: Optional[AutoTokenizer] = None
model: Optional[AutoModelForCausalLM] = None

def get_hf_token() -> Optional[str]:
    token = os.environ.get("HF_TOKEN")
    if not token and os.path.exists(".env"):
        try:
            with open(".env", "r", encoding="utf-8") as f:
                for line in f:
                    if line.strip().startswith("HF_TOKEN="):
                        return line.strip().split("=", 1)[1].strip()
        except Exception:
            pass
    return token

# ── 3. FastAPI App Initialization ───────────────────────────────────────────

app = FastAPI(title="NYX Local Model Critic Service")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.on_event("startup")
def load_qwen_model() -> None:
    global model_loaded, tokenizer, model
    logger.info("Booting up FastAPI Qwen Coder server...", extra={"stage": "system"})
    logger.info(f"PyTorch version: {torch.__version__}", extra={"stage": "system"})
    logger.info(f"CUDA Available: {torch.cuda.is_available()}", extra={"stage": "system"})
    if torch.cuda.is_available():
        logger.info(f"GPU Device: {torch.cuda.get_device_name(0)}", extra={"stage": "system"})

    token = get_hf_token()
    try:
        logger.info(f"Loading Tokenizer for {model_id}...", extra={"stage": "system"})
        tokenizer = AutoTokenizer.from_pretrained(model_id, token=token)
        
        logger.info(f"Loading Model weights for {model_id} (auto device mapping)...", extra={"stage": "system"})
        model = AutoModelForCausalLM.from_pretrained(
            model_id,
            torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
            device_map="auto",
            attn_implementation="sdpa",
            token=token
        )
        model_loaded = True
        logger.info("Model loaded successfully into memory.", extra={"stage": "system"})
    except Exception as e:
        model_loaded = False
        logger.error(f"CRITICAL ERROR LOADING MODEL: {str(e)}", extra={"stage": "system"})

# ── 4. Request / Response Pydantic Schemas ───────────────────────────────────

class Message(BaseModel):
    role: str
    content: str

class AISettings(BaseModel):
    temperature: Optional[float] = 0.7
    maxTokens: Optional[int] = 512
    topP: Optional[float] = 1.0

class GenerateRequest(BaseModel):
    prompt: str
    history: Optional[List[Message]] = []
    systemInstruction: Optional[str] = ""
    settings: Optional[AISettings] = None

class CriticRequest(BaseModel):
    prompt: str
    response: str

class ChatCompletionRequest(BaseModel):
    messages: List[Message]
    stream: Optional[bool] = False
    temperature: Optional[float] = 0.7
    max_tokens: Optional[int] = 512

# Dependencies
def verify_model_loaded() -> None:
    if not model_loaded or model is None or tokenizer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model not loaded"
        )

# Helper: Extract or Generate Request ID
def get_request_id(request: Request) -> str:
    req_id = request.headers.get("x-request-id")
    if not req_id:
        req_id = str(uuid.uuid4())
    return req_id

# ── 5. Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health() -> Dict[str, Any]:
    if model_loaded:
        device = "cuda" if torch.cuda.is_available() else "cpu"
        return {"status": "ok", "device": device, "model_loaded": True}
    else:
        return {"status": "error", "device": "none", "model_loaded": False}

@app.get("/api/health")
async def api_health() -> Dict[str, Any]:
    return await health()

@app.post("/v1/critic", dependencies=[Depends(verify_model_loaded)])
async def run_critic(body: CriticRequest, request: Request) -> Dict[str, Any]:
    req_id = get_request_id(request)
    logger.info("Executing Critic analysis prompt...", extra={"request_id": req_id, "stage": "critic"})
    
    critic_system_prompt = (
        "You are the Core Meta-Cognitive Optimizer for an AI coding agent named Nyx. Your task is to analyze "
        "the provided chat interaction between a user and Nyx, identify structural or conceptual gaps, and generate "
        "a micro-instruction to improve Nyx's next output.\n\n"
        "Analyze the interaction based on these criteria:\n"
        "1. Did Nyx misunderstand the architecture, framework, or logic requested?\n"
        "2. Did Nyx introduce bugs, missing imports, or incomplete boilerplate code?\n"
        "3. What unstated assumptions did the user have to correct?\n\n"
        "If Nyx's response has bugs, missing imports, bad practices, or lacks critical files, formulate a rule to prevent this.\n"
        "If the response is correct, clear, and perfectly fulfills the prompt, you MUST set the \"rule\" field to \"No improvement needed\" or \"None\".\n\n"
        "Output your response strictly as a single, compact JSON object matching the requested schema:\n"
        "{\n"
        "  \"metric\": \"Specific language/framework or pattern\",\n"
        "  \"critique\": \"A brief, 1-sentence explanation of what Nyx missed or did poorly.\",\n"
        "  \"rule\": \"A highly precise, imperative instruction telling Nyx exactly how to handle this scenario next time.\"\n"
        "}"
    )

    conversation_payload = f"[USER PROMPT]:\n{body.prompt}\n\n[NYX RESPONSE]:\n{body.response}"
    
    messages = [
        {"role": "system", "content": critic_system_prompt},
        {"role": "user", "content": conversation_payload}
    ]
    
    try:
        full_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True) # type: ignore
        inputs = tokenizer(full_prompt, return_tensors="pt").to(model.device) # type: ignore
        
        with torch.no_grad():
            outputs = model.generate( # type: ignore
                **inputs,
                max_new_tokens=256,
                temperature=0.3,
                do_sample=True
            )
        
        output_tokens = outputs[0][inputs.input_ids.shape[1]:]
        response_text = tokenizer.decode(output_tokens, skip_special_tokens=True) # type: ignore
        
        logger.info("Critic analysis complete.", extra={"request_id": req_id, "stage": "critic"})
        return {"text": response_text}
    except Exception as e:
        logger.error(f"Error during Critic generation: {str(e)}", extra={"request_id": req_id, "stage": "critic"})
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")

@app.post("/v1/chat/completions", dependencies=[Depends(verify_model_loaded)], response_model=None)
async def chat_completions(body: ChatCompletionRequest, request: Request) -> Union[Dict[str, Any], StreamingResponse]:
    req_id = get_request_id(request)
    logger.info("Processing chat completions request...", extra={"request_id": req_id, "stage": "coder"})

    # Prepare chat templating
    messages = [{"role": m.role, "content": m.content} for m in body.messages]
    
    try:
        full_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True) # type: ignore
    except Exception:
        # ChatML Fallback format
        full_prompt = ""
        for m in messages:
            full_prompt += f"<|im_start|>{m['role']}\n{m['content']}<|im_end|>\n"
        full_prompt += "<|im_start|>assistant\n"

    device = model.device # type: ignore
    inputs = tokenizer(full_prompt, return_tensors="pt").to(device) # type: ignore
    temp = max(0.01, min(body.temperature or 0.7, 2.0))

    if body.stream:
        async def stream_generator() -> AsyncGenerator[str, None]:
            streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True) # type: ignore
            generation_kwargs = dict(
                inputs,
                streamer=streamer,
                max_new_tokens=body.max_tokens or 512,
                temperature=temp,
                do_sample=True if temp > 0.1 else False
            )
            thread = Thread(target=model.generate, kwargs=generation_kwargs) # type: ignore
            thread.start()

            for new_text in streamer:
                if new_text:
                    chunk = {
                        "choices": [{
                            "delta": {"content": new_text}
                        }]
                    }
                    yield f"data: {json.dumps(chunk)}\n\n"
                    await asyncio.sleep(0.001)
            yield "data: [DONE]\n\n"

        return StreamingResponse(stream_generator(), media_type="text/event-stream")
    else:
        with torch.no_grad():
            outputs = model.generate( # type: ignore
                **inputs,
                max_new_tokens=body.max_tokens or 512,
                temperature=temp,
                do_sample=True if temp > 0.1 else False
            )
        output_tokens = outputs[0][inputs.input_ids.shape[1]:]
        text = tokenizer.decode(output_tokens, skip_special_tokens=True) # type: ignore
        return {
            "choices": [{
                "message": {"role": "assistant", "content": text}
            }]
        }

# ── 6. Legacy Endpoint Compatibility (Express / Generate / Stream) ──────────

@app.post("/generate", dependencies=[Depends(verify_model_loaded)])
@app.post("/api/gemini/generate", dependencies=[Depends(verify_model_loaded)])
async def generate_legacy(body: GenerateRequest, request: Request) -> Dict[str, Any]:
    req_id = get_request_id(request)
    logger.info("Executing legacy generate request...", extra={"request_id": req_id, "stage": "coder"})
    
    system_context = body.systemInstruction or "You are Nyx, an expert AI coder."
    messages = [{"role": "system", "content": system_context}]
    if body.history:
        for m in body.history:
            messages.append({"role": "user" if m.role == "user" else "assistant", "content": m.content})
    messages.append({"role": "user", "content": body.prompt})

    try:
        full_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True) # type: ignore
    except Exception:
        full_prompt = f"<|im_start|>system\n{system_context}<|im_end|>\n"
        if body.history:
            for m in body.history:
                role = "user" if m.role == "user" else "assistant"
                full_prompt += f"<|im_start|>{role}\n{m.content}<|im_end|>\n"
        full_prompt += f"<|im_start|>user\n{body.prompt}<|im_end|>\n<|im_start|>assistant\n"

    inputs = tokenizer(full_prompt, return_tensors="pt").to(model.device) # type: ignore
    temp = max(0.01, min(body.settings.temperature if (body.settings and body.settings.temperature) else 0.7, 2.0))
    max_t = body.settings.maxTokens if (body.settings and body.settings.maxTokens) else 512

    with torch.no_grad():
        outputs = model.generate( # type: ignore
            **inputs,
            max_new_tokens=max_t,
            temperature=temp,
            do_sample=True if temp > 0.1 else False
        )
    output_tokens = outputs[0][inputs.input_ids.shape[1]:]
    response_text = tokenizer.decode(output_tokens, skip_special_tokens=True) # type: ignore
    return {"text": response_text}

@app.post("/stream", dependencies=[Depends(verify_model_loaded)])
@app.post("/api/gemini/stream", dependencies=[Depends(verify_model_loaded)])
async def stream_legacy(body: GenerateRequest, request: Request) -> StreamingResponse:
    req_id = get_request_id(request)
    logger.info("Executing legacy stream request...", extra={"request_id": req_id, "stage": "coder"})
    
    system_context = body.systemInstruction or "You are Nyx, an expert AI coder."
    messages = [{"role": "system", "content": system_context}]
    if body.history:
        for m in body.history:
            messages.append({"role": "user" if m.role == "user" else "assistant", "content": m.content})
    messages.append({"role": "user", "content": body.prompt})

    try:
        full_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True) # type: ignore
    except Exception:
        full_prompt = f"<|im_start|>system\n{system_context}<|im_end|>\n"
        if body.history:
            for m in body.history:
                role = "user" if m.role == "user" else "assistant"
                full_prompt += f"<|im_start|>{role}\n{m.content}<|im_end|>\n"
        full_prompt += f"<|im_start|>user\n{body.prompt}<|im_end|>\n<|im_start|>assistant\n"

    inputs = tokenizer(full_prompt, return_tensors="pt").to(model.device) # type: ignore
    temp = max(0.01, min(body.settings.temperature if (body.settings and body.settings.temperature) else 0.7, 2.0))
    max_t = body.settings.maxTokens if (body.settings and body.settings.maxTokens) else 256

    async def stream_generator() -> AsyncGenerator[str, None]:
        streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True) # type: ignore
        generation_kwargs = dict(
            inputs,
            streamer=streamer,
            max_new_tokens=max_t,
            temperature=temp,
            do_sample=True if temp > 0.1 else False
        )
        thread = Thread(target=model.generate, kwargs=generation_kwargs) # type: ignore
        thread.start()

        for new_text in streamer:
            if new_text:
                yield f"data: {json.dumps({'chunk': new_text})}\n\n"
                await asyncio.sleep(0.001)
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_generator(), media_type="text/event-stream")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("hf_service_fastapi:app", host="127.0.0.1", port=3002, reload=False)
