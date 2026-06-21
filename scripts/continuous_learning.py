import os
import sqlite3
import json
import torch
from datasets import Dataset
from trl import SFTTrainer
from transformers import TrainingArguments
from unsloth import FastLanguageModel

# Configuration
DB_PATH = os.environ.get('DB_PATH', os.path.join(os.path.dirname(__file__), '..', 'src-tauri', 'nyx_chat.db'))
MODEL_NAME = "Qwen/Qwen2.5-Coder-7B-Instruct"
OUTPUT_DIR = os.path.join(os.path.dirname(__file__), '..', 'models', 'lora_adapters')

def fetch_recent_data():
    """Fetch high-quality chat data and episodic memory from SQLite"""
    print(f"Fetching data from {DB_PATH}...")
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # We fetch recent high-quality interactions (assuming we have a metric, or just fetch all recent)
    try:
        cursor.execute("SELECT id, role, content FROM messages ORDER BY id DESC LIMIT 200")
        messages = cursor.fetchall()
    except sqlite3.OperationalError:
        print("Table 'messages' not found or schema mismatch. Returning dummy data for init.")
        return [{"instruction": "Hello", "output": "Hi there!"}]
    
    dataset_rows = []
    # Basic pairing logic: User -> Assistant
    for i in range(len(messages) - 1):
        if messages[i+1][1] == "user" and messages[i][1] == "assistant":
            dataset_rows.append({
                "instruction": messages[i+1][2],
                "output": messages[i][2]
            })
            
    return dataset_rows if dataset_rows else [{"instruction": "Hello", "output": "Hi there!"}]

def fine_tune():
    data = fetch_recent_data()
    print(f"Found {len(data)} training examples.")
    dataset = Dataset.from_list(data)
    
    def format_prompt(examples):
        texts = []
        for instruction, output in zip(examples["instruction"], examples["output"]):
            # Qwen ChatML format
            text = f"<|im_start|>user\n{instruction}<|im_end|>\n<|im_start|>assistant\n{output}<|im_end|>"
            texts.append(text)
        return {"text": texts}
    
    dataset = dataset.map(format_prompt, batched=True)
    
    print("Loading model via Unsloth...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name = MODEL_NAME,
        max_seq_length = 2048,
        dtype = None,
        load_in_4bit = True,
    )
    
    model = FastLanguageModel.get_peft_model(
        model,
        r = 16,
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                          "gate_proj", "up_proj", "down_proj"],
        lora_alpha = 16,
        lora_dropout = 0,
        bias = "none",
        use_gradient_checkpointing = "unsloth",
        random_state = 3407,
    )
    
    trainer = SFTTrainer(
        model = model,
        tokenizer = tokenizer,
        train_dataset = dataset,
        dataset_text_field = "text",
        max_seq_length = 2048,
        dataset_num_proc = 2,
        args = TrainingArguments(
            per_device_train_batch_size = 2,
            gradient_accumulation_steps = 4,
            warmup_steps = 5,
            max_steps = 60, # Quick incremental steps
            learning_rate = 2e-4,
            fp16 = not torch.cuda.is_bf16_supported(),
            bf16 = torch.cuda.is_bf16_supported(),
            logging_steps = 1,
            optim = "adamw_8bit",
            weight_decay = 0.01,
            lr_scheduler_type = "linear",
            seed = 3407,
            output_dir = "outputs",
        ),
    )
    
    print("Starting fine-tuning...")
    trainer.train()
    
    print(f"Saving LoRA adapters to {OUTPUT_DIR}")
    model.save_pretrained(OUTPUT_DIR)
    tokenizer.save_pretrained(OUTPUT_DIR)
    
    print("Done! Model improved.")

if __name__ == "__main__":
    fine_tune()
