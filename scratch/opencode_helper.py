import subprocess
import json
import os
from concurrent.futures import ThreadPoolExecutor

class OpenCodeRunner:
    def __init__(self, model="gemma-3"):
        self.model = model

    def run_task(self, prompt):
        """Runs a single prompt via opencode CLI and returns the output."""
        cmd = ["opencode", "--prompt", prompt, "-m", self.model]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, check=True, shell=True)
            return result.stdout.strip()
        except subprocess.CalledProcessError as e:
            return f"Error: {e.stderr}"

    def run_parallel(self, prompts, max_workers=2):
        """Runs multiple prompts in parallel."""
        with ThreadPoolExecutor(max_workers=max_workers) as executor:
            results = list(executor.map(self.run_task, prompts))
        return results

if __name__ == "__main__":
    # Example usage
    runner = OpenCodeRunner()
    test_prompt = "Say 'Gemma 3 is ready' if you can hear me."
    print(f"Testing opencode with {runner.model}...")
    print(runner.run_task(test_prompt))
