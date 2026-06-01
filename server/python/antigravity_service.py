import os
import uvicorn
import argparse
import json
import asyncio
from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse, StreamingResponse

# The Antigravity SDK - Refactored as a Prompt Preprocessing Middleware

app = FastAPI()

# Check for google-generativeai availability safely
HAS_GENAI = False
try:
    import google.generativeai as genai
    HAS_GENAI = True
except ImportError:
    print("[Antigravity SDK] warning: google-generativeai package not found. AI preprocessing falls back to standard instructions.")

@app.get("/health")
def health():
    return {"status": "ok"}

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
        
        # Default fallback optimization prefix
        optimized_prompt = f"Optimize and answer: {prompt}"
        
        if HAS_GENAI:
            key = api_key or os.environ.get("GEMINI_API_KEY", "")
            if key:
                try:
                    genai.configure(api_key=key)
                    # Use gemini-1.5-flash for fast prompt preprocessing
                    model = genai.GenerativeModel("gemini-1.5-flash")
                    
                    instruction = (
                        "You are a prompt optimization expert. Your task is to rewrite the user's prompt "
                        "to be highly detailed, explicit, structured, and optimized for an AI coding agent. "
                        "Incorporate technical details, specify standard coding practices (like error handling, type safety, modular design), "
                        "and structure it clearly. Return ONLY the rewritten prompt. Do not add any conversational text or formatting outside the prompt itself.\n\n"
                        f"User Prompt: {prompt}"
                    )
                    
                    # Call async generator
                    response = await model.generate_content_async(instruction)
                    if response.text:
                        optimized_prompt = response.text.strip()
                except Exception as e:
                    print(f"[Antigravity SDK Preprocess Warning] Optimization failed: {e}. Falling back to default.")
            else:
                print("[Antigravity SDK Preprocess Warning] No API key available for prompt optimization. Falling back to default.")
        else:
            print("[Antigravity SDK Preprocess Warning] google-generativeai not installed. Falling back to default.")
            
        print("[Antigravity SDK] Prompt preprocessed successfully.")
        return {"prompt": optimized_prompt}
    except Exception as e:
        print(f"[Antigravity SDK Preprocess Error] {e}")
        return JSONResponse(status_code=500, content={"error": str(e)})

async def generate_with_sdk(prompt: str, model: str, api_key: str):
    print(f"[Antigravity SDK] Checking prompt: {prompt[:50]}...")
    
    try:
        if not HAS_GENAI:
            raise Exception("google-generativeai package not installed")

        genai.configure(api_key=api_key or os.environ.get("GEMINI_API_KEY", ""))
        
        # Route to requested model (no longer hardcoding gemini-1.5-pro-latest unless empty/unspecified)
        actual_model = model if model and model != "unknown" else "gemini-1.5-pro"
        print(f"[Antigravity] Routing for model: {actual_model}")
        
        gemini = genai.GenerativeModel(actual_model)
        
        # Send prefix
        yield f"data: {{ \"chunk\": \"[Antigravity SDK Routed to: {actual_model}]\\n\" }}\n\n"
        
        response = await gemini.generate_content_async(
            prompt,
            stream=True
        )
        
        # Directly yield chunks without arbitrary 10ms delays
        async for chunk in response:
            if chunk.text:
                yield f"data: {{ \"chunk\": {json.dumps(chunk.text)} }}\n\n"
                
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
