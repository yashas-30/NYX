import argparse
import json
import os
import sys
import time
import traceback
import asyncio
from typing import AsyncGenerator, Dict, Any, List, Optional

try:
    import torch
    from transformers import (
        AutoTokenizer,
        AutoModelForCausalLM,
        AutoModel,
        TextIteratorStreamer,
        AutoConfig,
    )
    import uvicorn
    from fastapi import FastAPI, Request, HTTPException
    from fastapi.responses import StreamingResponse, JSONResponse
    from fastapi.middleware.cors import CORSMiddleware
    from threading import Thread
except ImportError as e:
    print(f"[NyxNativeServer] Missing required dependency: {e}", file=sys.stderr)
    traceback.print_exc(file=sys.stderr)
    sys.exit(1)

# Optional classes — only available in newer transformers versions
try:
    from transformers import AutoModelForVision2Seq
except ImportError:
    AutoModelForVision2Seq = None  # type: ignore

try:
    from transformers import AutoModelForSeq2SeqLM
except ImportError:
    AutoModelForSeq2SeqLM = None  # type: ignore



def load_model_with_fallbacks(model_source: str, **kwargs):
    loaders = [
        AutoModelForCausalLM,
        AutoModelForVision2Seq,
        AutoModelForSeq2SeqLM,
        AutoModel,
    ]
    last_err = None
    for loader in loaders:
        if loader is None:
            continue  # not available in this transformers version
        try:
            return loader.from_pretrained(model_source, **kwargs)
        except Exception as e:
            last_err = e
    if last_err:
        raise last_err

app = FastAPI(title="NYX Native Model Server")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GLOBAL_MODEL = None
GLOBAL_TOKENIZER = None
GLOBAL_MODEL_ID = "nyx-native-model"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"


def find_model_config_dir(model_path: str) -> Optional[str]:
    """Resolve directory containing config.json for single-file or directory models."""
    if os.path.isdir(model_path):
        if os.path.exists(os.path.join(model_path, "config.json")):
            return model_path
        return model_path
    
    parent_dir = os.path.dirname(os.path.abspath(model_path))
    if os.path.exists(os.path.join(parent_dir, "config.json")):
        return parent_dir
    
    grandparent = os.path.dirname(parent_dir)
    if os.path.exists(os.path.join(grandparent, "config.json")):
        return grandparent

    return None


# Diffusers pipeline subcomponent folder names — these are NOT standalone LLMs
_DIFFUSERS_SUBCOMPONENT_NAMES = {
    "text_encoder", "text_encoder_2", "text_encoder_3",
    "vae", "vae_encoder", "vae_decoder",
    "unet", "transformer", "transformer_2",
    "scheduler", "tokenizer", "tokenizer_2", "tokenizer_3",
    "feature_extractor", "safety_checker", "image_encoder",
}


def is_diffusers_subcomponent(model_path: str) -> bool:
    """
    Returns True if model_path is a Diffusers pipeline subcomponent directory
    that cannot be loaded as a standalone text-generation model.
    Detects this by:
      1. Folder name is a known subcomponent name, OR
      2. config.json exists with _class_name / _diffusers_version but no model_type.
    """
    folder_name = os.path.basename(os.path.normpath(model_path))
    config_path = os.path.join(model_path, "config.json") if os.path.isdir(model_path) else None

    # Check config.json content first — definitive signal
    if config_path and os.path.exists(config_path):
        try:
            with open(config_path, "r", encoding="utf-8") as f:
                cfg = json.load(f)
            has_model_type = "model_type" in cfg
            has_diffusers_marker = "_class_name" in cfg or "_diffusers_version" in cfg
            if has_diffusers_marker and not has_model_type:
                return True
        except Exception:
            pass

    # Fallback: known subcomponent name AND no model_type in config
    if folder_name.lower() in _DIFFUSERS_SUBCOMPONENT_NAMES:
        if config_path and os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                if "model_type" not in cfg:
                    return True
            except Exception:
                pass
        elif not (config_path and os.path.exists(config_path)):
            # No config at all + known subcomponent name = definitely a subcomponent
            return True

    return False


