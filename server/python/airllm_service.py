#!/usr/bin/env python3
import sys
import os
import json
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import time

# ── 1. Dependency Resolution & Initialization ────────────────────────────────
print("[AirLLM Server] Initializing dependencies...")
try:
    import torch
    from transformers import AutoTokenizer
    # airllm will be imported lazily or here
    from airllm import AutoModel
    print("[AirLLM Server] torch, transformers, and airllm imported successfully.")
except ImportError as e:
    print(f"\n[AirLLM Server] CRITICAL ERROR: Missing dependency: {e}", file=sys.stderr)
    print("[AirLLM Server] Please run: pip install torch transformers airllm accelerate bitsandbytes", file=sys.stderr)
    sys.exit(1)

# Resolve HF Token
def get_hf_token():
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

# Global state
model = None
tokenizer = None
model_id = ""
model_loaded = False

# ── 2. Request Handling Class ────────────────────────────────────────────────
class AirLLMHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Mute normal access logging to prevent clogging the NYX logs panel
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type, Authorization')
        self.end_headers()

    def do_GET(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Content-Type', 'application/json')
        self.end_headers()

        if self.path in ('/health', '/api/health'):
            res = {
                "status": "ok" if model_loaded else "starting",
                "device": "cuda" if torch.cuda.is_available() else "cpu",
                "model_loaded": model_loaded,
                "model": model_id
            }
        else:
            res = {"status": "error", "message": "Endpoint not found"}
        
        self.wfile.write(json.dumps(res).encode('utf-8'))

    def do_POST(self):
        if self.path in ('/v1/chat/completions', '/api/gemini/stream', '/stream'):
            content_length = int(self.headers.get('Content-Length', 0))
            post_data = self.rfile.read(content_length)
            
            try:
                req_body = json.loads(post_data.decode('utf-8'))
            except Exception:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Invalid JSON")
                return

            if not model_loaded or model is None or tokenizer is None:
                self.send_response(503)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": "Model is not loaded yet."}).encode('utf-8'))
                return

            # Support legacy non-chat fields if any, otherwise standard chat formats
            messages = req_body.get('messages', [])
            prompt = req_body.get('prompt', '')
            
            # If a simple prompt is passed (legacy API), build a standard message list
            if not messages and prompt:
                system_instruction = req_body.get('systemInstruction', 'You are NYX, a professional software engineer.')
                messages = [
                    {"role": "system", "content": system_instruction}
                ]
                history = req_body.get('history', [])
                for m in history:
                    r = m.get('role', 'user')
                    messages.append({"role": "user" if r == 'user' else "assistant", "content": m.get('content', '')})
                messages.append({"role": "user", "content": prompt})

            stream = req_body.get('stream', True)
            temperature = req_body.get('temperature', req_body.get('settings', {}).get('temperature', 0.1))
            max_tokens = req_body.get('max_tokens', req_body.get('settings', {}).get('maxTokens', 512))

            # Keep values safe for HF transformers
            temperature = max(0.01, min(temperature, 2.0))
            max_tokens = int(max_tokens) if max_tokens else 512

            # Formulate chat format
            try:
                full_prompt = tokenizer.apply_chat_template(messages, tokenize=False, add_generation_prompt=True)
            except Exception:
                # ChatML fallback
                full_prompt = ""
                for m in messages:
                    role = m.get('role', 'user')
                    content = m.get('content', '')
                    full_prompt += f"<|im_start|>{role}\n{content}<|im_end|>\n"
                full_prompt += "<|im_start|>assistant\n"

            print(f"[AirLLM Server] Tokenizing prompt context (Length: {len(full_prompt)} chars)...")
            device = "cuda" if torch.cuda.is_available() else "cpu"
            
            try:
                input_tokens = tokenizer(full_prompt, return_tensors="pt", return_attention_mask=False, truncation=True)
                input_ids = input_tokens['input_ids'].to(device)
            except Exception as tokenize_err:
                print(f"[AirLLM Server] Tokenization failed: {tokenize_err}", file=sys.stderr)
                self.send_response(500)
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": f"Tokenization failed: {str(tokenize_err)}"}).encode('utf-8'))
                return

            print(f"[AirLLM Server] Generating tokens (max_new_tokens: {max_tokens}, temp: {temperature})...")

            # Dual-Mode generation & streaming
            # Attempt real-time token-by-token streaming via TextIteratorStreamer.
            # If AirLLM layer-swapping locks the thread, fall back to full generation and word-by-word streaming simulation.
            try:
                from transformers import TextIteratorStreamer
                streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
                
                generation_kwargs = dict(
                    input_ids=input_ids,
                    streamer=streamer,
                    max_new_tokens=max_tokens,
                    use_cache=True
                )
                if temperature > 0.1:
                    generation_kwargs['temperature'] = temperature
                    generation_kwargs['do_sample'] = True
                else:
                    generation_kwargs['temperature'] = 0.1
                    generation_kwargs['do_sample'] = False

                self.send_response(200)
                self.send_header('Content-Type', 'text/event-stream')
                self.send_header('Cache-Control', 'no-cache')
                self.send_header('Connection', 'keep-alive')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()

                # Start generation thread
                thread = Thread(target=model.generate, kwargs=generation_kwargs)
                thread.start()

                for new_text in streamer:
                    if new_text:
                        # Yield standard OpenAI streaming SSE chunk
                        chunk = {
                            "choices": [{
                                "delta": {"content": new_text}
                            }]
                        }
                        self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode('utf-8'))
                        self.wfile.flush()

                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
                thread.join()

            except Exception as stream_err:
                print(f"[AirLLM Server] Streaming generation encountered error: {stream_err}. Falling back to full batch generation...")
                try:
                    generation_kwargs = dict(
                        input_ids=input_ids,
                        max_new_tokens=max_tokens,
                        use_cache=True
                    )
                    if temperature > 0.1:
                        generation_kwargs['temperature'] = temperature
                        generation_kwargs['do_sample'] = True
                    else:
                        generation_kwargs['temperature'] = 0.1
                        generation_kwargs['do_sample'] = False

                    # Run generation fully
                    outputs = model.generate(**generation_kwargs)
                    output_tokens = outputs[0][input_ids.shape[1]:]
                    full_text = tokenizer.decode(output_tokens, skip_special_tokens=True)

                    # Stream the full response word-by-word with a micro-delay to simulate a typewriter effect
                    self.send_response(200)
                    self.send_header('Content-Type', 'text/event-stream')
                    self.send_header('Cache-Control', 'no-cache')
                    self.send_header('Connection', 'keep-alive')
                    self.send_header('Access-Control-Allow-Origin', '*')
                    self.end_headers()

                    # Split text by spaces but retain formatting
                    words = full_text.split(' ')
                    for i, word in enumerate(words):
                        space = ' ' if i < len(words) - 1 else ''
                        chunk = {
                            "choices": [{
                                "delta": {"content": word + space}
                            }]
                        }
                        self.wfile.write(f"data: {json.dumps(chunk)}\n\n".encode('utf-8'))
                        self.wfile.flush()
                        time.sleep(0.01) # 10ms micro-delay for smooth rendering

                    self.wfile.write(b"data: [DONE]\n\n")
                    self.wfile.flush()

                except Exception as gen_err:
                    print(f"[AirLLM Server] Critical generation error: {gen_err}", file=sys.stderr)
                    err_payload = json.dumps({"error": str(gen_err)})
                    self.wfile.write(f"data: {err_payload}\n\n".encode('utf-8'))
                    self.wfile.flush()
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Endpoint not found")

