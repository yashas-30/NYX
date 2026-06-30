import torch
from unsloth import FastLanguageModel
from datasets import load_dataset
from trl import SFTTrainer
from transformers import TrainingArguments
from unsloth import is_bfloat16_supported

def main():
    max_seq_length = 2048 # Adjust if you have larger VRAM
    dtype = None # None for auto detection. Float16 for Tesla T4, V100, Bfloat16 for Ampere+
    load_in_4bit = True # Use 4bit quantization to reduce memory usage

    print("Loading base Qwen2.5 3B model...")
    model, tokenizer = FastLanguageModel.from_pretrained(
        model_name = "unsloth/Qwen2.5-3B-Instruct",
        max_seq_length = max_seq_length,
        dtype = dtype,
        load_in_4bit = load_in_4bit,
    )

    print("Applying LoRA adapters...")
    model = FastLanguageModel.get_peft_model(
        model,
        r = 16, # Choose any number > 0 ! Suggested 8, 16, 32, 64, 128
        target_modules = ["q_proj", "k_proj", "v_proj", "o_proj",
                          "gate_proj", "up_proj", "down_proj",],
        lora_alpha = 16,
        lora_dropout = 0, # Supports any, but = 0 is optimized
        bias = "none",    # Supports any, but = "none" is optimized
        use_gradient_checkpointing = "unsloth",
        random_state = 3407,
        use_rslora = False,
        loftq_config = None,
    )

    print("Loading dataset from models/training_dataset.jsonl...")
    dataset = load_dataset("json", data_files="E:/NYX/models/training_dataset.jsonl", split="train")

    def formatting_prompts_func(examples):
        # Format using the standard chatml template
        formatted_texts = []
        for msgs in examples["messages"]:
            text = tokenizer.apply_chat_template(msgs, tokenize=False, add_generation_prompt=False)
            formatted_texts.append(text)
        return { "text" : formatted_texts }

    dataset = dataset.map(formatting_prompts_func, batched = True,)

    print("Initializing Trainer...")
    trainer = SFTTrainer(
        model = model,
        tokenizer = tokenizer,
        train_dataset = dataset,
        dataset_text_field = "text",
        max_seq_length = max_seq_length,
        dataset_num_proc = 2,
        packing = False, # Can make training 5x faster for short sequences
        args = TrainingArguments(
            per_device_train_batch_size = 2,
            gradient_accumulation_steps = 4,
            warmup_steps = 5,
            max_steps = 60, # Increase this for actual full training (e.g., 100-500)
            learning_rate = 2e-4,
            fp16 = not is_bfloat16_supported(),
            bf16 = is_bfloat16_supported(),
            logging_steps = 1,
            optim = "adamw_8bit",
            weight_decay = 0.01,
            lr_scheduler_type = "linear",
            seed = 3407,
            output_dir = "outputs",
        ),
    )

    print("Starting Training...")
    trainer_stats = trainer.train()

    print("Training Complete! Exporting to GGUF format...")
    # Export to GGUF format for use in the Tauri App
    model.save_pretrained_gguf("E:/NYX/models/nyx-qwen2.5-3b-enhanced", tokenizer, quantization_method = "q4_k_m")
    print("Export complete! You can now load the enhanced model in NYX.")

if __name__ == "__main__":
    main()
