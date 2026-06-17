import re

lines = open('e:/NYX/temp_transcript.txt', 'r', encoding='utf-8').readlines()
start_idx = -1
end_idx = -1
for i, line in enumerate(lines):
    if '/**' in line and '@file src/core/services/promptAnalysis.service.ts' in lines[i+1]:
        start_idx = i
    if '// Optional: Initialize with API key for LLM layer' in line:
        end_idx = i + 3
        break

code = ''.join(lines[start_idx:end_idx])

# Replace import and interface
code = code.replace("import { PromptAnalysis } from '@src/infrastructure/types';", "import { PromptAnalysis } from '@src/types/agent';")

# We need to remove the interface definition so it doesn't clash with the imported one.
interface_pattern = re.compile(r'export interface PromptAnalysis \{.*?\n\}\n', re.DOTALL)
code = interface_pattern.sub('', code)

# Fix LLM parsing promise type: `Promise<<Partial<PromptAnalysis>>` to `Promise<Partial<PromptAnalysis>>`
code = code.replace('Promise<<Partial<PromptAnalysis>>', 'Promise<Partial<PromptAnalysis>>')
# Also `new Promise<<never>`
code = code.replace('new Promise<<never>', 'new Promise<never>')

# Ensure the file gets created
with open('e:/NYX/apps/web/src/core/services/promptAnalysis.service.ts', 'w', encoding='utf-8') as f:
    f.write(code)