# ── 3. Main Server Entrypoint ────────────────────────────────────────────────
def run_server():
    global model, tokenizer, model_id, model_loaded

    parser = argparse.ArgumentParser(description="NYX Local Model AirLLM Service")
    parser.add_argument("--model", type=str, required=True, help="Hugging Face model repository ID")
    parser.add_argument("--port", type=int, default=12345, help="Port to run the HTTP server on")
    parser.add_argument("--compression", type=str, default="4bit", choices=["4bit", "8bit", "None"], help="Quantization block compression")
    parser.add_argument("--saving-path", type=str, required=True, help="Local directory to store sharded layers")
    args = parser.parse_args()

    model_id = args.model
    port = args.port
    saving_path = args.saving_path
    
    # Map None compression string to python None
    compression = None if args.compression == "None" else args.compression

    print(f"[AirLLM Server] Model Repository ID: {model_id}")
    print(f"[AirLLM Server] Target Port: {port}")
    print(f"[AirLLM Server] Compression Tier: {compression}")
    print(f"[AirLLM Server] Layer Shards Path: {saving_path}")

    # Prepare directories
    os.makedirs(saving_path, exist_ok=True)

    token = get_hf_token()
    if token:
        print("[AirLLM Server] Found HF_TOKEN in environment. Passing authorized credentials...")

    try:
        # 1. Load Tokenizer
        print(f"[AirLLM Server] Loading Tokenizer for {model_id}...")
        tokenizer = AutoTokenizer.from_pretrained(model_id, token=token)

        # Only delete original HF downloads, never delete original local model weights
        is_local_path = os.path.exists(model_id)
        delete_original = not is_local_path
        
        print(f"[AirLLM Server] Loading mode: {'Local Directory Path' if is_local_path else 'Hugging Face Hub Repository'}")
        print(f"[AirLLM Server] Delete original weights after sharding: {delete_original}")

        model = AutoModel.from_pretrained(
            model_id,
            compression=compression,
            layer_shards_saving_path=saving_path,
            delete_original=delete_original,
            hf_token=token,
            prefetch=True
        )

        model_loaded = True
        print(f"[AirLLM Server] Model layers sharded and loaded successfully at: {saving_path}")
    except Exception as e:
        print(f"\n[AirLLM Server] CRITICAL EXCEPTION LOADING MODEL: {e}", file=sys.stderr)
        print("[AirLLM Server] Check disk space, Hugging Face Token, or internet connection.", file=sys.stderr)
        sys.exit(1)

    # 3. Start HTTPServer
    server_address = ('127.0.0.1', port)
    httpd = ThreadingHTTPServer(server_address, AirLLMHandler)
    print(f"\n[AirLLM Server] OpenAI-compatible AirLLM local server running on http://127.0.0.1:{port}")
    
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    print("[AirLLM Server] Shutting down...")

if __name__ == '__main__':
    run_server()
