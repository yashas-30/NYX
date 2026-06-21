import json
content = open(r'e:\NYX\apps\web\src\core\agents\agentLoop.ts', encoding='utf-8').read()
calls = json.load(open(r'e:\NYX\apps\web\src\core\agents\agentLoop_recovered.json', encoding='utf-8'))

for tc in calls:
    args = tc.get('args', tc.get('arguments', {}))
    if tc['name'] == 'replace_file_content':
        if args['TargetContent'] in content:
            content = content.replace(args['TargetContent'], args['ReplacementContent'])
        else:
            print('Failed to find TargetContent for:', args.get('Description', ''))
    elif tc['name'] == 'multi_replace_file_content':
        for chunk in args['ReplacementChunks']:
            if chunk['TargetContent'] in content:
                content = content.replace(chunk['TargetContent'], chunk['ReplacementContent'])
            else:
                print('Failed to find chunk TargetContent for:', args.get('Description', ''))

open(r'e:\NYX\apps\web\src\core\agents\agentLoop.ts', 'w', encoding='utf-8').write(content)
print('Done')
