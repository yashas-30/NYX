import os
import uvicorn
import argparse
import json
import asyncio
import random
import uuid
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

# The Antigravity SDK - Refactored as a Prompt Preprocessing Middleware

app = FastAPI()

# Check for google-genai availability safely (new unified SDK)
HAS_GENAI = False
try:
    from google import genai
    HAS_GENAI = True
except ImportError:
    print("[Antigravity SDK] warning: google-genai package not found. AI preprocessing falls back to standard instructions.")

# Default model — use the latest fast Gemini model
DEFAULT_GENAI_MODEL = os.environ.get("ANTIGRAVITY_MODEL", "gemini-2.5-flash")

OPTIMIZATION_TEMPLATES = {
    "coding": [
        {
            "version": "v1-strict",
            "instruction": (
                "You are an expert prompt engineer specializing in coding tasks. "
                "Rewrite the user's prompt to be explicit, modular, and optimized for an AI coding agent. "
                "Include requirements for robust error handling, type safety, and clean architecture. "
                "Return ONLY the rewritten prompt without conversational filler."
            )
        },
        {
            "version": "v2-creative",
            "instruction": (
                "You are an AI prompt optimizer for software engineering. "
                "Expand the user's coding prompt by adding best practices, suggesting design patterns, "
                "and structuring it into clear steps. "
                "Return ONLY the rewritten prompt."
            )
        }
    ],
    "creative": [
        {
            "version": "v1-storyteller",
            "instruction": (
                "You are a prompt optimizer for creative writing. "
                "Enhance the user's prompt by adding vivid details, character motivations, and sensory language. "
                "Return ONLY the rewritten prompt."
            )
        }
    ],
    "general": [
        {
            "version": "v1-clarity",
            "instruction": (
                "You are a prompt optimizer. Rewrite the user's prompt to maximize clarity, logical structure, and detail. "
                "Ensure the intent is unambiguous. Return ONLY the rewritten prompt."
            )
        },
        {
            "version": "v2-structured",
            "instruction": (
                "You are a prompt structurer. Convert the user's prompt into a bulleted list of precise instructions and constraints. "
                "Return ONLY the rewritten prompt."
            )
        }
    ]
}

@app.get("/health")
def health():
    return {"status": "ok", "genai_available": HAS_GENAI, "default_model": DEFAULT_GENAI_MODEL}

@app.post("/list")
def list_models():
    return {"models": ["antigravity/local-model", "antigravity/cloud-model"]}

@app.post("/quota")
def quota():
    return {"status": "ok", "local": True}

@app.post("/preprocess")
async def preprocess(request: Request):
    try:
        data = await request.json()
        prompt = data.get("prompt", "")
        api_key = data.get("apiKey", "")
        domain = data.get("domain", "general")
        model = data.get("model", "")
        
        if domain not in OPTIMIZATION_TEMPLATES:
            domain = "general"

        template = random.choice(OPTIMIZATION_TEMPLATES[domain])
        version = template["version"]
        instruction = template["instruction"] + f"\n\nUser Prompt: {prompt}"
        
        optimized_prompt = f"Optimize and answer: {prompt}"
        
        if HAS_GENAI:
            key = api_key or os.environ.get("GEMINI_API_KEY", "") or os.environ.get("ANTIGRAVITY_API_KEY", "")
            if key:
                try:
                    actual_model = model if model and model != "unknown" else DEFAULT_GENAI_MODEL
                    client = genai.Client(api_key=key)
                    response = await client.aio.models.generate_content(
                        model=actual_model,
                        contents=instruction
                    )
                    if response.text:
                        optimized_prompt = response.text.strip()
                except Exception as e:
                    print(f"[Antigravity SDK Preprocess Warning] Optimization failed: {e}. Falling back to default.")
            else:
                print("[Antigravity SDK Preprocess Warning] No API key available for prompt optimization. Falling back to default.")
        else:
            print("[Antigravity SDK Preprocess Warning] google-genai not installed. Falling back to default.")
            
        print(f"[Antigravity SDK] Prompt preprocessed successfully (domain: {domain}, version: {version}).")
        return {
            "prompt": optimized_prompt,
            "domain": domain,
            "version": version
        }
    except Exception as e:
        print(f"[Antigravity SDK Preprocess Error] {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

async def generate_with_sdk(prompt: str, model: str, api_key: str):
    print(f"[Antigravity SDK] Generating for model: {model}, prompt: {prompt[:60]}...")
    
    try:
        if not HAS_GENAI:
            raise Exception("google-genai package not installed. Run: pip install google-genai")

        key = api_key or os.environ.get("GEMINI_API_KEY", "") or os.environ.get("ANTIGRAVITY_API_KEY", "")
        if not key:
            raise Exception("No API key provided. Pass apiKey in request body or set GEMINI_API_KEY env var.")

        client = genai.Client(api_key=key)
        
        # Use requested model if valid, fall back to default
        actual_model = model if model and model != "unknown" else DEFAULT_GENAI_MODEL
        print(f"[Antigravity SDK] Routing to model: {actual_model}")
        
        response = await client.aio.models.generate_content_stream(
            model=actual_model,
            contents=prompt
        )
        
        async for chunk in response:
            if chunk.text:
                yield f"data: {json.dumps({'chunk': chunk.text})}\n\n"
                
    except Exception as e:
        print(f"[Antigravity SDK Error] {e}")
        yield f"data: {json.dumps({'error': str(e)})}\n\n"
        
    yield "data: [DONE]\n\n"

@app.post("/generate")
async def generate(request: Request):
    data = await request.json()
    prompt = data.get("prompt", "")
    model = data.get("model", "unknown")
    api_key = data.get("apiKey", "")
    
    print(f"[Antigravity] Routing request to SDK agent with model {model}")
    return StreamingResponse(generate_with_sdk(prompt, model, api_key), media_type="text/event-stream")

if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=3003)
    args = parser.parse_args()
    
    import sys
    import threading
    def monitor_parent():
        try:
            sys.stdin.read()
        except Exception:
            pass
        print("[Antigravity Service] Parent process died, exiting...")
        os._exit(0)
    threading.Thread(target=monitor_parent, daemon=True).start()

    print(f"[Antigravity Service] READY — model: {DEFAULT_GENAI_MODEL}, genai: {HAS_GENAI}")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
