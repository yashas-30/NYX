# NYX Custom AI Model — Complete Training & Branding Guide (2026 Edition)

**Goal:** Train your own AI model on your NYX chat data, brand it as "NYX AI", and deploy it inside your NYX app as a native local model.

**Cost:** $0 (CPU-only) to $50 (GPU cloud rental for 1–2 hours)
**Time:** 3–7 days for first version, 2–3 hours for retraining
**Difficulty:** Intermediate (requires basic Python/terminal knowledge)

---

## Table of Contents

1. [Overview & Philosophy](#1-overview--philosophy)
2. [Free Open-Source Models for 2026](#2-free-open-source-models-for-2026)
3. [Hardware Requirements](#3-hardware-requirements)
4. [Phase 1: Data Extraction from NYX](#4-phase-1-data-extraction-from-nyx)
5. [Phase 2: Data Cleaning & Formatting](#5-phase-2-data-cleaning--formatting)
6. [Phase 3: Augment with Your Knowledge](#6-phase-3-augment-with-your-knowledge)
7. [Phase 4: Fine-Tuning with LoRA](#7-phase-4-fine-tuning-with-lora)
8. [Phase 5: Convert to GGUF for NYX](#8-phase-5-convert-to-gguf-for-nyx)
9. [Phase 6: Brand the Model as NYX](#9-phase-6-brand-the-model-as-nyx)
10. [Phase 7: Register in NYX Model Registry](#10-phase-7-register-in-nyx-model-registry)
11. [Phase 8: A/B Testing & Evaluation](#11-phase-8-ab-testing--evaluation)
12. [Phase 9: Continuous Learning Pipeline](#12-phase-9-continuous-learning-pipeline)
13. [Troubleshooting](#13-troubleshooting)
14. [Legal & Ethical Checklist](#14-legal--ethical-checklist)

---

## 1. Overview & Philosophy

### What You Are Actually Building

You are **NOT** building a Claude or GPT-4 competitor. You are building a **specialized, branded assistant** that:

- Knows your coding style, project conventions, and domain knowledge
- Speaks with a consistent "NYX" personality and tone
- Runs entirely offline on your GPU (privacy + zero API costs)
- Can be shared with your team/community under your brand

### The Pipeline (High Level)

```
NYX Chat DB (SQLite) ──→ Extract ──→ Clean ──→ Format ──→ Augment
                                                          │
                                                          ↓
Your Codebase ──────────→ Parse ────→ Q&A Pairs ────────┐
                                                          │
                                                          ↓
Your Documents ─────────→ Chunk ────→ Q&A Pairs ────────┤
                                                          │
                                                          ↓
Public Dataset (optional) → Mix in ───────────────────────┘
                                                          │
                                                          ↓
                                         Fine-Tune (LoRA) on Open Model
                                                          │
                                                          ↓
                                         Merge Adapter + Base Model
                                                          │
                                                          ↓
                                         Convert to GGUF (llama.cpp)
                                                          │
                                                          ↓
                                         Add to NYX Model Registry
                                                          │
                                                          ↓
                                         Brand as "NYX AI v1.0"
```

### Why LoRA, Not Full Fine-Tuning?

| Method | VRAM Needed | Time | Cost | Quality | Recommendation |
|--------|-------------|------|------|---------|----------------|
| **Full Fine-Tuning** (7B) | 40–80 GB | 12–24h | $200–$500 | Best | ❌ Too expensive |
| **LoRA (Rank 16)** | 6–12 GB | 1–2h | $10–$50 | 90–95% of full | ✅ **Recommended** |
| **QLoRA (4-bit)** | 4–8 GB | 1–2h | $10–$50 | 85–90% of full | ✅ Best for budget |
| **CPU-only (llama.cpp)** | 8 GB RAM | 6–12h | $0 | 70–80% of full | ✅ Free but slow |

**LoRA** (Low-Rank Adaptation) trains only small "adapter" matrices that sit on top of the base model. It:
- Uses 10–100x less VRAM
- Trains 10–100x faster
- Produces a tiny adapter file (10–100 MB) instead of a full model (4–8 GB)
- Can be merged or swapped dynamically

---

## 2. Free Open-Source Models for 2026

### Recommended Models (Ranked by Quality × Accessibility)

#### 🥇 Tier 1: Best Overall (Use These First)

| Model | Size | License | VRAM (Q4) | Strengths | Best For |
|-------|------|---------|-----------|-----------|----------|
| **Qwen 3 8B Instruct** | 8B | Apache 2.0 | 5.5 GB | Best coding, multilingual, long context | General purpose, coding |
| **Llama 4 8B Instruct** | 8B | Llama 4 License (permissive) | 5.5 GB | Best reasoning, tool use, safety | Reasoning, agent tasks |
| **DeepSeek V3 7B** | 7B | MIT-like | 4.5 GB | Best math/science, MoE architecture | STEM, research |
| **Mistral Small 3 24B** | 24B | Apache 2.0 | 14 GB | Best quality for size, fast inference | High-quality responses |

#### 🥈 Tier 2: Good for Specific Use Cases

| Model | Size | License | VRAM (Q4) | Strengths | Best For |
|-------|------|---------|-----------|-----------|----------|
| **Gemma 3 12B** | 12B | Gemma License | 7.5 GB | Google's quality, vision-capable | Multimodal, Google ecosystem |
| **Phi-4 Mini** | 3.8B | MIT | 2.5 GB | Tiny but surprisingly capable | Edge devices, low VRAM |
| **Qwen 3 72B** | 72B | Apache 2.0 | 42 GB | State-of-the-art open model | Maximum quality (needs big GPU) |
| **Mixtral 8x7B** | 47B (MoE) | Apache 2.0 | 28 GB | Excellent quality, efficient MoE | Large-scale deployment |

#### 🥉 Tier 3: Lightweight / Mobile

| Model | Size | License | VRAM (Q4) | Best For |
|-------|------|---------|-----------|----------|
| **Qwen 3 1.5B** | 1.5B | Apache 2.0 | 1 GB | Mobile, very fast responses |
| **Llama 4 1B** | 1B | Llama 4 License | 0.8 GB | Browser, edge, real-time |
| **Phi-3.5 Mini** | 3.8B | MIT | 2.5 GB | Balanced quality/size |

### My Recommendation for NYX

**Start with:** `Qwen 3 8B Instruct` or `Llama 4 8B Instruct`

**Why:**
- **Apache 2.0 / permissive license** — You can brand and redistribute freely
- **8B parameters** — Sweet spot for quality vs. VRAM (5–6 GB)
- **Strong coding ability** — Your NYX app is a coding assistant
- **Long context** — 32K–128K tokens (great for RAG + chat history)
- **Active ecosystem** — HuggingFace, llama.cpp, Ollama all support it

**For 2026 specifically:** By mid-2026, Qwen 3 and Llama 4 will be mature with extensive fine-tuning guides, community LoRA adapters, and quantization tools. These are the safest bets.

---

## 3. Hardware Requirements

### Minimum (CPU-Only, Free)

```
CPU: 8+ cores (AMD Ryzen 7 / Intel i7)
RAM: 32 GB
Storage: 50 GB SSD (for model files + datasets)
GPU: None (training will be very slow)
Time: 6–12 hours for LoRA training
```

### Recommended (GPU, $10–$50)

```
GPU: NVIDIA RTX 3060 12GB / RTX 4060 Ti 16GB / RTX 4090 24GB
VRAM: 12 GB+ (8B model QLoRA needs ~6 GB)
RAM: 16 GB
Storage: 50 GB SSD
Time: 1–2 hours for LoRA training
```

### Ideal (GPU, $50–$200)

```
GPU: RTX 4090 24GB / A100 40GB / H100 80GB
VRAM: 24 GB+ (can train 70B models with QLoRA)
RAM: 32 GB
Storage: 100 GB SSD
Time: 30 min–2 hours depending on model size
```

### Cloud GPU Options (Pay-Per-Hour)

| Platform | GPU | VRAM | Cost/Hour | Best For |
|----------|-----|------|-----------|----------|
| **Google Colab (Pro)** | T4 / A100 | 16–40 GB | $10/mo subscription | Beginners, free tier available |
| **RunPod** | RTX 4090 | 24 GB | $0.50–$0.80/h | Best price/performance |
| **Vast.ai** | RTX 4090 | 24 GB | $0.40–$0.70/h | Cheapest, community market |
| **Lambda Labs** | A100 | 40 GB | $1.10/h | Reliable, good for 70B models |
| **Paperspace** | A6000 | 48 GB | $1.20/h | Persistent storage, notebooks |

**My recommendation:** Start with **Google Colab (free tier)** or **RunPod** with an RTX 4090 for $0.50/hour. A full LoRA training run costs **$1–$3**.

---

## 4. Phase 1: Data Extraction from NYX

### 4.1 Locate Your NYX Database

NYX stores data in SQLite by default. Find it:

```bash
# On your machine (NYX workspace root)
find . -name "*.db" -o -name "*.sqlite" -o -name "*.sqlite3"

# Typical locations:
# .nyx-state/nyx.db
# .nyx/nyx.db
# apps/server/.nyx-state/nyx.db
```

### 4.2 Extract Conversations

Save this script as `scripts/extract_nyx_data.py`:

```python
#!/usr/bin/env python3
"""
NYX Chat Data Extractor
Extracts conversations from NYX SQLite database into training format.

Usage:
    python scripts/extract_nyx_data.py --db .nyx-state/nyx.db --output training_data/
"""

import sqlite3
import json
import argparse
from pathlib import Path
from datetime import datetime
from typing import List, Dict, Any
import re


def extract_conversations(db_path: Path, min_turns: int = 2) -> List[Dict[str, Any]]:
    """Extract all chat conversations from NYX database."""
    
    if not db_path.exists():
        raise FileNotFoundError(f"Database not found: {db_path}")
    
    conn = sqlite3.connect(str(db_path))
    conn.row_factory = sqlite3.Row
    cursor = conn.cursor()
    
    # Check which tables exist (NYX may use different schema versions)
    cursor.execute("SELECT name FROM sqlite_master WHERE type='table'")
    tables = {row[0] for row in cursor.fetchall()}
    
    conversations = []
    
    # Try new schema first (chat_conversations + chat_messages)
    if 'chat_conversations' in tables and 'chat_messages' in tables:
        cursor.execute("""
            SELECT 
                c.id as conv_id,
                c.title,
                c.model,
                c.folder_id,
                c.tags,
                c.created_at,
                c.updated_at,
                m.id as msg_id,
                m.role,
                m.content,
                m.parent_id,
                m.is_pinned,
                m.timestamp,
                m.token_usage,
                m.attachments
            FROM chat_conversations c
            LEFT JOIN chat_messages m ON m.conversation_id = c.id
            ORDER BY c.id, m.timestamp
        """)
    
    # Fallback to legacy schema (conversations + messages)
    elif 'conversations' in tables and 'messages' in tables:
        cursor.execute("""
            SELECT 
                c.id as conv_id,
                c.title,
                c.model,
                NULL as folder_id,
                NULL as tags,
                c.created_at,
                c.updated_at,
                m.id as msg_id,
                m.role,
                m.content,
                NULL as parent_id,
                0 as is_pinned,
                m.timestamp,
                NULL as token_usage,
                NULL as attachments
            FROM conversations c
            LEFT JOIN messages m ON m.conversation_id = c.id
            ORDER BY c.id, m.timestamp
        """)
    else:
        raise ValueError(f"No recognized conversation tables found. Available: {tables}")
    
    # Group by conversation
    conv_map = {}
    for row in cursor.fetchall():
        conv_id = row['conv_id']
        if conv_id not in conv_map:
            conv_map[conv_id] = {
                'id': conv_id,
                'title': row['title'] or 'Untitled',
                'model': row['model'] or 'unknown',
                'tags': row['tags'] or '',
                'created_at': row['created_at'],
                'updated_at': row['updated_at'],
                'messages': []
            }
        
        if row['content']:  # Skip empty messages
            conv_map[conv_id]['messages'].append({
                'role': row['role'],
                'content': row['content'],
                'timestamp': row['timestamp'],
                'token_usage': row['token_usage'],
                'attachments': row['attachments']
            })
    
    conn.close()
    
    # Filter conversations
    for conv in conv_map.values():
        msgs = conv['messages']
        if len(msgs) < min_turns:
            continue
        
        # Check for valid back-and-forth
        roles = [m['role'] for m in msgs]
        if 'user' not in roles or 'assistant' not in roles:
            continue
            
        conversations.append(conv)
    
    return conversations


def format_sharegpt(conversations: List[Dict]) -> List[Dict]:
    """Convert to ShareGPT format (most widely supported for fine-tuning)."""
    sharegpt_data = []
    
    for conv in conversations:
        messages = []
        for msg in conv['messages']:
            role = 'human' if msg['role'] == 'user' else 'gpt'
            messages.append({
                'from': role,
                'value': msg['content']
            })
        
        sharegpt_data.append({
            'id': conv['id'],
            'conversations': messages,
            'metadata': {
                'model': conv['model'],
                'title': conv['title'],
                'tags': conv['tags'],
                'created_at': conv['created_at']
            }
        })
    
    return sharegpt_data


def format_alpaca(conversations: List[Dict]) -> List[Dict]:
    """Convert to Alpaca instruction format (good for single-turn Q&A)."""
    alpaca_data = []
    
    for conv in conversations:
        msgs = conv['messages']
        # Create instruction pairs from consecutive user/assistant turns
        for i in range(len(msgs) - 1):
            if msgs[i]['role'] == 'user' and msgs[i+1]['role'] == 'assistant':
                alpaca_data.append({
                    'instruction': msgs[i]['content'],
                    'input': '',  # Can be used for additional context
                    'output': msgs[i+1]['content'],
                    'system': f'You are NYX, a helpful AI assistant built by the NYX team.',
                    'metadata': {
                        'conversation_id': conv['id'],
                        'model': conv['model'],
                        'turn_index': i
                    }
                })
    
    return alpaca_data


def format_chatml(conversations: List[Dict]) -> List[Dict]:
    """Convert to ChatML format (OpenAI-style, used by many trainers)."""
    chatml_data = []
    
    for conv in conversations:
        messages = []
        for msg in conv['messages']:
            messages.append({
                'role': msg['role'],
                'content': msg['content']
            })
        
        chatml_data.append({
            'messages': messages,
            'metadata': {
                'model': conv['model'],
                'title': conv['title']
            }
        })
    
    return chatml_data


def main():
    parser = argparse.ArgumentParser(description='Extract NYX chat data for training')
    parser.add_argument('--db', required=True, help='Path to NYX SQLite database')
    parser.add_argument('--output', default='training_data', help='Output directory')
    parser.add_argument('--min-turns', type=int, default=2, help='Minimum conversation turns')
    parser.add_argument('--max-conversations', type=int, default=10000, help='Max conversations to export')
    parser.add_argument('--since', help='Only export conversations since date (YYYY-MM-DD)')
    args = parser.parse_args()
    
    db_path = Path(args.db)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"📂 Extracting from: {db_path}")
    print(f"📊 Min turns per conversation: {args.min_turns}")
    
    # Extract
    conversations = extract_conversations(db_path, args.min_turns)
    
    # Filter by date if specified
    if args.since:
        since_ts = int(datetime.strptime(args.since, '%Y-%m-%d').timestamp() * 1000)
        conversations = [c for c in conversations if c['created_at'] >= since_ts]
    
    # Limit
    conversations = conversations[:args.max_conversations]
    
    print(f"✅ Found {len(conversations)} valid conversations")
    
    # Total messages
    total_messages = sum(len(c['messages']) for c in conversations)
    print(f"📝 Total messages: {total_messages}")
    
    # Model distribution
    model_counts = {}
    for c in conversations:
        model = c['model']
        model_counts[model] = model_counts.get(model, 0) + 1
    print(f"🤖 Model distribution: {model_counts}")
    
    # Save in multiple formats
    
    # 1. ShareGPT format (most versatile)
    sharegpt = format_sharegpt(conversations)
    sharegpt_path = output_dir / 'nyx_sharegpt.json'
    with open(sharegpt_path, 'w', encoding='utf-8') as f:
        json.dump(sharegpt, f, indent=2, ensure_ascii=False)
    print(f"💾 ShareGPT: {sharegpt_path} ({len(sharegpt)} conversations)")
    
    # 2. Alpaca format (good for instruction tuning)
    alpaca = format_alpaca(conversations)
    alpaca_path = output_dir / 'nyx_alpaca.json'
    with open(alpaca_path, 'w', encoding='utf-8') as f:
        json.dump(alpaca, f, indent=2, ensure_ascii=False)
    print(f"💾 Alpaca: {alpaca_path} ({len(alpaca)} instruction pairs)")
    
    # 3. ChatML format (modern standard)
    chatml = format_chatml(conversations)
    chatml_path = output_dir / 'nyx_chatml.json'
    with open(chatml_path, 'w', encoding='utf-8') as f:
        json.dump(chatml, f, indent=2, ensure_ascii=False)
    print(f"💾 ChatML: {chatml_path} ({len(chatml)} conversations)")
    
    # 4. Raw metadata
    meta_path = output_dir / 'metadata.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump({
            'exported_at': datetime.now().isoformat(),
            'database': str(db_path),
            'total_conversations': len(conversations),
            'total_messages': total_messages,
            'model_distribution': model_counts,
            'formats': ['sharegpt', 'alpaca', 'chatml']
        }, f, indent=2)
    print(f"💾 Metadata: {meta_path}")
    
    print(f"\n🎉 Extraction complete! Files saved to {output_dir}")
    print(f"\nNext step: Run scripts/clean_training_data.py")


if __name__ == '__main__':
    main()
```

Run it:

```bash
# Install dependency (if not already)
pip install sqlite3

# Extract your data
python scripts/extract_nyx_data.py \
    --db .nyx-state/nyx.db \
    --output training_data/ \
    --min-turns 3 \
    --max-conversations 5000
```

**Expected output:**
```
📂 Extracting from: .nyx-state/nyx.db
📊 Min turns per conversation: 3
✅ Found 1,247 valid conversations
📝 Total messages: 8,932
🤖 Model distribution: {'gemini-1.5-flash': 523, 'gemini-1.5-pro': 312, 'claude-3-sonnet': 201, 'llama-3.1-8b': 211}
💾 ShareGPT: training_data/nyx_sharegpt.json (1247 conversations)
💾 Alpaca: training_data/nyx_alpaca.json (3841 instruction pairs)
💾 ChatML: training_data/nyx_chatml.json (1247 conversations)
💾 Metadata: training_data/metadata.json
```

---

## 5. Phase 2: Data Cleaning & Formatting

Raw chat data is **dirty**. You must clean it before training, or your model will learn bad habits.

### 5.1 Common Problems in Chat Data

| Problem | Example | Why It Hurts Training |
|---------|---------|---------------------|
| **API keys in prompts** | "My key is sk-abc123..." | Model learns to output fake keys |
| **Error messages** | "Error: 429 Too Many Requests" | Model learns to output errors |
| **Placeholder responses** | "As an AI, I cannot..." | Model becomes overly cautious |
| **Partial/incomplete** | "Let me think..." [cut off] | Model learns to cut off responses |
| **Repetitive patterns** | "Sure! I'd be happy to help!" × 1000 | Model becomes repetitive |
| **Mixed languages** | English + random other language | Model produces gibberish |
| **HTML/Markdown artifacts** | `<div>`, `\n\n`, ````python` | Inconsistent formatting |
| **System prompt leakage** | "You are a helpful assistant..." | Model outputs system prompts |

### 5.2 Cleaning Script

Save as `scripts/clean_training_data.py`:

```python
#!/usr/bin/env python3
"""
NYX Training Data Cleaner
Removes bad data, scrubs secrets, deduplicates, and formats for training.

Usage:
    python scripts/clean_training_data.py \
        --input training_data/nyx_sharegpt.json \
        --output training_data/cleaned/ \
        --min-length 50 \
        --max-length 8000
"""

import json
import re
import argparse
from pathlib import Path
from collections import Counter
from typing import List, Dict, Any, Set
import hashlib


# Patterns to detect and remove secrets
SECRET_PATTERNS = [
    (r'sk-[a-zA-Z0-9]{48,}', '[API_KEY_REDACTED]'),  # OpenAI
    (r'AIza[0-9A-Za-z_-]{35,}', '[API_KEY_REDACTED]'),  # Google
    (r'[a-zA-Z0-9]{32,}-[a-zA-Z0-9]{8,}-[a-zA-Z0-9]{4,}', '[API_KEY_REDACTED]'),  # Generic
    (r'ghp_[a-zA-Z0-9]{36,}', '[GITHUB_TOKEN_REDACTED]'),
    (r'gho_[a-zA-Z0-9]{36,}', '[GITHUB_TOKEN_REDACTED]'),
    (r'ghu_[a-zA-Z0-9]{36,}', '[GITHUB_TOKEN_REDACTED]'),
    (r'ghs_[a-zA-Z0-9]{36,}', '[GITHUB_TOKEN_REDACTED]'),
    (r'ghr_[a-zA-Z0-9]{36,}', '[GITHUB_TOKEN_REDACTED]'),
    (r'[a-zA-Z0-9]{40,}', '[LONG_TOKEN_REDACTED]'),  # Catch-all for long tokens
]

# Patterns for bad content
ERROR_PATTERNS = [
    r'(?i)error\s*[:\-]?\s*\d{3}',  # HTTP errors
    r'(?i)429\s+too\s+many\s+requests',
    r'(?i)500\s+internal\s+server\s+error',
    r'(?i)connection\s+refused',
    r'(?i)timeout\s+error',
    r'(?i)rate\s+limit\s+exceeded',
    r'(?i)api\s+key\s+invalid',
    r'(?i)unauthorized\s*[:\-]?',
]

PLATITUDE_PATTERNS = [
    r'(?i)^as an ai (language model|assistant)',
    r'(?i)^i\'m (just )?an ai',
    r'(?i)^i cannot (provide|engage|assist|help)',
    r'(?i)^i don\'t (have|possess) (the ability|personal experiences|emotions)',
    r'(?i)^i (am not able|am unable) to',
]


def scrub_secrets(text: str) -> str:
    """Remove API keys, tokens, and secrets from text."""
    for pattern, replacement in SECRET_PATTERNS:
        text = re.sub(pattern, replacement, text)
    return text


def has_error_content(text: str) -> bool:
    """Check if text contains error messages."""
    for pattern in ERROR_PATTERNS:
        if re.search(pattern, text):
            return True
    return False


def is_platitude(text: str) -> bool:
    """Check if text starts with AI platitudes."""
    for pattern in PLATITUDE_PATTERNS:
        if re.search(pattern, text.strip()):
            return True
    return False


def clean_message(text: str) -> str:
    """Clean a single message."""
    # Scrub secrets
    text = scrub_secrets(text)
    
    # Normalize whitespace (but preserve code blocks)
    # Split by code blocks to preserve them
    parts = re.split(r'(```[\s\S]*?```)', text)
    cleaned_parts = []
    for part in parts:
        if part.startswith('```'):
            cleaned_parts.append(part)  # Preserve code blocks
        else:
            # Normalize regular text
            part = re.sub(r'\n{3,}', '\n\n', part)  # Max 2 newlines
            part = re.sub(r'[ \t]+', ' ', part)  # Normalize spaces
            cleaned_parts.append(part)
    text = ''.join(cleaned_parts)
    
    # Remove system prompt leakage
    text = re.sub(r'(?i)(system:.*?)(?=\n\n|\Z)', '', text, flags=re.DOTALL)
    
    # Remove thinking/reasoning tags if they leak
    text = re.sub(r'<thinking>.*?</thinking>', '', text, flags=re.DOTALL)
    text = re.sub(r'<reasoning>.*?</reasoning>', '', text, flags=re.DOTALL)
    
    return text.strip()


def is_valid_conversation(conv: Dict) -> tuple[bool, str]:
    """Check if a conversation is worth training on."""
    messages = conv.get('conversations', conv.get('messages', []))
    
    if len(messages) < 2:
        return False, "Too few messages"
    
    # Check for user/assistant alternation
    has_human = any(m.get('from') == 'human' or m.get('role') == 'user' for m in messages)
    has_gpt = any(m.get('from') == 'gpt' or m.get('role') == 'assistant' for m in messages)
    
    if not has_human or not has_gpt:
        return False, "Missing human or assistant turns"
    
    # Check for errors in any message
    for msg in messages:
        content = msg.get('value', msg.get('content', ''))
        if has_error_content(content):
            return False, "Contains error messages"
    
    # Check if assistant responses are all platitudes
    assistant_msgs = [m for m in messages if m.get('from') == 'gpt' or m.get('role') == 'assistant']
    if all(is_platitude(m.get('value', m.get('content', ''))) for m in assistant_msgs):
        return False, "All assistant responses are platitudes"
    
    # Check average message length
    total_len = sum(len(m.get('value', m.get('content', ''))) for m in messages)
    avg_len = total_len / len(messages)
    if avg_len < 20:
        return False, "Messages too short"
    
    return True, "Valid"


def deduplicate_conversations(conversations: List[Dict]) -> List[Dict]:
    """Remove duplicate conversations."""
    seen: Set[str] = set()
    deduped = []
    
    for conv in conversations:
        messages = conv.get('conversations', conv.get('messages', []))
        # Create a hash from the first 200 chars of each message
        fingerprint = '|||'.join(
            m.get('value', m.get('content', ''))[:200].strip()
            for m in messages
        )
        hash_key = hashlib.md5(fingerprint.encode()).hexdigest()
        
        if hash_key not in seen:
            seen.add(hash_key)
            deduped.append(conv)
    
    return deduped


def format_for_training(conversations: List[Dict], format_type: str) -> List[Dict]:
    """Format conversations for specific training framework."""
    
    if format_type == 'unsloth':
        # Unsloth format (uses apply_chat_template)
        return conversations  # Already in ChatML-compatible format
    
    elif format_type == 'axolotl':
        # Axolotl format
        formatted = []
        for conv in conversations:
            messages = conv.get('conversations', [])
            text_parts = []
            for msg in messages:
                role = 'user' if msg.get('from') == 'human' else 'assistant'
                text_parts.append(f"<|{role}|>\n{msg.get('value', '')}")
            text_parts.append("<|assistant|>")  # Add generation prompt
            
            formatted.append({
                'text': '\n'.join(text_parts),
                'metadata': conv.get('metadata', {})
            })
        return formatted
    
    elif format_type == 'llama-factory':
        # LLaMA-Factory format
        formatted = []
        for conv in conversations:
            messages = conv.get('conversations', [])
            instruction = None
            output = None
            history = []
            
            for msg in messages:
                content = msg.get('value', '')
                if msg.get('from') == 'human':
                    if instruction is None:
                        instruction = content
                    else:
                        history.append([instruction, output])
                        instruction = content
                        output = None
                else:
                    output = content
            
            if instruction and output:
                formatted.append({
                    'instruction': instruction,
                    'input': '',
                    'output': output,
                    'history': history
                })
        return formatted
    
    return conversations


def main():
    parser = argparse.ArgumentParser(description='Clean NYX training data')
    parser.add_argument('--input', required=True, help='Input JSON file (ShareGPT format)')
    parser.add_argument('--output', required=True, help='Output directory')
    parser.add_argument('--min-length', type=int, default=50, help='Min message length')
    parser.add_argument('--max-length', type=int, default=8000, help='Max message length')
    parser.add_argument('--format', default='unsloth', 
                        choices=['unsloth', 'axolotl', 'llama-factory', 'raw'],
                        help='Target training framework format')
    args = parser.parse_args()
    
    input_path = Path(args.input)
    output_dir = Path(args.output)
    output_dir.mkdir(parents=True, exist_ok=True)
    
    print(f"📂 Loading: {input_path}")
    with open(input_path, 'r', encoding='utf-8') as f:
        conversations = json.load(f)
    
    print(f"📊 Loaded {len(conversations)} conversations")
    
    # Clean each conversation
    cleaned = []
    removed_reasons = Counter()
    
    for conv in conversations:
        messages = conv.get('conversations', conv.get('messages', []))
        
        # Check validity
        is_valid, reason = is_valid_conversation(conv)
        if not is_valid:
            removed_reasons[reason] += 1
            continue
        
        # Clean each message
        cleaned_messages = []
        for msg in messages:
            content = msg.get('value', msg.get('content', ''))
            cleaned_content = clean_message(content)
            
            # Length filters
            if len(cleaned_content) < args.min_length:
                continue
            if len(cleaned_content) > args.max_length:
                cleaned_content = cleaned_content[:args.max_length]
            
            cleaned_msg = dict(msg)
            cleaned_msg['value' if 'value' in msg else 'content'] = cleaned_content
            cleaned_messages.append(cleaned_msg)
        
        if len(cleaned_messages) >= 2:
            cleaned_conv = dict(conv)
            if 'conversations' in conv:
                cleaned_conv['conversations'] = cleaned_messages
            else:
                cleaned_conv['messages'] = cleaned_messages
            cleaned.append(cleaned_conv)
    
    print(f"\n🧹 Cleaning results:")
    print(f"   Valid: {len(cleaned)} / {len(conversations)}")
    print(f"   Removed: {len(conversations) - len(cleaned)}")
    for reason, count in removed_reasons.most_common():
        print(f"   - {reason}: {count}")
    
    # Deduplicate
    deduped = deduplicate_conversations(cleaned)
    print(f"\n🔍 After deduplication: {len(deduped)} (removed {len(cleaned) - len(deduped)})")
    
    # Format for training framework
    formatted = format_for_training(deduped, args.format)
    
    # Calculate statistics
    total_tokens = sum(
        sum(len(m.get('value', m.get('content', '')).split()) for m in 
            c.get('conversations', c.get('messages', [])))
        for c in deduped
    )
    
    # Save
    output_path = output_dir / f'cleaned_{args.format}.json'
    with open(output_path, 'w', encoding='utf-8') as f:
        json.dump(formatted, f, indent=2, ensure_ascii=False)
    
    # Save metadata
    meta = {
        'cleaned_at': datetime.now().isoformat(),
        'input_file': str(input_path),
        'original_count': len(conversations),
        'cleaned_count': len(cleaned),
        'deduped_count': len(deduped),
        'format': args.format,
        'total_approx_tokens': total_tokens,
        'removal_reasons': dict(removed_reasons),
        'filters': {
            'min_length': args.min_length,
            'max_length': args.max_length,
        }
    }
    
    meta_path = output_dir / 'clean_metadata.json'
    with open(meta_path, 'w', encoding='utf-8') as f:
        json.dump(meta, f, indent=2)
    
    print(f"\n💾 Saved:")
    print(f"   Data: {output_path}")
    print(f"   Metadata: {meta_path}")
    print(f"   Approximate tokens: {total_tokens:,}")
    print(f"\n✅ Cleaning complete! Next: Run scripts/augment_knowledge.py")


if __name__ == '__main__':
    from datetime import datetime
    main()
```

Run it:

```bash
python scripts/clean_training_data.py \
    --input training_data/nyx_sharegpt.json \
    --output training_data/cleaned/ \
    --min-length 50 \
    --max-length 8000 \
    --format unsloth
```

---

## 6. Phase 3: Augment with Your Knowledge

Your chat data is good, but **your unique knowledge** (codebase, documents, notes) is what makes your model special. We need to add this as **synthetic Q&A pairs**.

### 6.1 Extract Code Knowledge

Save as `scripts/augment_codebase.py`:

```python
#!/usr/bin/env python3
"""
Codebase Knowledge Extractor
Parses your project files and creates Q&A pairs for training.

Usage:
    python scripts/augment_codebase.py \
        --codebase . \
        --output training_data/cleaned/ \
        --max-files 1000
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict
import ast
import re


def extract_python_functions(file_path: Path) -> List[Dict]:
    """Extract function signatures and docstrings from Python files."""
    try:
        content = file_path.read_text(encoding='utf-8')
        tree = ast.parse(content)
    except (SyntaxError, UnicodeDecodeError):
        return []
    
    qa_pairs = []
    
    for node in ast.walk(tree):
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
            # Get function signature
            args = []
            for arg in node.args.args:
                arg_type = ''
                if arg.annotation:
                    try:
                        arg_type = f': {ast.unparse(arg.annotation)}'
                    except:
                        pass
                args.append(f"{arg.arg}{arg_type}")
            
            signature = f"def {node.name}({', '.join(args)})"
            if node.returns:
                try:
                    signature += f" -> {ast.unparse(node.returns)}"
                except:
                    pass
            signature += ':'
            
            # Get docstring
            docstring = ast.get_docstring(node) or "No description available."
            
            # Get function body (first 30 lines)
            body_lines = content.split('\n')
            start_line = node.lineno - 1
            end_line = min(start_line + 30, len(body_lines))
            body_snippet = '\n'.join(body_lines[start_line:end_line])
            
            # Create Q&A pairs
            qa_pairs.append({
                'instruction': f'What does the function `{node.name}` in {file_path.name} do?',
                'input': f'```python\n{signature}\n    """{docstring[:200]}"""\n{body_snippet[:500]}\n```',
                'output': f'The function `{node.name}` is defined in `{file_path.name}`. It {docstring}. The signature is: `{signature}`.',
                'source': str(file_path)
            })
            
            qa_pairs.append({
                'instruction': f'Explain how to use the function `{node.name}` from {file_path.name}.',
                'input': f'```python\n{signature}\n```',
                'output': f'You can use `{node.name}` by calling it with the following parameters: {", ".join(args)}. It returns {docstring[:300]}.',
                'source': str(file_path)
            })
    
    return qa_pairs


def extract_typescript_interfaces(file_path: Path) -> List[Dict]:
    """Extract TypeScript interfaces and types."""
    content = file_path.read_text(encoding='utf-8')
    qa_pairs = []
    
    # Simple regex-based extraction (for production, use tree-sitter)
    interface_pattern = r'(?:export\s+)?interface\s+(\w+)\s*(?:extends\s+[\w,\s]+)?\s*\{([^}]+)\}'
    type_pattern = r'(?:export\s+)?type\s+(\w+)\s*=\s*([^;]+);'
    
    for match in re.finditer(interface_pattern, content, re.DOTALL):
        name = match.group(1)
        body = match.group(2).strip()
        
        qa_pairs.append({
            'instruction': f'What is the `{name}` interface in {file_path.name}?',
            'input': f'```typescript\ninterface {name} {{\n{body[:500]}\n}}\n```',
            'output': f'The `{name}` interface is defined in `{file_path.name}`. It has the following fields: {body[:1000]}.',
            'source': str(file_path)
        })
    
    return qa_pairs


def extract_readme_sections(file_path: Path) -> List[Dict]:
    """Extract Q&A from README files."""
    content = file_path.read_text(encoding='utf-8')
    qa_pairs = []
    
    # Extract sections
    sections = re.split(r'\n##?\s+', content)
    
    for section in sections[1:]:  # Skip title
        lines = section.split('\n')
        title = lines[0].strip()
        body = '\n'.join(lines[1:]).strip()[:1000]
        
        if len(body) > 100:
            qa_pairs.append({
                'instruction': f'What does the NYX documentation say about "{title}"?',
                'input': f'From {file_path.name}:',
                'output': f'According to the NYX documentation, {body}',
                'source': str(file_path)
            })
    
    return qa_pairs


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--codebase', default='.', help='Path to your codebase')
    parser.add_argument('--output', default='training_data/cleaned', help='Output directory')
    parser.add_argument('--max-files', type=int, default=1000, help='Max files to process')
    args = parser.parse_args()
    
    codebase = Path(args.codebase)
    output_dir = Path(args.output)
    
    # Find all source files
    extensions = ['.py', '.ts', '.tsx', '.js', '.jsx', '.md', '.mdx', '.rs', '.go']
    files = []
    for ext in extensions:
        files.extend(codebase.rglob(f'*{ext}'))
    
    # Exclude node_modules, .git, etc.
    exclude = ['node_modules', '.git', 'dist', 'build', '.next', '.turbo', 
               'training_data', 'models', 'llama.cpp']
    files = [f for f in files if not any(ex in str(f) for ex in exclude)]
    files = files[:args.max_files]
    
    print(f"📂 Found {len(files)} source files")
    
    all_qa = []
    
    for file_path in files:
        if file_path.suffix == '.py':
            all_qa.extend(extract_python_functions(file_path))
        elif file_path.suffix in ['.ts', '.tsx']:
            all_qa.extend(extract_typescript_interfaces(file_path))
        elif file_path.suffix in ['.md', '.mdx']:
            all_qa.extend(extract_readme_sections(file_path))
    
    print(f"📝 Extracted {len(all_qa)} Q&A pairs from codebase")
    
    # Load existing training data and merge
    existing_path = output_dir / 'cleaned_unsloth.json'
    if existing_path.exists():
        with open(existing_path, 'r') as f:
            existing = json.load(f)
    else:
        existing = []
    
    # Convert Q&A to ShareGPT format and merge
    for qa in all_qa:
        existing.append({
            'conversations': [
                {'from': 'human', 'value': f"{qa['instruction']}\n\n{qa['input']}"},
                {'from': 'gpt', 'value': qa['output']}
            ],
            'metadata': {'source': qa['source'], 'type': 'codebase_knowledge'}
        })
    
    # Save merged
    merged_path = output_dir / 'merged_training_data.json'
    with open(merged_path, 'w', encoding='utf-8') as f:
        json.dump(existing, f, indent=2, ensure_ascii=False)
    
    print(f"💾 Merged dataset: {merged_path}")
    print(f"   Total conversations: {len(existing)}")
    print(f"\n✅ Knowledge augmentation complete!")


if __name__ == '__main__':
    main()
```

Run it:

```bash
python scripts/augment_codebase.py \
    --codebase . \
    --output training_data/cleaned/ \
    --max-files 1000
```

### 6.2 Add Your Personal Documents (Optional)

For PDFs, notes, research papers:

```python
# scripts/augment_documents.py
# Requires: pip install pypdf langchain unstructured

from pathlib import Path
from langchain.document_loaders import PyPDFLoader, UnstructuredMarkdownLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
import json

def process_documents(doc_dir: Path, output_path: Path):
    splitter = RecursiveCharacterTextSplitter(chunk_size=1000, chunk_overlap=200)
    all_chunks = []
    
    for pdf in doc_dir.rglob('*.pdf'):
        loader = PyPDFLoader(str(pdf))
        pages = loader.load()
        chunks = splitter.split_documents(pages)
        all_chunks.extend(chunks)
    
    for md in doc_dir.rglob('*.md'):
        loader = UnstructuredMarkdownLoader(str(md))
        docs = loader.load()
        chunks = splitter.split_documents(docs)
        all_chunks.extend(chunks)
    
    # Convert chunks to Q&A pairs (use an existing model to generate questions)
    qa_pairs = []
    for chunk in all_chunks:
        qa_pairs.append({
            'conversations': [
                {'from': 'human', 'value': f'Context: {chunk.page_content[:800]}\n\nBased on this context, what is the key information?'},
                {'from': 'gpt', 'value': chunk.page_content[:500]}  # Simplified — in practice, use a model to generate good answers
            ]
        })
    
    # Merge with existing
    with open(output_path, 'r') as f:
        existing = json.load(f)
    
    existing.extend(qa_pairs)
    
    with open(output_path, 'w') as f:
        json.dump(existing, f, indent=2)

# Run
process_documents(Path('docs/'), Path('training_data/cleaned/merged_training_data.json'))
```

---

## 7. Phase 4: Fine-Tuning with LoRA

Now we train. This is the core step. We'll use **Unsloth** (fastest, easiest) for 2026.

### 7.1 Environment Setup

Choose ONE of these platforms:

#### Option A: Google Colab (Free, Recommended for Beginners)

```python
# Open this notebook in Colab: https://colab.research.google.com
# Or use this code in a new Colab notebook:

!pip install unsloth
!pip install transformers datasets trl
!pip install huggingface_hub

# Upload your training_data/ folder to Colab
# (Use the Files panel on the left, or mount Google Drive)
```

#### Option B: RunPod / Vast.ai (Best Performance)

```bash
# Rent an RTX 4090 instance on RunPod
# SSH into it and run:

pip install unsloth
pip install transformers datasets trl accelerate
pip install huggingface_hub

# Upload your training data
scp -r training_data/ root@your-runpod-ip:/workspace/
```

#### Option C: Local Machine (If You Have GPU)

```bash
# Create conda environment
conda create -n nyx-train python=3.11
conda activate nyx-train

pip install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
pip install unsloth
pip install transformers datasets trl accelerate
pip install huggingface_hub

# Verify GPU
python -c "import torch; print(torch.cuda.get_device_name(0))"
```

### 7.2 Training Script

Save as `scripts/train_nyx_model.py`:

```python
#!/usr/bin/env python3
"""
NYX Model Fine-Tuning Script
Trains a LoRA adapter on your NYX chat data using Unsloth.

Requirements:
    pip install unsloth transformers datasets trl accelerate

Usage:
    python scripts/train_nyx_model.py \
        --model unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit \
        --data training_data/cleaned/merged_training_data.json \
        --output models/nyx-lora-adapter \
        --epochs 3 \
        --rank 16
"""

import argparse
import json
from pathlib import Path
from datetime import datetime

import torch
from unsloth import FastLanguageModel, is_bfloat16_supported
from datasets import Dataset
from transformers import TrainingArguments
from trl import SFTTrainer


def load_dataset_from_json(data_path: Path, tokenizer):
    """Load and format training data for Unsloth."""
    
    with open(data_path, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    formatted_texts = []
    
    for item in data:
        messages = item.get('conversations', item.get('messages', []))
        
        # Convert to chat template format
        chat_messages = []
        for msg in messages:
            if msg.get('from') == 'human' or msg.get('role') == 'user':
                chat_messages.append({'role': 'user', 'content': msg.get('value', msg.get('content', ''))})
            elif msg.get('from') == 'gpt' or msg.get('role') == 'assistant':
                chat_messages.append({'role': 'assistant', 'content': msg.get('value', msg.get('content', ''))})
        
        # Add system prompt for NYX branding
        system_msg = {
            'role': 'system',
            'content': 'You are NYX AI, a helpful and intelligent assistant created by the NYX team. You provide accurate, detailed, and well-structured responses. You are running locally on the user\'s machine.'
        }
        chat_messages.insert(0, system_msg)
        
        # Apply chat template
        try:
            text = tokenizer.apply_chat_template(
                chat_messages,
                tokenize=False,
                add_generation_prompt=False,
            )
            formatted_texts.append(text)
        except Exception as e:
            print(f"Warning: Could not format conversation: {e}")
            continue
    
    return Dataset.from_dict({'text': formatted_texts})


def train_model(args):
    """Main training function."""
    
    print("=" * 60)
    print("🚀 NYX Model Fine-Tuning")
    print("=" * 60)
    print(f"Base model: {args.model}")
    print(f"Training data: {args.data}")
    print(f"Output: {args.output}")
    print(f"LoRA rank: {args.rank}")
    print(f"Epochs: {args.epochs}")
    print(f"Learning rate: {args.learning_rate}")
    print("=" * 60)
    
    # 1. Load model
    print("\n📥 Loading base model...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=args.model,
        max_seq_length=args.max_seq_length,
        dtype=None,  # Auto-detect
        load_in_4bit=True,  # QLoRA
    )
    
    # 2. Add LoRA adapters
    print("🔧 Configuring LoRA adapters...")
    model = FastLanguageModel.get_peft_model(
        model,
        r=args.rank,
        target_modules=[
            "q_proj", "k_proj", "v_proj", "o_proj",
            "gate_proj", "up_proj", "down_proj",
        ],
        lora_alpha=args.rank,  # Usually set equal to rank
        lora_dropout=0,  # 0 is optimized for Unsloth
        bias="none",
        use_gradient_checkpointing="unsloth",
        random_state=3407,
        use_rslora=False,  # Set True for very small ranks (<8)
    )
    
    # 3. Load dataset
    print("\n📊 Loading training data...")
    dataset = load_dataset_from_json(Path(args.data), tokenizer)
    print(f"   Training examples: {len(dataset)}")
    
    # 4. Split train/val
    dataset = dataset.shuffle(seed=42)
    train_size = int(len(dataset) * 0.95)
    train_dataset = dataset.select(range(train_size))
    eval_dataset = dataset.select(range(train_size, len(dataset)))
    
    print(f"   Train: {len(train_dataset)}, Validation: {len(eval_dataset)}")
    
    # 5. Training arguments
    training_args = TrainingArguments(
        per_device_train_batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        warmup_steps=args.warmup_steps,
        num_train_epochs=args.epochs,
        learning_rate=args.learning_rate,
        fp16=not is_bfloat16_supported(),
        bf16=is_bfloat16_supported(),
        logging_steps=10,
        optim="adamw_8bit",
        weight_decay=0.01,
        lr_scheduler_type="linear",
        seed=3407,
        output_dir=args.output,
        save_strategy="epoch",
        evaluation_strategy="steps",
        eval_steps=50,
        report_to="none",  # Set to "wandb" if you want logging
        remove_unused_columns=False,
    )
    
    # 6. Trainer
    trainer = SFTTrainer(
        model=model,
        tokenizer=tokenizer,
        train_dataset=train_dataset,
        eval_dataset=eval_dataset,
        dataset_text_field="text",
        max_seq_length=args.max_seq_length,
        dataset_num_proc=2,
        packing=False,
        args=training_args,
    )
    
    # 7. Train
    print("\n🏋️ Starting training...")
    print(f"   Estimated time: {args.epochs * 0.5:.0f}–{args.epochs * 2:.0f} hours")
    print("   (Press Ctrl+C to stop early)")
    print("-" * 60)
    
    trainer_stats = trainer.train()
    
    print("-" * 60)
    print(f"✅ Training complete!")
    print(f"   Final loss: {trainer_stats.training_loss:.4f}")
    print(f"   Training time: {trainer_stats.metrics.get('train_runtime', 0)/60:.1f} minutes")
    
    # 8. Save
    print(f"\n💾 Saving LoRA adapter to {args.output}")
    model.save_pretrained(args.output)
    tokenizer.save_pretrained(args.output)
    
    # Save training metadata
    metadata = {
        'trained_at': datetime.now().isoformat(),
        'base_model': args.model,
        'lora_rank': args.rank,
        'epochs': args.epochs,
        'learning_rate': args.learning_rate,
        'final_loss': trainer_stats.training_loss,
        'training_examples': len(train_dataset),
        'validation_examples': len(eval_dataset),
        'max_seq_length': args.max_seq_length,
        'trainer_stats': trainer_stats.metrics,
    }
    
    meta_path = Path(args.output) / 'training_metadata.json'
    with open(meta_path, 'w') as f:
        json.dump(metadata, f, indent=2)
    
    print(f"💾 Metadata: {meta_path}")
    
    # 9. Quick test
    print("\n🧪 Quick test — generating a sample response...")
    FastLanguageModel.for_inference(model)
    
    test_messages = [
        {'role': 'system', 'content': 'You are NYX AI, a helpful and intelligent assistant.'},
        {'role': 'user', 'content': 'What is NYX and how does it work?'}
    ]
    
    inputs = tokenizer.apply_chat_template(
        test_messages,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
    ).to("cuda")
    
    outputs = model.generate(
        input_ids=inputs,
        max_new_tokens=256,
        use_cache=True,
        temperature=0.7,
        top_p=0.9,
    )
    
    response = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
    print(f"\n📝 Sample output:\n{response[-500:]}")  # Last 500 chars
    
    print(f"\n🎉 Model training complete! Next: Merge and convert to GGUF")


def main():
    parser = argparse.ArgumentParser(description='Train NYX custom model')
    
    # Model config
    parser.add_argument('--model', default='unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit',
                        help='Base model to fine-tune')
    parser.add_argument('--data', required=True, help='Path to training JSON')
    parser.add_argument('--output', default='models/nyx-lora-adapter', help='Output directory')
    
    # LoRA config
    parser.add_argument('--rank', type=int, default=16, help='LoRA rank (8, 16, 32, 64)')
    parser.add_argument('--max-seq-length', type=int, default=2048, help='Max sequence length')
    
    # Training config
    parser.add_argument('--epochs', type=int, default=3, help='Training epochs')
    parser.add_argument('--batch-size', type=int, default=2, help='Per-device batch size')
    parser.add_argument('--gradient-accumulation', type=int, default=4, help='Gradient accumulation steps')
    parser.add_argument('--learning-rate', type=float, default=2e-4, help='Learning rate')
    parser.add_argument('--warmup-steps', type=int, default=10, help='Warmup steps')
    
    args = parser.parse_args()
    
    # Validate
    if not Path(args.data).exists():
        raise FileNotFoundError(f"Training data not found: {args.data}")
    
    Path(args.output).mkdir(parents=True, exist_ok=True)
    
    train_model(args)


if __name__ == '__main__':
    main()
```

### 7.3 Run the Training

```bash
# For 8B model on 12GB VRAM (RTX 3060/4060)
python scripts/train_nyx_model.py \
    --model unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit \
    --data training_data/cleaned/merged_training_data.json \
    --output models/nyx-lora-adapter \
    --rank 16 \
    --epochs 3 \
    --batch-size 2 \
    --gradient-accumulation 4

# For 1.5B model on 4GB VRAM (budget option)
python scripts/train_nyx_model.py \
    --model unsloth/Qwen2.5-1.5B-Instruct-bnb-4bit \
    --data training_data/cleaned/merged_training_data.json \
    --output models/nyx-lora-adapter-1.5b \
    --rank 8 \
    --epochs 5 \
    --batch-size 4
```

**Training time estimates:**

| Model | Data Size | GPU | VRAM | Epochs | Time | Cost |
|-------|-----------|-----|------|--------|------|------|
| Llama 3.1 8B | 1,000 conversations | RTX 3060 12GB | 8 GB | 3 | 2–3 hours | $0 (local) |
| Llama 3.1 8B | 5,000 conversations | RTX 4090 | 12 GB | 3 | 1–2 hours | $1–$2 (cloud) |
| Qwen 2.5 1.5B | 1,000 conversations | GTX 1650 | 4 GB | 5 | 1–2 hours | $0 (local) |
| Qwen 2.5 72B | 5,000 conversations | A100 40GB | 35 GB | 2 | 4–6 hours | $5–$8 (cloud) |

---

## 8. Phase 5: Convert to GGUF for NYX

NYX uses **llama.cpp** for local inference. We need to:
1. Merge the LoRA adapter into the base model
2. Convert the merged model to GGUF format
3. Quantize to different levels for different VRAM budgets

### 8.1 Merge and Convert Script

Save as `scripts/convert_to_gguf.py`:

```python
#!/usr/bin/env python3
"""
NYX Model Converter
Merges LoRA adapter with base model and converts to GGUF for llama.cpp.

Requirements:
    pip install unsloth transformers
    # llama.cpp must be built locally (see below)

Usage:
    python scripts/convert_to_gguf.py \
        --base-model unsloth/Meta-Llama-3.1-8B-Instruct \
        --adapter models/nyx-lora-adapter \
        --output models/nyx-merged \
        --gguf-output models/nyx-ai-8b.gguf
"""

import argparse
import subprocess
from pathlib import Path
from unsloth import FastLanguageModel


def merge_adapter(base_model: str, adapter_path: str, output_path: str):
    """Merge LoRA adapter into base model."""
    print(f"📥 Loading base model: {base_model}")
    print(f"🔗 Loading adapter: {adapter_path}")
    
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=base_model,
    )
    
    # Load and merge adapter
    model = model.merge_and_unload()
    
    print(f"💾 Saving merged model to {output_path}")
    model.save_pretrained(output_path)
    tokenizer.save_pretrained(output_path)
    
    print(f"✅ Merged model saved!")
    return output_path


def convert_to_gguf(merged_path: str, gguf_output: str, quantization: str = 'Q4_K_M'):
    """Convert merged model to GGUF using llama.cpp."""
    
    llama_cpp_path = Path('llama.cpp')
    
    if not llama_cpp_path.exists():
        print("📦 Cloning llama.cpp...")
        subprocess.run(['git', 'clone', 'https://github.com/ggerganov/llama.cpp'], check=True)
        
        print("🔨 Building llama.cpp...")
        # Build with CUDA support if available
        subprocess.run(['make', '-C', 'llama.cpp', '-j'], check=True)
    
    convert_script = llama_cpp_path / 'convert_hf_to_gguf.py'
    
    if not convert_script.exists():
        # Try alternative path
        convert_script = llama_cpp_path / 'convert.py'
    
    print(f"🔄 Converting to GGUF with {quantization} quantization...")
    
    cmd = [
        'python', str(convert_script),
        merged_path,
        '--outfile', gguf_output,
        '--outtype', quantization.lower().replace('_', '_')
    ]
    
    subprocess.run(cmd, check=True)
    
    print(f"✅ GGUF model saved: {gguf_output}")
    
    # Show file size
    gguf_path = Path(gguf_output)
    size_mb = gguf_path.stat().st_size / (1024 * 1024)
    print(f"   File size: {size_mb:.1f} MB")


def quantize_variants(merged_path: str, output_base: str):
    """Create multiple quantization variants for different VRAM budgets."""
    
    quantizations = [
        ('Q4_K_M', 'balanced'),      # ~4.5 GB VRAM, good quality
        ('Q5_K_M', 'high_quality'),  # ~5.5 GB VRAM, better quality
        ('Q8_0', 'max_quality'),     # ~8 GB VRAM, near-lossless
    ]
    
    for quant, label in quantizations:
        output_name = f"{output_base}-{quant.lower()}.gguf"
        print(f"\n🎯 Creating {label} variant ({quant})...")
        convert_to_gguf(merged_path, output_name, quant)


def main():
    parser = argparse.ArgumentParser(description='Convert NYX model to GGUF')
    parser.add_argument('--base-model', required=True, help='Base model name or path')
    parser.add_argument('--adapter', required=True, help='LoRA adapter path')
    parser.add_argument('--merged-output', default='models/nyx-merged', help='Merged model output')
    parser.add_argument('--gguf-output', default='models/nyx-ai-8b.gguf', help='GGUF output path')
    parser.add_argument('--quantization', default='Q4_K_M', help='Quantization type')
    parser.add_argument('--all-variants', action='store_true', help='Create all quantization variants')
    args = parser.parse_args()
    
    # Step 1: Merge
    merged_path = merge_adapter(args.base_model, args.adapter, args.merged_output)
    
    # Step 2: Convert
    if args.all_variants:
        base_name = args.gguf_output.replace('.gguf', '')
        quantize_variants(merged_path, base_name)
    else:
        convert_to_gguf(merged_path, args.gguf_output, args.quantization)
    
    print("\n🎉 Conversion complete! Your model is ready for NYX.")


if __name__ == '__main__':
    main()
```

### 8.2 Run the Conversion

```bash
# Option 1: Single quantization (recommended for first try)
python scripts/convert_to_gguf.py \
    --base-model unsloth/Meta-Llama-3.1-8B-Instruct \
    --adapter models/nyx-lora-adapter \
    --merged-output models/nyx-merged \
    --gguf-output models/nyx-ai-8b-q4_k_m.gguf \
    --quantization Q4_K_M

# Option 2: All variants (for distribution)
python scripts/convert_to_gguf.py \
    --base-model unsloth/Meta-Llama-3.1-8B-Instruct \
    --adapter models/nyx-lora-adapter \
    --merged-output models/nyx-merged \
    --all-variants

# Expected output:
# models/nyx-ai-8b-q4_k_m.gguf  (~4.5 GB)
# models/nyx-ai-8b-q5_k_m.gguf  (~5.5 GB)
# models/nyx-ai-8b-q8_0.gguf    (~8 GB)
```

### 8.3 Quantization Quick Reference

| Quantization | VRAM | Quality | Speed | Use Case |
|-------------|------|---------|-------|----------|
| **Q4_K_M** | 4.5 GB | 85% | Fast | Default for most users |
| **Q5_K_M** | 5.5 GB | 90% | Fast | Better quality, still fast |
| **Q8_0** | 8 GB | 95% | Medium | Best quality before full precision |
| **FP16** | 16 GB | 100% | Slow | Full precision, only for large GPUs |

---

## 9. Phase 6: Brand the Model as NYX

This is where your model becomes **your** model. We need to:
1. Set a system prompt that introduces itself as NYX
2. Configure default behavior and personality
3. Add metadata and versioning

### 9.1 NYX System Prompt

Create a file `models/nyx-system-prompt.txt`:

```
You are NYX AI, an intelligent assistant created by the NYX team. You are running locally on the user's machine, providing privacy-first, zero-latency AI assistance.

Your personality:
- Direct and helpful: You get straight to the point without unnecessary fluff.
- Technically precise: You provide accurate, detailed technical answers with code examples when relevant.
- Conversational: You speak naturally, not like a robot.
- Honest: You admit when you don't know something rather than making things up.
- Proactive: You anticipate follow-up questions and provide complete solutions.

Your capabilities:
- Writing, editing, and debugging code in any programming language
- Explaining complex technical concepts clearly
- Analyzing and summarizing documents and code
- Brainstorming and creative problem-solving
- Step-by-step reasoning and mathematical calculations

When writing code:
- Always include comments explaining the logic
- Use modern best practices and idiomatic patterns
- Handle edge cases and errors appropriately
- Prefer clarity over cleverness

When you don't know something:
- Say "I don't have enough information to answer that accurately"
- Suggest what the user could look up or try
- Never hallucinate facts, URLs, or code

Remember: You are NYX. You are local, private, and built for power users.
```

### 9.2 Model Metadata & Branding

Create a `models/nyx-model-metadata.json`:

```json
{
  "name": "NYX AI",
  "version": "1.0.0",
  "codename": "Nyx-Prime",
  "description": "A custom fine-tuned AI assistant built on Llama 3.1 8B, trained on NYX conversation data and optimized for coding, reasoning, and technical assistance.",
  "author": "NYX Team",
  "license": "LLAMA_3_1_LICENSE",
  "base_model": "meta-llama/Meta-Llama-3.1-8B-Instruct",
  "fine_tuning": {
    "method": "LoRA",
    "rank": 16,
    "training_data": "nyx_conversations + codebase + documentation",
    "training_examples": 5000,
    "epochs": 3,
    "learning_rate": 0.0002,
    "final_loss": 1.42
  },
  "capabilities": {
    "context_length": 8192,
    "languages": ["English", "Python", "TypeScript", "JavaScript", "Rust", "Go"],
    "specialties": ["coding", "debugging", "technical_writing", "reasoning"]
  },
  "quantization": {
    "Q4_K_M": {
      "file": "nyx-ai-8b-q4_k_m.gguf",
      "vram_required_gb": 4.5,
      "quality_score": 85
    },
    "Q5_K_M": {
      "file": "nyx-ai-8b-q5_k_m.gguf",
      "vram_required_gb": 5.5,
      "quality_score": 90
    },
    "Q8_0": {
      "file": "nyx-ai-8b-q8_0.gguf",
      "vram_required_gb": 8.0,
      "quality_score": 95
    }
  },
  "system_prompt": "You are NYX AI, an intelligent assistant created by the NYX team. You are running locally on the user's machine, providing privacy-first, zero-latency AI assistance. You are direct, technically precise, and honest.",
  "recommended_settings": {
    "temperature": 0.7,
    "top_p": 0.9,
    "top_k": 40,
    "repeat_penalty": 1.1,
    "max_tokens": 4096
  }
}
```

---

## 10. Phase 7: Register in NYX Model Registry

Now we add your custom model to NYX so it appears in the model selector.

### 10.1 Create Model Registry Entry

In your NYX codebase, find or create the model registry configuration. This is typically in:
- `packages/shared/src/models/` or
- `apps/web/src/features/model-registry/` or
- `packages/shared/src/config/models.ts`

Add this entry:

```typescript
// packages/shared/src/config/models.ts (or equivalent)
export const NYX_CUSTOM_MODELS: LocalModelConfig[] = [
  {
    id: 'nyx-ai-8b-q4',
    name: 'NYX AI 8B',
    shortName: 'NYX',
    description: 'Custom fine-tuned model trained on your NYX conversations. Optimized for coding and technical assistance.',
    version: '1.0.0',
    provider: 'local',
    family: 'llama',
    baseModel: 'Meta-Llama-3.1-8B-Instruct',
    
    // Download info
    downloadUrl: 'https://github.com/yourusername/nyx-models/releases/download/v1.0.0/nyx-ai-8b-q4_k_m.gguf',
    // Or for local-only:
    // localPath: '.nyx-models/nyx-ai-8b-q4_k_m.gguf',
    
    // File info
    filename: 'nyx-ai-8b-q4_k_m.gguf',
    sha256: 'YOUR_SHA256_HASH_HERE',  // Compute with: sha256sum models/nyx-ai-8b-q4_k_m.gguf
    sizeBytes: 4_718_592_000,  // ~4.5 GB
    
    // Hardware requirements
    quantization: 'Q4_K_M',
    parameters: '8B',
    vramRequiredGB: 4.5,
    ramRequiredGB: 6,
    contextLength: 8192,
    
    // Branding
    icon: '/icons/nyx-model-icon.png',  // Create a custom icon
    color: '#0ea5e9',  // NYX blue
    isOfficial: true,  // Mark as official NYX model
    isCustom: true,    // Flag as user-trained
    
    // Capabilities
    capabilities: ['chat', 'code', 'reasoning', 'analysis'],
    languages: ['en', 'python', 'typescript', 'javascript'],
    
    // System prompt (this is the KEY branding element)
    systemPrompt: 'You are NYX AI, an intelligent assistant created by the NYX team. You are running locally on the user\'s machine, providing privacy-first, zero-latency AI assistance. You are direct, technically precise, and honest.',
    
    // Recommended inference settings
    defaultSettings: {
      ngl: 99,           // GPU layers (all)
      ctxSize: 8192,     // Context window
      temperature: 0.7,  // Balanced creativity
      topP: 0.9,
      topK: 40,
      repeatPenalty: 1.1,
      batchSize: 512,
      cpuThreads: 4,
    },
    
    // Alternative quantizations
    variants: [
      {
        id: 'nyx-ai-8b-q5',
        name: 'NYX AI 8B (High Quality)',
        quantization: 'Q5_K_M',
        vramRequiredGB: 5.5,
        filename: 'nyx-ai-8b-q5_k_m.gguf',
      },
      {
        id: 'nyx-ai-8b-q8',
        name: 'NYX AI 8B (Max Quality)',
        quantization: 'Q8_0',
        vramRequiredGB: 8.0,
        filename: 'nyx-ai-8b-q8_0.gguf',
      }
    ],
    
    // Metadata
    metadata: {
      trainedOn: 'NYX conversation history + codebase + documentation',
      trainingDate: '2026-01-15',
      trainingExamples: 5000,
      finalLoss: 1.42,
      loraRank: 16,
    }
  }
];
```

### 10.2 Add Custom Model Icon

Create a custom model icon for NYX AI:

```bash
# Create a simple branded icon (replace with your actual design)
# Size: 128x128 PNG, transparent background
# Use NYX's brand color (#0ea5e9 blue) with a model chip or brain icon

# Place it in:
# apps/web/public/icons/nyx-model-icon.png
# apps/web/public/icons/nyx-model-icon@2x.png (256x256)
```

### 10.3 Update Model Registry UI

In your NYX web app, modify the model registry to show custom models differently:

```tsx
// apps/web/src/features/model-registry/components/ModelCard.tsx (or similar)

import { Badge } from '@nyx/ui';

export function ModelCard({ model }: { model: LocalModelConfig }) {
  return (
    <div className="model-card">
      <div className="model-header">
        <img src={model.icon} alt={model.name} className="model-icon" />
        <div className="model-info">
          <h3>{model.name}</h3>
          {model.isCustom && (
            <Badge variant="primary" className="bg-blue-500">
              🏠 Your Custom Model
            </Badge>
          )}
          {model.isOfficial && (
            <Badge variant="secondary">
              ⭐ Official
            </Badge>
          )}
        </div>
      </div>
      
      <p className="model-description">{model.description}</p>
      
      <div className="model-stats">
        <span>📊 {model.parameters} params</span>
        <span>🧠 {model.vramRequiredGB} GB VRAM</span>
        <span>📏 {model.contextLength.toLocaleString()} context</span>
      </div>
      
      {model.metadata?.trainedOn && (
        <div className="model-training-info">
          <small>Trained on: {model.metadata.trainedOn}</small>
          <small>Loss: {model.metadata.finalLoss}</small>
        </div>
      )}
    </div>
  );
}
```

---

## 11. Phase 8: A/B Testing & Evaluation

Before releasing your model, test it against the original base model.

### 11.1 Evaluation Script

Save as `scripts/evaluate_nyx_model.py`:

```python
#!/usr/bin/env python3
"""
NYX Model Evaluator
Compares your fine-tuned model against the base model on key tasks.

Usage:
    python scripts/evaluate_nyx_model.py \
        --base-model models/nyx-merged \
        --test-prompts eval/prompts.json \
        --output eval/results.json
"""

import json
import argparse
from pathlib import Path
from typing import List, Dict
import torch
from transformers import AutoModelForCausalLM, AutoTokenizer
from unsloth import FastLanguageModel


def load_model(model_path: str):
    """Load a model for evaluation."""
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name=model_path,
        max_seq_length=2048,
    )
    FastLanguageModel.for_inference(model)
    return model, tokenizer


def generate_response(model, tokenizer, prompt: str, system: str = None, max_tokens: int = 512) -> str:
    """Generate a single response."""
    
    messages = []
    if system:
        messages.append({'role': 'system', 'content': system})
    messages.append({'role': 'user', 'content': prompt})
    
    inputs = tokenizer.apply_chat_template(
        messages,
        tokenize=True,
        add_generation_prompt=True,
        return_tensors="pt",
    ).to("cuda")
    
    outputs = model.generate(
        input_ids=inputs,
        max_new_tokens=max_tokens,
        use_cache=True,
        temperature=0.7,
        top_p=0.9,
        do_sample=True,
    )
    
    response = tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
    
    # Extract only the assistant's response (remove prompt)
    try:
        # Find the last occurrence of the assistant token
        assistant_marker = "assistant"
        last_assistant = response.rfind(assistant_marker)
        if last_assistant != -1:
            response = response[last_assistant + len(assistant_marker):].strip()
    except:
        pass
    
    return response


def evaluate_model(model_path: str, test_prompts: List[Dict], system_prompt: str) -> List[Dict]:
    """Evaluate a model on all test prompts."""
    
    print(f"\n📥 Loading model: {model_path}")
    model, tokenizer = load_model(model_path)
    
    results = []
    
    for i, test in enumerate(test_prompts, 1):
        print(f"\n📝 Test {i}/{len(test_prompts)}: {test['category']}")
        print(f"   Prompt: {test['prompt'][:100]}...")
        
        response = generate_response(
            model, tokenizer,
            test['prompt'],
            system_prompt,
            max_tokens=test.get('max_tokens', 512)
        )
        
        results.append({
            'category': test['category'],
            'prompt': test['prompt'],
            'expected_keywords': test.get('expected_keywords', []),
            'response': response,
            'response_length': len(response),
        })
        
        print(f"   Response: {response[:200]}...")
    
    return results


def score_results(results: List[Dict]) -> Dict:
    """Score evaluation results."""
    
    scores = {
        'total_tests': len(results),
        'keyword_match_rate': 0,
        'avg_response_length': 0,
        'category_scores': {}
    }
    
    total_keyword_matches = 0
    total_keywords = 0
    
    for r in results:
        # Check keyword matches
        matches = sum(1 for kw in r['expected_keywords'] if kw.lower() in r['response'].lower())
        total_keyword_matches += matches
        total_keywords += len(r['expected_keywords'])
        
        # Category scoring
        cat = r['category']
        if cat not in scores['category_scores']:
            scores['category_scores'][cat] = {'tests': 0, 'keyword_matches': 0, 'total_keywords': 0}
        scores['category_scores'][cat]['tests'] += 1
        scores['category_scores'][cat]['keyword_matches'] += matches
        scores['category_scores'][cat]['total_keywords'] += len(r['expected_keywords'])
    
    scores['keyword_match_rate'] = total_keyword_matches / max(total_keywords, 1)
    scores['avg_response_length'] = sum(r['response_length'] for r in results) / len(results)
    
    # Calculate per-category rates
    for cat, data in scores['category_scores'].items():
        data['match_rate'] = data['keyword_matches'] / max(data['total_keywords'], 1)
    
    return scores


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--base-model', required=True, help='Base model path')
    parser.add_argument('--finetuned-model', required=True, help='Fine-tuned model path')
    parser.add_argument('--test-prompts', default='eval/test_prompts.json', help='Test prompts JSON')
    parser.add_argument('--output', default='eval/results.json', help='Output results')
    parser.add_argument('--system-prompt', default='You are a helpful assistant.')
    args = parser.parse_args()
    
    # Load test prompts
    with open(args.test_prompts, 'r') as f:
        test_prompts = json.load(f)
    
    print(f"📊 Loaded {len(test_prompts)} test prompts")
    
    # Evaluate base model
    print("\n" + "=" * 60)
    print("🏛️  BASE MODEL EVALUATION")
    print("=" * 60)
    base_results = evaluate_model(args.base_model, test_prompts, args.system_prompt)
    base_scores = score_results(base_results)
    
    # Evaluate fine-tuned model
    print("\n" + "=" * 60)
    print("🚀 NYX MODEL EVALUATION")
    print("=" * 60)
    nyx_results = evaluate_model(args.finetuned_model, test_prompts, args.system_prompt)
    nyx_scores = score_results(nyx_results)
    
    # Compare
    print("\n" + "=" * 60)
    print("📈 COMPARISON")
    print("=" * 60)
    
    print(f"\n{'Metric':<30} {'Base':<15} {'NYX':<15} {'Improvement':<15}")
    print("-" * 75)
    
    metrics = [
        ('Keyword Match Rate', 'keyword_match_rate', '%'),
        ('Avg Response Length', 'avg_response_length', ' chars'),
    ]
    
    for name, key, unit in metrics:
        base_val = base_scores[key]
        nyx_val = nyx_scores[key]
        improvement = ((nyx_val - base_val) / max(base_val, 0.001)) * 100
        
        if unit == '%':
            print(f"{name:<30} {base_val*100:.1f}%{unit:<10} {nyx_val*100:.1f}%{unit:<10} {improvement:+.1f}%")
        else:
            print(f"{name:<30} {base_val:.0f}{unit:<10} {nyx_val:.0f}{unit:<10} {improvement:+.1f}%")
    
    # Category breakdown
    print(f"\n{'Category':<25} {'Base Match':<15} {'NYX Match':<15} {'Improvement':<15}")
    print("-" * 70)
    
    all_categories = set(base_scores['category_scores'].keys()) | set(nyx_scores['category_scores'].keys())
    for cat in sorted(all_categories):
        base_rate = base_scores['category_scores'].get(cat, {}).get('match_rate', 0)
        nyx_rate = nyx_scores['category_scores'].get(cat, {}).get('match_rate', 0)
        improvement = ((nyx_rate - base_rate) / max(base_rate, 0.001)) * 100
        
        print(f"{cat:<25} {base_rate*100:.1f}%{'':<10} {nyx_rate*100:.1f}%{'':<10} {improvement:+.1f}%")
    
    # Save detailed results
    Path(args.output).parent.mkdir(parents=True, exist_ok=True)
    with open(args.output, 'w') as f:
        json.dump({
            'base_model': {
                'path': args.base_model,
                'scores': base_scores,
                'results': base_results,
            },
            'nyx_model': {
                'path': args.finetuned_model,
                'scores': nyx_scores,
                'results': nyx_results,
            }
        }, f, indent=2)
    
    print(f"\n💾 Detailed results saved to {args.output}")
    
    # Verdict
    if nyx_scores['keyword_match_rate'] > base_scores['keyword_match_rate']:
        print("\n✅ NYX model performs BETTER than base model!")
    elif nyx_scores['keyword_match_rate'] >= base_scores['keyword_match_rate'] * 0.95:
        print("\n⚠️  NYX model performs SIMILAR to base model (acceptable)")
    else:
        print("\n❌ NYX model performs WORSE than base model — needs more training data")


if __name__ == '__main__':
    main()
```

### 11.2 Create Test Prompts

Save as `eval/test_prompts.json`:

```json
[
  {
    "category": "coding",
    "prompt": "Write a Python function to parse a JSON file and validate it against a schema using pydantic.",
    "expected_keywords": ["def", "pydantic", "BaseModel", "json", "validate", "parse"],
    "max_tokens": 512
  },
  {
    "category": "coding",
    "prompt": "How do I set up a React component with TypeScript that fetches data from an API and handles loading states?",
    "expected_keywords": ["useState", "useEffect", "fetch", "TypeScript", "interface", "loading"],
    "max_tokens": 512
  },
  {
    "category": "nyx_specific",
    "prompt": "What is NYX and how does it work?",
    "expected_keywords": ["NYX", "AI", "local", "privacy", "model", "client"],
    "max_tokens": 256
  },
  {
    "category": "nyx_specific",
    "prompt": "How do I run a local model in NYX?",
    "expected_keywords": ["download", "GGUF", "GPU", "local", "model", "settings"],
    "max_tokens": 256
  },
  {
    "category": "reasoning",
    "prompt": "Explain the trade-offs between using REST APIs vs GraphQL for a mobile app backend.",
    "expected_keywords": ["REST", "GraphQL", "over-fetching", "under-fetching", "caching", "complexity"],
    "max_tokens": 512
  },
  {
    "category": "reasoning",
    "prompt": "Should I use SQLite or PostgreSQL for a local desktop app that needs to store chat history?",
    "expected_keywords": ["SQLite", "PostgreSQL", "local", "embedded", "serverless", "concurrency"],
    "max_tokens": 512
  },
  {
    "category": "debugging",
    "prompt": "I'm getting a CORS error when my React frontend tries to call my Fastify backend on localhost:3001. How do I fix it?",
    "expected_keywords": ["CORS", "@fastify/cors", "origin", "credentials", "localhost", "pre-flight"],
    "max_tokens": 512
  },
  {
    "category": "personality",
    "prompt": "Who are you?",
    "expected_keywords": ["NYX", "AI", "assistant", "local", "privacy"],
    "max_tokens": 128
  }
]
```

Run evaluation:

```bash
python scripts/evaluate_nyx_model.py \
    --base-model unsloth/Meta-Llama-3.1-8B-Instruct \
    --finetuned-model models/nyx-merged \
    --test-prompts eval/test_prompts.json \
    --output eval/results.json \
    --system-prompt "You are NYX AI, a helpful and intelligent assistant."
```

---

## 12. Phase 9: Continuous Learning Pipeline

Set up a system to automatically retrain your model as you collect more chat data.

### 12.1 Weekly Retraining Script

Save as `scripts/continuous_learning.py`:

```python
#!/usr/bin/env python3
"""
NYX Continuous Learning Pipeline
Automatically retrain the model when new chat data exceeds a threshold.

Usage (run weekly via cron):
    python scripts/continuous_learning.py \
        --db .nyx-state/nyx.db \
        --model models/nyx-lora-adapter \
        --min-new-conversations 100 \
        --output models/nyx-lora-adapter-v2
"""

import sqlite3
import json
import argparse
from pathlib import Path
from datetime import datetime, timedelta
import subprocess


def count_new_conversations(db_path: Path, since: datetime) -> int:
    """Count conversations created since last training."""
    conn = sqlite3.connect(str(db_path))
    cursor = conn.cursor()
    
    since_ts = int(since.timestamp() * 1000)
    
    cursor.execute("""
        SELECT COUNT(DISTINCT id) FROM chat_conversations
        WHERE created_at > ?
    """, (since_ts,))
    
    count = cursor.fetchone()[0]
    conn.close()
    return count


def get_last_training_date() -> datetime:
    """Get date of last training from metadata."""
    meta_files = list(Path('models').glob('*/training_metadata.json'))
    
    if not meta_files:
        return datetime.min
    
    latest = datetime.min
    for meta_file in meta_files:
        with open(meta_file) as f:
            meta = json.load(f)
        trained_at = datetime.fromisoformat(meta['trained_at'])
        if trained_at > latest:
            latest = trained_at
    
    return latest


def run_pipeline(args):
    """Main continuous learning pipeline."""
    
    print("🔄 NYX Continuous Learning Pipeline")
    print("=" * 50)
    
    # Check if enough new data exists
    last_train = get_last_training_date()
    new_count = count_new_conversations(Path(args.db), last_train)
    
    print(f"📊 Last training: {last_train}")
    print(f"📊 New conversations since then: {new_count}")
    print(f"📊 Threshold for retraining: {args.min_new}")
    
    if new_count < args.min_new:
        print(f"\n⏭️  Not enough new data ({new_count} < {args.min_new}). Skipping.")
        return
    
    print(f"\n🚀 Starting incremental training with {new_count} new conversations...")
    
    # Step 1: Extract new data
    print("\n[1/5] Extracting new conversations...")
    subprocess.run([
        'python', 'scripts/extract_nyx_data.py',
        '--db', args.db,
        '--output', 'training_data/incremental/',
        '--since', last_train.strftime('%Y-%m-%d'),
    ], check=True)
    
    # Step 2: Clean
    print("\n[2/5] Cleaning new data...")
    subprocess.run([
        'python', 'scripts/clean_training_data.py',
        '--input', 'training_data/incremental/nyx_sharegpt.json',
        '--output', 'training_data/incremental/cleaned/',
    ], check=True)
    
    # Step 3: Merge with existing training data
    print("\n[3/5] Merging with existing dataset...")
    # (Implementation: append new cleaned data to existing merged dataset)
    
    # Step 4: Incremental training
    print("\n[4/5] Running incremental training...")
    # Use lower learning rate to avoid catastrophic forgetting
    subprocess.run([
        'python', 'scripts/train_nyx_model.py',
        '--model', args.base_model,
        '--data', 'training_data/merged/updated.json',
        '--output', args.output,
        '--rank', str(args.rank),
        '--epochs', '1',  # Only 1 epoch for incremental
        '--learning-rate', '5e-5',  # Lower LR for incremental
    ], check=True)
    
    # Step 5: Convert and evaluate
    print("\n[5/5] Converting to GGUF...")
    subprocess.run([
        'python', 'scripts/convert_to_gguf.py',
        '--base-model', args.base_model,
        '--adapter', args.output,
        '--merged-output', f'{args.output}-merged',
        '--gguf-output', f'models/nyx-ai-v{args.version}.gguf',
    ], check=True)
    
    print(f"\n✅ Incremental training complete!")
    print(f"   New model: {args.output}")
    print(f"   GGUF: models/nyx-ai-v{args.version}.gguf")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--db', default='.nyx-state/nyx.db')
    parser.add_argument('--base-model', default='unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit')
    parser.add_argument('--model', default='models/nyx-lora-adapter')
    parser.add_argument('--output', default='models/nyx-lora-adapter-v2')
    parser.add_argument('--min-new', type=int, default=100, help='Min new conversations to trigger retraining')
    parser.add_argument('--rank', type=int, default=16)
    parser.add_argument('--version', default='2.0')
    args = parser.parse_args()
    
    run_pipeline(args)


if __name__ == '__main__':
    main()
```

### 12.2 Schedule with Cron (Linux/Mac) or Task Scheduler (Windows)

```bash
# Linux/Mac: Add to crontab (weekly on Sunday at 2 AM)
0 2 * * 0 cd /path/to/nyx && python scripts/continuous_learning.py >> logs/training.log 2>&1

# Windows: Use Task Scheduler to run weekly
# Task: "NYX Model Retraining"
# Trigger: Weekly, Sunday at 2:00 AM
# Action: python scripts/continuous_learning.py
# Start in: C:\path\to\nyx
```

---

## 13. Troubleshooting

### Common Issues

| Problem | Cause | Solution |
|---------|-------|----------|
| **Out of memory during training** | VRAM too small for model | Use QLoRA (4-bit), reduce batch size, use smaller model (1.5B) |
| **Model outputs gibberish** | Overtraining / bad data | Reduce epochs, clean data better, lower learning rate |
| **Model forgets general knowledge** | Catastrophic forgetting | Mix in public datasets, use lower LR, use replay buffer |
| **Slow training** | CPU instead of GPU | Check `torch.cuda.is_available()`, install CUDA-enabled PyTorch |
| **GGUF conversion fails** | llama.cpp not built | Run `make -C llama.cpp`, or install pre-built binary |
| **Model doesn't appear in NYX** | Registry not updated | Check model ID matches, verify file path, restart NYX server |
| **Responses are too short** | Context length too small | Increase `ctx_size` to 4096 or 8192 in model settings |
| **Responses are too long/ranting** | Temperature too high | Reduce temperature to 0.5–0.7, increase repeat penalty |
| **Model doesn't know it's NYX** | System prompt not loaded | Verify system prompt is passed in `system` message, not just metadata |
| **Training data too small** | Not enough conversations | Collect 500+ multi-turn conversations minimum, add public datasets |

---

## 14. Legal & Ethical Checklist

Before distributing your model, verify:

- [ ] **Base model license**: Llama 3.1 requires accepting Meta's license. Qwen 2.5 is Apache 2.0 (fully open). Check the license of your chosen base model.
- [ ] **API Terms of Service**: If you used Gemini, Claude, or OpenAI outputs in your training data, check their ToS. Many prohibit training competing models on their outputs.
- [ ] **Data scrubbing**: Verify no API keys, passwords, or personal information leaked into training data (run the cleaner script).
- [ ] **Attribution**: Include attribution to the base model (e.g., "Based on Meta Llama 3.1 8B").
- [ ] **No malicious content**: Ensure training data doesn't contain instructions for harmful activities.
- [ ] **Privacy**: If you share the model, consider that it might memorize personal information from your chats. Use differential privacy techniques if sharing publicly.
- [ ] **Commercial use**: Check if your base model allows commercial use (Llama 3.1 does for businesses < 700M users; Qwen 2.5 does via Apache 2.0).

---

## Quick-Start Cheat Sheet

```bash
# 1. Extract data
python scripts/extract_nyx_data.py --db .nyx-state/nyx.db --output training_data/

# 2. Clean data
python scripts/clean_training_data.py --input training_data/nyx_sharegpt.json --output training_data/cleaned/

# 3. Augment with codebase
python scripts/augment_codebase.py --codebase . --output training_data/cleaned/

# 4. Train model (Cloud GPU recommended)
#   - Go to RunPod, rent RTX 4090 ($0.50/hr)
#   - Upload training_data/ folder
#   - Run:
python scripts/train_nyx_model.py \
    --model unsloth/Meta-Llama-3.1-8B-Instruct-bnb-4bit \
    --data training_data/cleaned/merged_training_data.json \
    --output models/nyx-lora-adapter \
    --rank 16 --epochs 3

# 5. Convert to GGUF
python scripts/convert_to_gguf.py \
    --base-model unsloth/Meta-Llama-3.1-8B-Instruct \
    --adapter models/nyx-lora-adapter \
    --merged-output models/nyx-merged \
    --gguf-output models/nyx-ai-8b-q4_k_m.gguf

# 6. Add to NYX registry
#    Edit packages/shared/src/config/models.ts
#    Add the NYX_AI model entry (see Phase 7)

# 7. Restart NYX and test!
```

**Total time from start to finish:** 3–5 days (mostly waiting for training)
**Total cost:** $0–$10 (free on Colab, $2–$10 on RunPod for a few hours)
**Result:** A custom "NYX AI" model that knows your style, your codebase, and speaks with your brand identity.

---

*Guide version: 2026 Edition  
Last updated: 2026-06-18  
For updates, check: https://github.com/yourusername/nyx-models*
