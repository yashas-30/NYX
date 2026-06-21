import re
import os

files = {
    r'E:\NYX\apps\web\src\features\chat\components\ChatHeader.tsx': {
        'phosphor': "import { Trash, Lightbulb as Brain, CaretDown, LockKey as Lock, Lightning as Zap, Paperclip, WifiHigh as Wifi, WifiNone as WifiOff, DownloadSimple as Download, Check, X, List as PanelLeftOpen, List as PanelLeftClose, ShareNetwork as Share2, LockKeyOpen as Unlock, Stop as Square, Robot as Bot, Cpu, Clock, ChatText as MessageSquare, FileText, DotsThree as MoreHorizontal, Keyboard, WarningCircle as AlertCircle, HardDrives as HardDrive, GitBranch } from '@phosphor-icons/react';\n"
    },
    r'E:\NYX\apps\web\src\features\chat\components\ChatPromptInput.tsx': {
        'phosphor': "import { PaperPlaneRight as Send, X, Lightning as Zap, Info, CaretDown as ChevronDown, Microphone as Mic, FadersHorizontal as SlidersHorizontal, Stack as Layers, Check, StopCircle, Robot as Bot, Memory as MemoryStick, Cpu, Thermometer, ArrowCounterClockwise as RotateCcw, Image as ImageIcon } from '@phosphor-icons/react';\n"
    },
    r'E:\NYX\apps\web\src\features\chat\components\ChatMessageList.tsx': {
        'phosphor': "import { Copy, Check, Terminal, ThumbsUp, ThumbsDown, GitBranch, CaretDown as ChevronDown, CaretRight as ChevronRight, X, Sparkle as Sparkles, DownloadSimple as Download, ArrowDown, PencilSimple as Pencil, ArrowsClockwise as RefreshCw, Wrench, FileText, Image as ImageIcon, Clock, Warning as AlertTriangle, Spinner as Loader2, Stop as Square, SpeakerHigh as Volume2, SpeakerSlash as VolumeX } from '@phosphor-icons/react';\n"
    }
}

for file_path, data in files.items():
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Remove lucide imports without DOTALL so it only matches single lines or we can just replace the specific strings
    # Actually, we can just replace the line that contains '@animateicons/react/lucide'
    lines = content.split('\n')
    new_lines = []
    in_import = False
    for line in lines:
        if 'from \'@animateicons/react/lucide\'' in line or 'from \"@animateicons/react/lucide\"' in line or 'from \'lucide-react\'' in line or 'from \"lucide-react\"' in line:
            continue
        elif 'from \'framer-motion\'' in line:
            new_lines.append(line)
            new_lines.append(data['phosphor'].strip())
        else:
            new_lines.append(line)
    
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write('\n'.join(new_lines))
    print(f'Modified {os.path.basename(file_path)}')
