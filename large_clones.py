import json

data = json.load(open('e:/NYX/batch_1.json'))

for i, g in enumerate(data):
    if g['line_count'] >= 30:
        print(f"\n--- Group {i} ---")
        inst = g['instances'][0]
        print(f"File: {inst['file']}:{inst['start_line']}")
        frag = inst['fragment']
        lines = frag.split('\n')
        print('\n'.join(lines[:3]))
