import argparse
import json
import os
import sys
import time
import traceback
import asyncio
import importlib
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
TORCH_DIRECTML = None


def detect_accelerator() -> str:
    """Detect available GPU/NPU accelerator. Fails fast if none found (CPU inference disabled)."""
    if torch.cuda.is_available():
        gpu_name = torch.cuda.get_device_name(0)
        vram_gb = torch.cuda.get_device_properties(0).total_memory / (1024 ** 3)
        print(f"[NyxNativeServer] Dedicated GPU detected: {gpu_name} ({vram_gb:.1f} GB VRAM) via CUDA.")
        return "cuda"
    if hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
        print("[NyxNativeServer] Apple Silicon GPU detected via Metal Performance Shaders (MPS).")
        return "mps"
    global TORCH_DIRECTML
    try:
        TORCH_DIRECTML = importlib.import_module("torch_directml")
        if hasattr(TORCH_DIRECTML, "is_available") and TORCH_DIRECTML.is_available():
            print("[NyxNativeServer] iGPU/dGPU detected via DirectML.")
            return "directml"
    except ImportError:
        TORCH_DIRECTML = None
        pass

    print("[NyxNativeServer] FATAL: No GPU (CUDA/MPS/DirectML) or NPU detected on this system.", file=sys.stderr)
    print("[NyxNativeServer] NYX local inference is GPU-only. CPU inference is disabled.", file=sys.stderr)
    sys.exit(1)


DEVICE = detect_accelerator()


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


def is_diffusers_subcomponent(path: str) -> bool:
    """Return True if path is a sub-folder of a Diffusers pipeline (e.g. text_encoder, vae)."""
    basename = os.path.basename(os.path.normpath(path)).lower()
    if basename in _DIFFUSERS_SUBCOMPONENT_NAMES:
        return True

    parent = os.path.dirname(os.path.abspath(path))
    parent_model_index = os.path.join(parent, "model_index.json")
    if os.path.exists(parent_model_index):
        return True

    if os.path.isdir(path):
        config_path = os.path.join(path, "config.json")
        if os.path.exists(config_path):
            try:
                with open(config_path, "r", encoding="utf-8") as f:
                    cfg = json.load(f)
                if "model_type" not in cfg:
                    return True
            except Exception:
                pass
        elif not (config_path and os.path.exists(config_path)):
            return True

    return False


def load_native_model(model_path: str, repo_id: Optional[str] = None, gpu_layers: int = 99, cpu_threads: int = 4):
    global GLOBAL_MODEL, GLOBAL_TOKENIZER, GLOBAL_MODEL_ID, DEVICE
    GLOBAL_MODEL_ID = os.path.basename(model_path)

    if gpu_layers <= 0:
        print("[NyxNativeServer] FATAL: gpu_layers <= 0 passed, but CPU inference is disabled in NYX.", file=sys.stderr)
        sys.exit(1)

    if cpu_threads and cpu_threads > 0:
        try:
            torch.set_num_threads(cpu_threads)
            print(f"[NyxNativeServer] Configured PyTorch helper threads: {cpu_threads}")
        except Exception as e:
            print(f"[NyxNativeServer] Warning setting helper threads: {e}", file=sys.stderr)

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

    # Determine GPU precision
    if DEVICE == "cuda":
        dtype = torch.bfloat16 if torch.cuda.is_bf16_supported() else torch.float16
    else:
        dtype = torch.float16

    print(f"[NyxNativeServer] Target Accelerator: {DEVICE} | Precision: {dtype}")

    # Detect Diffusers pipeline subcomponents — warn but do not exit
    if os.path.isdir(model_path) and is_diffusers_subcomponent(model_path):
        folder_name = os.path.basename(os.path.normpath(model_path))
        print(
            f"[NyxNativeServer] WARNING: '{folder_name}' is a Diffusers pipeline subcomponent, not a standalone model.",
            file=sys.stderr,
        )

    # Check if config.json exists or repo_id is supplied
    if not config_dir and not repo_id and not os.path.isdir(model_path):
        print(f"[NyxNativeServer] ERROR: Missing 'config.json' for standalone file '{model_path}'. Ensure config.json is present in the model directory or download via HF Explorer.", file=sys.stderr)
        sys.exit(1)

    try:
        print(f"[NyxNativeServer] Loading model 100% on GPU ({DEVICE})...")
        if DEVICE == "cuda":
            max_memory = None
            try:
                # Windows WDDM Shared GPU Memory support:
                # Accelerate's device_map="auto" bounds GPU memory to physical free VRAM by default.
                # By providing max_memory that includes Windows WDDM Shared GPU Memory budget (up to 50% system RAM),
                # large models remain 100% GPU accelerated across dedicated VRAM + shared system memory.
                free_vram, _ = torch.cuda.mem_get_info(0)
                try:
                    import psutil
                    sys_ram = psutil.virtual_memory()
                    shared_gpu_budget = int(min(sys_ram.total * 0.5, max(0, sys_ram.available - 1024 * 1024 * 1024)))
                except Exception:
                    shared_gpu_budget = 4 * 1024 * 1024 * 1024  # 4GB conservative fallback
                total_gpu_capacity = free_vram + shared_gpu_budget
                gpu_budget_mib = max(1024, (total_gpu_capacity // (1024 * 1024)) - 256)
                max_memory = {0: f"{gpu_budget_mib}MiB"}
                print(f"[NyxNativeServer] GPU memory budget configured: dedicated={free_vram // (1024*1024)}MB, shared={shared_gpu_budget // (1024*1024)}MB, max_memory={gpu_budget_mib}MiB")
            except Exception as mem_err:
                print(f"[NyxNativeServer] Shared GPU memory calculation notice: {mem_err}")

            load_kwargs = {
                "torch_dtype": dtype,
                "trust_remote_code": True,
                "low_cpu_mem_usage": True,
                "device_map": "auto",
            }
            if max_memory:
                load_kwargs["max_memory"] = max_memory

            GLOBAL_MODEL = load_model_with_fallbacks(
                model_source,
                **load_kwargs,
            )
        elif DEVICE == "directml":
            if TORCH_DIRECTML is None:
                raise RuntimeError("DirectML accelerator was selected but torch-directml is unavailable")
            dml = TORCH_DIRECTML.device()
            raw_model = load_model_with_fallbacks(
                model_source,
                torch_dtype=dtype,
                trust_remote_code=True,
                low_cpu_mem_usage=True,
            )
            GLOBAL_MODEL = raw_model.to(dml)
        else:
            GLOBAL_MODEL = load_model_with_fallbacks(
                model_source,
                torch_dtype=dtype,
                trust_remote_code=True,
                low_cpu_mem_usage=True,
                device_map="auto",
            )

        print(f"[NyxNativeServer] Model successfully loaded on GPU ({DEVICE}) with 100% layer acceleration.")
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