def load_native_model(model_path: str, repo_id: Optional[str] = None, gpu_layers: int = 99, cpu_threads: int = 4):
    global GLOBAL_MODEL, GLOBAL_TOKENIZER, GLOBAL_MODEL_ID, DEVICE
    GLOBAL_MODEL_ID = os.path.basename(model_path)

    if cpu_threads and cpu_threads > 0:
        try:
            torch.set_num_threads(cpu_threads)
            print(f"[NyxNativeServer] Configured PyTorch CPU threads: {cpu_threads}")
        except Exception as e:
            print(f"[NyxNativeServer] Warning setting CPU threads: {e}", file=sys.stderr)

    config_dir = find_model_config_dir(model_path)
    model_source = config_dir if config_dir else (repo_id if repo_id else model_path)
    print(f"[NyxNativeServer] Resolving model source: {model_source} (target path: {model_path}, repo_id: {repo_id})")

    # Load tokenizer from model_source or repo_id
    try:
        GLOBAL_TOKENIZER = AutoTokenizer.from_pretrained(model_source, trust_remote_code=True)
        print("[NyxNativeServer] Tokenizer loaded successfully.")
    except Exception as e:
        print(f"[NyxNativeServer] Primary tokenizer load failed: {e}", file=sys.stderr)
        if repo_id and repo_id != model_source:
            try:
                print(f"[NyxNativeServer] Trying tokenizer from repo_id '{repo_id}'...")
                GLOBAL_TOKENIZER = AutoTokenizer.from_pretrained(repo_id, trust_remote_code=True)
            except Exception as e2:
                print(f"[NyxNativeServer] Failed to load tokenizer from repo_id: {e2}. Falling back to 'gpt2'...", file=sys.stderr)
                try:
                    GLOBAL_TOKENIZER = AutoTokenizer.from_pretrained("gpt2")
                except Exception:
                    GLOBAL_TOKENIZER = None
        else:
            print("[NyxNativeServer] Falling back to 'gpt2' tokenizer...", file=sys.stderr)
            try:
                GLOBAL_TOKENIZER = AutoTokenizer.from_pretrained("gpt2")
            except Exception:
                GLOBAL_TOKENIZER = None

    if GLOBAL_TOKENIZER and GLOBAL_TOKENIZER.pad_token is None:
        GLOBAL_TOKENIZER.pad_token = GLOBAL_TOKENIZER.eos_token

    # Determine CPU/GPU Layer Splitting & Offloading
    cuda_available = torch.cuda.is_available()
    print(f"[NyxNativeServer] CUDA Available: {cuda_available} | Requested GPU Layers: {gpu_layers}")

    dtype = torch.float16 if cuda_available else torch.float32

    # Detect Diffusers pipeline subcomponents — warn but do not exit
    if os.path.isdir(model_path) and is_diffusers_subcomponent(model_path):
        folder_name = os.path.basename(os.path.normpath(model_path))
        print(
            f"[NyxNativeServer] WARNING: '{folder_name}' is a Diffusers pipeline subcomponent, not a standalone model. "
            f"Loading anyway in fallback mode...",
            file=sys.stderr,
        )

    # Check if config.json exists or repo_id is supplied
    if not config_dir and not repo_id and not os.path.isdir(model_path):
        print(f"[NyxNativeServer] ERROR: Missing 'config.json' for standalone file '{model_path}'. Ensure config.json is present in the model directory or download via HF Explorer.", file=sys.stderr)
        sys.exit(1)

    try:
        if cuda_available and gpu_layers > 0:
            total_vram_bytes = torch.cuda.get_device_properties(0).total_memory
            total_vram_mb = int(total_vram_bytes / (1024 * 1024))
            
            gpu_ratio = min(float(gpu_layers) / 32.0, 1.0) if gpu_layers < 99 else 1.0
            allocated_gpu_mb = int(total_vram_mb * gpu_ratio * 0.88)

            offload_dir = os.path.join(os.path.dirname(os.path.abspath(model_path)), ".nyx_offload")
            os.makedirs(offload_dir, exist_ok=True)

            print(f"[NyxNativeServer] CPU/GPU Layer Offloading Active -> VRAM Limit: {allocated_gpu_mb} MB / {total_vram_mb} MB | CPU Offload Enabled.")

            max_memory = {0: f"{allocated_gpu_mb}MB", "cpu": "64GB"}
            
            try:
                GLOBAL_MODEL = load_model_with_fallbacks(
                    model_source,
                    torch_dtype=dtype,
                    trust_remote_code=True,
                    low_cpu_mem_usage=True,
                    device_map="auto",
                    max_memory=max_memory,
                    offload_folder=offload_dir,
                )
                DEVICE = "cuda"
            except Exception as gpu_err:
                print(f"[NyxNativeServer] GPU offloading failed ({gpu_err}). Falling back to CPU RAM loading...", file=sys.stderr)
                traceback.print_exc(file=sys.stderr)
                GLOBAL_MODEL = load_model_with_fallbacks(
                    model_source,
                    torch_dtype=torch.float32,
                    trust_remote_code=True,
                    low_cpu_mem_usage=True,
                    device_map="cpu",
                )
                DEVICE = "cpu"
        else:
            print("[NyxNativeServer] Loading model on CPU...")
            GLOBAL_MODEL = load_model_with_fallbacks(
                model_source,
                torch_dtype=torch.float32,
                trust_remote_code=True,
                low_cpu_mem_usage=True,
                device_map="cpu",
            )
            DEVICE = "cpu"

        print(f"[NyxNativeServer] Model successfully loaded on device: {DEVICE}.")
    except OSError as os_err:
        err_msg = str(os_err)
        print(f"[NyxNativeServer] OSError loading model from '{model_source}': {err_msg}", file=sys.stderr)
        if "Repo id" in err_msg or "config.json" in err_msg:
            print(f"[NyxNativeServer] Hint: Could not load '{model_path}' as a PyTorch text CausalLM. Ensure 'config.json' is present in model directory. If this is an image model (e.g. SD/FLUX), select it under Image Generation.", file=sys.stderr)
        sys.exit(1)
    except Exception as e:
        print(f"[NyxNativeServer] ERROR loading model '{model_path}': {e}", file=sys.stderr)
        traceback.print_exc(file=sys.stderr)
        sys.exit(1)


