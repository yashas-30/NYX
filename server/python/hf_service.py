#!/usr/bin/env python3
import sys
import os
import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from threading import Thread
import torch
from transformers import AutoTokenizer, AutoModelForCausalLM, TextIteratorStreamer

# 1. Resolve Hugging Face Token from environment or .env file
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

print("[HF Server] Booting up Python local model server...")
print(f"[HF Server] PyTorch version: {torch.__version__}")
print(f"[HF Server] CUDA Available: {torch.cuda.is_available()}")
if torch.cuda.is_available():
    print(f"[HF Server] GPU Device: {torch.cuda.get_device_name(0)}")

model_id = "Qwen/Qwen2.5-Coder-0.5B-Instruct"
token = get_hf_token()

try:
    print(f"[HF Server] Loading Tokenizer for {model_id}...")
    tokenizer = AutoTokenizer.from_pretrained(model_id, token=token)
    
    print(f"[HF Server] Loading Model weights for {model_id} (float32/bfloat16, auto device mapping)...")
    # For CPU, bfloat16 might require specific CPU features; auto will route to CPU/GPU
    model = AutoModelForCausalLM.from_pretrained(
        model_id,
        torch_dtype=torch.bfloat16 if torch.cuda.is_available() else torch.float32,
        device_map="auto",
        attn_implementation="sdpa",
        token=token
    )
    print("[HF Server] Model loaded successfully into memory.")
except Exception as e:
    print(f"\n[HF Server] CRITICAL ERROR LOADING MODEL: {e}", file=sys.stderr)
    print("[HF Server] Exiting. Please make sure transformers/torch are installed correctly.", file=sys.stderr)
    sys.exit(1)

