import os
import glob
import json

SYSTEM_PROMPT = "You are an autonomous AI coding assistant operating within the NYX ecosystem. Provide detailed, structured responses and summarize your work meticulously."

def parse_markdown_sessions(directory):
    dataset = []
    # Find all *session.md files
    md_files = glob.glob(os.path.join(directory, "**", "*session.md"), recursive=True)
    for md_file in md_files:
        with open(md_file, "r", encoding="utf-8") as f:
            content = f.read()
            
        # Treat the markdown log as a synthesized output of an implicit user request to log the session
        filename = os.path.basename(md_file)
        user_prompt = f"Please provide the session log and summary for the task related to '{filename}'."
        
        chatml = {
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": user_prompt},
                {"role": "assistant", "content": content}
            ]
        }
        dataset.append(chatml)
    return dataset

def parse_json_sessions(directory):
    dataset = []
    json_files = glob.glob(os.path.join(directory, "**", "*.json"), recursive=True)
    for json_file in json_files:
        if "node_modules" in json_file or ".git" in json_file or "target" in json_file:
            continue
            
        try:
            with open(json_file, "r", encoding="utf-8") as f:
                data = json.load(f)
                
            # If it's a list of messages
            if isinstance(data, dict) and "messages" in data:
                # Validate ChatML format
                msgs = data["messages"]
                if isinstance(msgs, list) and all(isinstance(m, dict) and "role" in m for m in msgs):
                    dataset.append(data)
        except:
            continue
            
    return dataset

def main():
    print("Gathering Markdown session logs...")
    md_data = parse_markdown_sessions("E:\\NYX\\claude-obsidian\\wiki\\meta")
    
    print("Gathering JSON session logs...")
    json_data = parse_json_sessions("E:\\NYX\\scratch")
    
    # Combine datasets
    full_dataset = md_data + json_data
    
    output_path = "E:\\NYX\\models\\training_dataset.jsonl"
    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    
    with open(output_path, "w", encoding="utf-8") as out:
        for entry in full_dataset:
            out.write(json.dumps(entry, ensure_ascii=False) + "\n")
            
    print(f"Successfully wrote {len(full_dataset)} training examples to {output_path}")

if __name__ == "__main__":
    main()
