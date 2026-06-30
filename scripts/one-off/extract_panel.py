import os

with open('e:/NYX/src/features/chat/components/ChatPromptInput.tsx', 'r', encoding='utf-8') as f:
    text = f.read()

start = text.find('{/* ── Settings Panel ────────────────────────────────────────── */}')
end = text.find('</AnimatePresence>') + len('</AnimatePresence>')

block = text[start:end]

with open('e:/NYX/src/shared/components/LocalModelSettingsPanel.tsx', 'w', encoding='utf-8') as f:
    f.write('''import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Zap, RotateCcw, Check, MemoryStick, Layers, Thermometer, Cpu } from 'lucide-react';
import { toast } from 'sonner';
import { SectionLabel, ParamSlider } from '@/shared/components/PromptInputSubcomponents';

interface LocalModelSettingsPanelProps {
  isLocalModel: boolean;
  showSettings: boolean;
  setShowSettings: (val: boolean) => void;
  currentModelId: string | null;
  onModelSelect: (id: string) => void;
  modelSettings: any;
  onModelSettingsChange: (settings: any) => void;
  resetLocalSettings: () => void;
  gpuModeLabel: string;
  updateLocal: (key: string, val: any) => void;
}

export const LocalModelSettingsPanel: React.FC<LocalModelSettingsPanelProps> = ({
  isLocalModel,
  showSettings,
  setShowSettings,
  currentModelId,
  onModelSelect,
  modelSettings,
  onModelSettingsChange,
  resetLocalSettings,
  gpuModeLabel,
  updateLocal,
}) => {
  const localSettings = modelSettings || {};
  const gpuColor =
    localSettings.gpuLayers === 0
      ? 'text-zinc-500'
      : localSettings.gpuLayers < 90
        ? 'text-amber-400'
        : 'text-emerald-400';

  return (
    <>
      ''' + block.replace('// fallow-ignore-next-line code-duplication', '') + '''
    </>
  );
};
''')

# Now replace the block in ChatPromptInput.tsx and PromptInput.tsx
import_stmt = "import { LocalModelSettingsPanel } from '@/shared/components/LocalModelSettingsPanel';\n"

for file in ['src/features/chat/components/ChatPromptInput.tsx', 'src/features/coder/components/PromptInput.tsx']:
    with open('e:/NYX/' + file, 'r', encoding='utf-8') as f:
        file_text = f.read()
    
    file_start = file_text.find('{/* ── Settings Panel ────────────────────────────────────────── */}')
    file_end = file_text.find('</AnimatePresence>') + len('</AnimatePresence>')
    
    if file_start != -1 and file_end > file_start:
        replacement = '''{/* ── Settings Panel ────────────────────────────────────────── */}
        <LocalModelSettingsPanel
          isLocalModel={isLocalModel}
          showSettings={showSettings}
          setShowSettings={setShowSettings}
          currentModelId={currentModelId}
          onModelSelect={onModelSelect}
          modelSettings={modelSettings}
          onModelSettingsChange={onModelSettingsChange}
          resetLocalSettings={resetLocalSettings}
          gpuModeLabel={gpuModeLabel}
          updateLocal={updateLocal}
        />'''
        
        file_text = file_text[:file_start] + replacement + file_text[file_end:]
        
        # Add import
        lines = file_text.split('\n')
        last_import = 0
        for i, line in enumerate(lines):
            if line.startswith('import '):
                last_import = i
        lines.insert(last_import + 1, import_stmt)
        
        with open('e:/NYX/' + file, 'w', encoding='utf-8') as f:
            f.write('\n'.join(lines))