class HFHandler(BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        # Prevent spamming console with request logs
        pass

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()

    def do_GET(self):
        if self.path in ('/health', '/api/health', '/api/models/quota', '/api/models/list'):
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()
            if self.path in ('/health', '/api/health', '/api/models/quota'):
                res = {"status": "ok", "model": model_id, "local": True}
            else:
                res = [model_id]
            self.wfile.write(json.dumps(res).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

    def do_POST(self):
        if self.path == '/stream' or self.path == '/api/gemini/stream':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                req_body = json.loads(post_data.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Invalid JSON")
                return

            prompt = req_body.get('prompt', '')
            history = req_body.get('history', [])
            system_instruction = req_body.get('systemInstruction', '')

            # Format the conversational prompt for Qwen Coder
            system_context = system_instruction or "You are Nyx, an expert AI in Arduino and Raspberry Pi development."
            messages = [{"role": "system", "content": system_context}]
            if history and isinstance(history, list):
                for m in history:
                    r = m.get('role', 'user')
                    role = "user" if r == 'user' else "assistant"
                    messages.append({"role": role, "content": m.get('content', '')})
            messages.append({"role": "user", "content": prompt})

            try:
                full_prompt = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True
                )
            except Exception:
                # Fallback to manual ChatML formatting if template isn't available
                full_prompt = f"<|im_start|>system\n{system_context}<|im_end|>\n"
                if history and isinstance(history, list):
                    for m in history:
                        r = m.get('role', 'user')
                        role = "user" if r == 'user' else "assistant"
                        full_prompt += f"<|im_start|>{role}\n{m.get('content')}<|im_end|>\n"
                full_prompt += f"<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"

            print(f"[HF Server] Processing stream request. Context Prompt length: {len(full_prompt)}")

            self.send_response(200)
            self.send_header('Content-Type', 'text/event-stream')
            self.send_header('Cache-Control', 'no-cache')
            self.send_header('Connection', 'keep-alive')
            self.send_header('Access-Control-Allow-Origin', '*')
            self.end_headers()

            try:
                device = "cuda" if torch.cuda.is_available() else "cpu"
                inputs = tokenizer(full_prompt, return_tensors="pt").to(device)

                streamer = TextIteratorStreamer(tokenizer, skip_prompt=True, skip_special_tokens=True)
                
                settings = req_body.get('settings', {})
                max_tokens = settings.get('maxTokens', 256) if settings.get('maxTokens') else 256
                temperature = settings.get('temperature', 0.7) if settings.get('temperature') else 0.7

                # Keep temperature within HF bounds
                temperature = max(0.01, min(temperature, 2.0))

                generation_kwargs = dict(
                    inputs,
                    streamer=streamer,
                    max_new_tokens=int(max_tokens),
                    temperature=float(temperature),
                    do_sample=True if temperature > 0.1 else False
                )

                thread = Thread(target=model.generate, kwargs=generation_kwargs)
                thread.start()

                for new_text in streamer:
                    if new_text:
                        # Event source data format
                        chunk_payload = json.dumps({"chunk": new_text})
                        self.wfile.write(f"data: {chunk_payload}\n\n".encode('utf-8'))
                        self.wfile.flush()

                self.wfile.write(b"data: [DONE]\n\n")
                self.wfile.flush()
            except Exception as e:
                print(f"[HF Server] Error during generation: {e}")
                err_payload = json.dumps({"error": str(e)})
                self.wfile.write(f"data: {err_payload}\n\n".encode('utf-8'))
                self.wfile.flush()
        elif self.path in ('/generate', '/api/gemini/generate'):
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                req_body = json.loads(post_data.decode('utf-8'))
            except Exception as e:
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Invalid JSON")
                return

            prompt = req_body.get('prompt', '')
            history = req_body.get('history', [])
            system_instruction = req_body.get('systemInstruction', '')

            # Format the conversational prompt for Qwen Coder
            system_context = system_instruction or "You are Nyx, an expert AI in Arduino and Raspberry Pi development."
            messages = [{"role": "system", "content": system_context}]
            if history and isinstance(history, list):
                for m in history:
                    r = m.get('role', 'user')
                    role = "user" if r == 'user' else "assistant"
                    messages.append({"role": role, "content": m.get('content', '')})
            messages.append({"role": "user", "content": prompt})

            try:
                full_prompt = tokenizer.apply_chat_template(
                    messages,
                    tokenize=False,
                    add_generation_prompt=True
                )
            except Exception:
                # Fallback to manual ChatML formatting
                full_prompt = f"<|im_start|>system\n{system_context}<|im_end|>\n"
                if history and isinstance(history, list):
                    for m in history:
                        r = m.get('role', 'user')
                        role = "user" if r == 'user' else "assistant"
                        full_prompt += f"<|im_start|>{role}\n{m.get('content')}<|im_end|>\n"
                full_prompt += f"<|im_start|>user\n{prompt}<|im_end|>\n<|im_start|>assistant\n"

            print(f"[HF Server] Processing non-stream generate request. Length: {len(full_prompt)}")

            try:
                device = "cuda" if torch.cuda.is_available() else "cpu"
                inputs = tokenizer(full_prompt, return_tensors="pt").to(device)

                settings = req_body.get('settings', {})
                max_tokens = settings.get('maxTokens', 512) if settings.get('maxTokens') else 512
                temperature = settings.get('temperature', 0.7) if settings.get('temperature') else 0.7
                temperature = max(0.01, min(temperature, 2.0))

                generation_kwargs = dict(
                    inputs,
                    max_new_tokens=int(max_tokens),
                    temperature=float(temperature),
                    do_sample=True if temperature > 0.1 else False
                )

                # Generate synchronously
                outputs = model.generate(**generation_kwargs)
                # Skip the prompt in output
                output_tokens = outputs[0][inputs.input_ids.shape[1]:]
                response_text = tokenizer.decode(output_tokens, skip_special_tokens=True)

                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"text": response_text}).encode('utf-8'))
            except Exception as e:
                print(f"[HF Server] Error during non-stream generation: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Access-Control-Allow-Origin', '*')
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(e)}).encode('utf-8'))
        else:
            self.send_response(404)
            self.end_headers()
            self.wfile.write(b"Not Found")

def run(port=3002):
    server_address = ('127.0.0.1', port)
    httpd = ThreadingHTTPServer(server_address, HFHandler)
    print(f"[HF Server] Listening locally on http://127.0.0.1:{port}")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        pass
    print("[HF Server] Stopping local model server...")

if __name__ == '__main__':
    port = 3002
    if len(sys.argv) > 1:
        try:
            port = int(sys.argv[1])
        except ValueError:
            pass
    run(port)
