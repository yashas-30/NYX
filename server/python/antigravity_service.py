import os
import uvicorn
import argparse
import json
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

# The Antigravity SDK

app = FastAPI()

@app.get("/health")
def health():
    return {"status": "ok"}

@app.post("/list")
def list_models():
    return {"models": ["antigravity/local-model", "antigravity/cloud-model"]}

@app.post("/quota")
def quota():
    return {"status": "ok", "local": True}

import google.generativeai as genai

async def generate_with_sdk(prompt: str, model: str, api_key: str):
    print(f"[Antigravity SDK] Checking prompt: {prompt[:50]}...")
    
    try:
        genai.configure(api_key=api_key or os.environ.get("GEMINI_API_KEY", ""))
        
        # Route to the appropriate Gemini model
        actual_model = model
        if "gemini" in model.lower() or "gemma" in model.lower():
            # Optimize routing for cloud models
            actual_model = "gemini-1.5-pro-latest"
            
        print(f"[Antigravity] Optimized routing for {model} -> {actual_model}")
        
        gemini = genai.GenerativeModel(actual_model)
        
        # Send prefix
        yield f"data: {{ \"chunk\": \"[Antigravity SDK Routed to: {model}]\\n\" }}\n\n"
        
        response = await gemini.generate_content_async(
            f"Optimize and answer: {prompt}",
            stream=True
        )
        
        async for chunk in response:
            text = chunk.text
            words = text.split(' ')
            for i, word in enumerate(words):
                await asyncio.sleep(0.01)
                yield f"data: {{ \"chunk\": {json.dumps(word + (' ' if i < len(words)-1 else ''))} }}\n\n"
                
    except Exception as e:
        print(f"[Antigravity SDK Error] {e}")
        yield f"data: {{ \"chunk\": \"Error from Antigravity SDK: {str(e)}\" }}\n\n"
        
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
    
    print("[Antigravity Service] READY")
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")
