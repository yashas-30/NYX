import os
import re

file_path = r'E:\NYX\apps\web\src\features\chat\components\ThinkingBlock.tsx'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Replace hardcoded colors with Gemini ones
content = content.replace('#111111', '#202124')
content = content.replace('#FBFBFA', '#F8F9FA')
content = content.replace('#EAEAEA', '#DADCE0')
content = content.replace('#F5F3F3', '#F1F3F4')
content = content.replace('#757575', '#5F6368')

# Replace sharp rounded-[6px] with rounded-[16px] for main cards, and rounded-lg for inner elements
content = content.replace('rounded-[6px]', 'rounded-[16px]')
content = content.replace('rounded-b-[6px]', 'rounded-b-[16px]')
content = content.replace('rounded-[4px]', 'rounded-lg')

# Replace transition ease arrays with the Gemini spring config
# e.g., transition={{ duration: 0.25, ease: [0.32, 0.72, 0, 1] }} -> transition={{ type: 'spring', stiffness: 300, damping: 30 }}
content = re.sub(r'transition=\{\{ duration:\s*[\d\.]+,\s*ease:\s*\[.*?\]\s*\}\}', r"transition={{ type: 'spring', stiffness: 300, damping: 30 }}", content)
content = re.sub(r"transition=\{\{ duration:\s*[\d\.]+,\s*ease:\s*'linear'\s*\}\}", r"transition={{ type: 'spring', stiffness: 300, damping: 30 }}", content)
content = content.replace('const customTransition = { duration: 0.25, ease: [0.32, 0.72, 0, 1] };', 'const customTransition = { type: "spring", stiffness: 300, damping: 30 };')

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(content)
print('Patch applied successfully.')
