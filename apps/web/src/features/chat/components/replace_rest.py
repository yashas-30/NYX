import re
import os

files = {
    r'E:\NYX\apps\web\src\features\chat\components\ArtifactPanel.tsx': {
        'phosphor': "import { Code, CornersOut as Maximize2, CornersIn as Minimize2 } from '@phosphor-icons/react';\n",
        'lucide': ['Code2']
    },
    r'E:\NYX\apps\web\src\features\chat\components\BranchingTreePanel.tsx': {
        'phosphor': "import { X, Play, GitBranch, ArrowLeft as ArrowLeftCircle, CheckCircle } from '@phosphor-icons/react';\n",
        'lucide': ['X', 'Play', 'GitBranch', 'ArrowLeftCircle', 'CheckCircle']
    },
    r'E:\NYX\apps\web\src\features\chat\components\ChatPage.tsx': {
        'phosphor': "import { Folder } from '@phosphor-icons/react';\n",
        'lucide': ['Folder']
    },
    r'E:\NYX\apps\web\src\features\chat\components\ChatSettings.tsx': {
        'phosphor': "import { FadersHorizontal as Settings2, Faders as Sliders, Database, Graph as BrainCircuit, CornersOut as Maximize } from '@phosphor-icons/react';\n",
        'lucide': ['Settings2', 'Sliders', 'Database', 'BrainCircuit', 'Maximize']
    },
    r'E:\NYX\apps\web\src\features\chat\components\ChatSidebar.tsx': {
        'phosphor': "import { ChatText as MessageSquare, List as PanelLeftClose } from '@phosphor-icons/react';\n",
        'lucide': ['MessageSquare', 'PanelLeftClose']
    },
    r'E:\NYX\apps\web\src\features\chat\components\ComputerUsePreview.tsx': {
        'phosphor': "import { Cursor as MousePointer2, Keyboard } from '@phosphor-icons/react';\n",
        'lucide': ['MousePointer2', 'Keyboard']
    },
    r'E:\NYX\apps\web\src\features\chat\components\MemoryPanel.tsx': {
        'phosphor': "import { ArrowsClockwise as RefreshCw } from '@phosphor-icons/react';\n",
        'lucide': ['RefreshCw']
    },
    r'E:\NYX\apps\web\src\features\chat\components\PromptTemplateManager.tsx': {
        'phosphor': "import { PencilSimple as Edit2 } from '@phosphor-icons/react';\n",
        'lucide': ['Edit2']
    },
    r'E:\NYX\apps\web\src\features\chat\components\PythonSandbox.tsx': {
        'phosphor': "import { Image as ImageIcon, Spinner as Loader2 } from '@phosphor-icons/react';\n",
        'lucide': ['ImageIcon', 'Loader2']
    }
}

for file_path, data in files.items():
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove lucide imports without DOTALL
    lines = content.split('\n')
    new_lines = []
    
    for line in lines:
        if 'from \'lucide-react\'' in line or 'from \"lucide-react\"' in line or 'from \'@animateicons/react/lucide\'' in line or 'from \"@animateicons/react/lucide\"' in line:
            new_lines.append(data['phosphor'].strip())
        else:
            new_lines.append(line)
            
    content = '\n'.join(new_lines)
    
    # Replace icons mappings
    replacements = {
        'Code2': 'Code',
        'Maximize2': 'Maximize',
        'Minimize2': 'Minimize',
        'ArrowLeftCircle': 'ArrowLeft',
        'CheckCircle': 'CheckCircle',
        'Settings2': 'FadersHorizontal',
        'Sliders': 'Faders',
        'BrainCircuit': 'Graph',
        'MessageSquare': 'ChatText',
        'PanelLeftClose': 'List',
        'MousePointer2': 'Cursor',
        'RefreshCw': 'ArrowsClockwise',
        'Edit2': 'PencilSimple',
        'Loader2': 'Spinner',
        'ImageIcon': 'Image'
    }

    for old, new in replacements.items():
        content = re.sub(r'\b' + old + r'\b', new, content)

    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(content)
        
    print(f'Modified {os.path.basename(file_path)}')
