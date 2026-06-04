import os
import sys

files = ['src/features/chat/components/ChatPromptInput.tsx', 'src/features/coder/components/PromptInput.tsx']

for f_path in files:
    full_path = os.path.join('e:/NYX', f_path)
    with open(full_path, 'r', encoding='utf-8') as f:
        content = f.read()

    import_stmt = "import { SectionLabel, ParamSlider, ToolButton } from '@/shared/components/PromptInputSubcomponents';\n"
    
    lines = content.split('\n')
    last_import_idx = 0
    for i, line in enumerate(lines):
        if line.startswith('import '):
            last_import_idx = i
            
    lines.insert(last_import_idx + 1, import_stmt)
    
    content = '\n'.join(lines)
    
    section_label_idx = content.find('const SectionLabel')
    
    if section_label_idx != -1:
        # We also need to see if there is any comment before it.
        # Like /* Section label */
        # Let's just split at const SectionLabel and see if we can trim safely.
        before = content[:section_label_idx]
        
        # trim trailing whitespace/comments if possible
        # Actually, let's just find the end of the previous export/component.
        
        content = before
    
    with open(full_path, 'w', encoding='utf-8') as f:
        f.write(content)

print('Extracted components.')
