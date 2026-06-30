import json

data = json.load(open('e:/NYX/batch_1.json'))

for i, g in enumerate(data):
    files = [inst['file'] for inst in g['instances']]
    print(f"Group {i}: {g['line_count']} lines, {len(g['instances'])} instances, files: {files}")
