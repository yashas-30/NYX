import urllib.request
import json

req = urllib.request.Request(
    'http://localhost:1234/v1/chat/completions',
    data=json.dumps({
        'model': 'qwen',
        'messages': [{'role': 'user', 'content': 'hello'}],
        'stream': True
    }).encode('utf-8'),
    headers={'Content-Type': 'application/json'}
)

try:
    with urllib.request.urlopen(req) as response:
        for line in response:
            print(line.decode('utf-8').strip())
            if b'[DONE]' in line:
                break
except Exception as e:
    print(f"Error: {e}")
