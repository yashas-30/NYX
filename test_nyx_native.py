import urllib.request
import json
import sys

try:
    req = urllib.request.Request(
        'http://127.0.0.1:8080/v1/chat/completions',
        data=json.dumps({
            'model': 'qwen',
            'messages': [{'role': 'user', 'content': 'hi'}],
            'stream': True
        }).encode('utf-8'),
        headers={'Content-Type': 'application/json'}
    )
    with urllib.request.urlopen(req) as response:
        for line in response:
            print(line.decode('utf-8').strip())
            sys.stdout.flush()
except Exception as e:
    print(f"Error: {e}")