@app.get("/v1/models")
@app.get("/health")
async def health():
    return JSONResponse({
        "status": "ok",
        "data": [{"id": GLOBAL_MODEL_ID, "object": "model", "owned_by": "nyx-native"}]
    })


MODEL_LOCK = asyncio.Lock()

@app.post("/v1/chat/completions")
async def chat_completions(request: Request):
    body = await request.json()
    messages: List[Dict[str, Any]] = body.get("messages", [])
    stream: bool = body.get("stream", False)
    temperature: float = body.get("temperature", 0.7)
    max_tokens: int = body.get("max_tokens", 2048)

    if not GLOBAL_MODEL:
        raise HTTPException(status_code=500, detail="Model is not loaded")
    if not GLOBAL_TOKENIZER:
        raise HTTPException(status_code=500, detail="Tokenizer is not loaded for this model")

    # If the model does not support text generation (e.g. it is a CLIPTextModel / T5EncoderModel / AutoModel), return a clear notice instead of crashing.
    if not hasattr(GLOBAL_MODEL, "generate"):
        async def generate_mock_sse() -> AsyncGenerator[str, None]:
            req_id = f"chatcmpl-native-{int(time.time()*1000)}"
            created = int(time.time())
            msg = f"[NyxNativeServer] This model ({GLOBAL_MODEL_ID}) was loaded using AutoModel, but it does not support text generation (e.g. it is a Text Encoder or Embedder, not a CausalLM)."
            chunk = {
                "id": req_id,
                "object": "chat.completion.chunk",
                "created": created,
                "model": GLOBAL_MODEL_ID,
                "choices": [{"index": 0, "delta": {"content": msg}, "finish_reason": "stop"}]
            }
            yield f"data: {json.dumps(chunk)}\n\n"
            yield "data: [DONE]\n\n"

        if stream:
            return StreamingResponse(generate_mock_sse(), media_type="text/event-stream")
        else:
            return JSONResponse({
                "id": f"chatcmpl-native-{int(time.time()*1000)}",
                "object": "chat.completion",
                "created": int(time.time()),
                "model": GLOBAL_MODEL_ID,
                "choices": [{
                    "index": 0,
                    "message": {"role": "assistant", "content": f"[NyxNativeServer] This model ({GLOBAL_MODEL_ID}) does not support text generation (e.g. it is a Text Encoder or Embedder)."},
                    "finish_reason": "stop"
                }]
            })

    prompt = ""
    if hasattr(GLOBAL_TOKENIZER, "apply_chat_template") and GLOBAL_TOKENIZER.chat_template:
        try:
            prompt = GLOBAL_TOKENIZER.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
        except Exception:
            prompt = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages]) + "\nassistant:"
    else:
        prompt = "\n".join([f"{m.get('role', 'user')}: {m.get('content', '')}" for m in messages]) + "\nassistant:"

    try:
        target_device = next(GLOBAL_MODEL.parameters()).device
    except Exception:
        target_device = DEVICE

    inputs = GLOBAL_TOKENIZER(prompt, return_tensors="pt").to(target_device)

    if stream and GLOBAL_TOKENIZER:
        streamer = TextIteratorStreamer(GLOBAL_TOKENIZER, skip_prompt=True, skip_special_tokens=True)
        generation_kwargs = dict(
            **inputs,
            streamer=streamer,
            max_new_tokens=max_tokens,
            temperature=max(temperature, 0.01),
            do_sample=temperature > 0,
        )
        
        def run_generation():
            try:
                GLOBAL_MODEL.generate(**generation_kwargs)
            except Exception as e:
                print(f"[NyxNativeServer] Generation error: {e}", file=sys.stderr)
            finally:
                if hasattr(streamer, "end"):
                    streamer.end()

        thread = Thread(target=run_generation)
        thread.start()

        async def generate_sse() -> AsyncGenerator[str, None]:
            async with MODEL_LOCK:
                req_id = f"chatcmpl-native-{int(time.time()*1000)}"
                created = int(time.time())

                first_chunk = {
                    "id": req_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": GLOBAL_MODEL_ID,
                    "choices": [{"index": 0, "delta": {"role": "assistant"}, "finish_reason": None}]
                }
                yield f"data: {json.dumps(first_chunk)}\n\n"

                streamer_iter = iter(streamer)
                while True:
                    new_text = await asyncio.to_thread(next, streamer_iter, None)
                    if new_text is None:
                        break
                    if new_text:
                        chunk = {
                            "id": req_id,
                            "object": "chat.completion.chunk",
                            "created": created,
                            "model": GLOBAL_MODEL_ID,
                            "choices": [{"index": 0, "delta": {"content": new_text}, "finish_reason": None}]
                        }
                        yield f"data: {json.dumps(chunk)}\n\n"

                final_chunk = {
                    "id": req_id,
                    "object": "chat.completion.chunk",
                    "created": created,
                    "model": GLOBAL_MODEL_ID,
                    "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}]
                }
                yield f"data: {json.dumps(final_chunk)}\n\n"
                yield "data: [DONE]\n\n"
            yield f"data: {json.dumps(final_chunk)}\n\n"
            yield "data: [DONE]\n\n"

        return StreamingResponse(generate_sse(), media_type="text/event-stream")

    else:
        try:
            with torch.no_grad():
                outputs = GLOBAL_MODEL.generate(
                    **inputs,
                    max_new_tokens=max_tokens,
                    temperature=max(temperature, 0.01),
                    do_sample=temperature > 0,
                )
            response_tokens = outputs[0][inputs["input_ids"].shape[1]:]
            response_text = GLOBAL_TOKENIZER.decode(response_tokens, skip_special_tokens=True) if GLOBAL_TOKENIZER else "Generated output."
        except Exception as e:
            response_text = f"[NyxNativeServer] Generation failed: {e}"
            response_tokens = []

        return JSONResponse({
            "id": f"chatcmpl-native-{int(time.time()*1000)}",
            "object": "chat.completion",
            "created": int(time.time()),
            "model": GLOBAL_MODEL_ID,
            "choices": [{
                "index": 0,
                "message": {"role": "assistant", "content": response_text},
                "finish_reason": "stop"
            }],
            "usage": {
                "prompt_tokens": len(inputs["input_ids"][0]) if "input_ids" in inputs else 0,
                "completion_tokens": len(response_tokens),
                "total_tokens": (len(inputs["input_ids"][0]) if "input_ids" in inputs else 0) + len(response_tokens)
            }
        })


def main():
    parser = argparse.ArgumentParser(description="NYX Native Model Server")
    parser.add_argument("--model_path", type=str, required=True, help="Path to non-GGUF model file or directory")
    parser.add_argument("--repo_id", type=str, default=None, help="Hugging Face repo ID if config.json is missing locally")
    parser.add_argument("--port", type=int, default=8089, help="Port to run HTTP server on")
    parser.add_argument("--gpu_layers", type=int, default=99, help="Number of layers to offload to GPU (-ngl)")
    parser.add_argument("--cpu_threads", type=int, default=4, help="Number of PyTorch CPU threads")
    args = parser.parse_args()

    load_native_model(args.model_path, repo_id=args.repo_id, gpu_layers=args.gpu_layers, cpu_threads=args.cpu_threads)
    uvicorn.run(app, host="127.0.0.1", port=args.port, log_level="info")


if __name__ == "__main__":
    main()
