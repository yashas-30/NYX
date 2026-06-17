import React from 'react';
import { XIcon as X, ZapIcon as Zap } from '@animateicons/react/lucide';
import { Settings2, Sliders, Database, BrainCircuit, Maximize } from 'lucide-react';
import { useSettingsStore } from '../../../core/stores/useSettingsStore';

interface ChatSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatSettings: React.FC<ChatSettingsProps> = ({ isOpen, onClose }) => {
  const { chatSettings, updateChatSettings } = useSettingsStore();

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 w-80 h-full bg-card border-l border-border shadow-md z-40 flex flex-col transform transition-transform duration-300">
      <div className="flex items-center justify-between p-4 border-b border-border bg-muted/30">
        <div className="flex items-center gap-2 text-foreground">
          <Settings2 className="w-5 h-5 text-primary" />
          <span className="font-medium">Model Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors rounded cursor-pointer"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Temperature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-foreground flex items-center gap-2">
              <Sliders className="w-4 h-4 text-muted-foreground" />
              Temperature
            </label>
            <span className="text-[12px] font-mono text-primary">{chatSettings.temperature ?? 0.7}</span>
          </div>
          <input
            type="range"
            min="0"
            max="1"
            step="0.1"
            value={chatSettings.temperature ?? 0.7}
            onChange={(e) => updateChatSettings({ temperature: parseFloat(e.target.value) })}
            className="w-full accent-primary h-1 bg-input rounded-md appearance-none cursor-pointer"
          />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Controls randomness: Lower values are more deterministic, higher values are more
            creative.
          </p>
        </div>

        {/* Max Context Length */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-foreground flex items-center gap-2">
              <Database className="w-4 h-4 text-muted-foreground" />
              Max Output Tokens
            </label>
            <span className="text-[12px] font-mono text-primary">{chatSettings.maxTokens ?? 8192}</span>
          </div>
          <select 
            value={chatSettings.maxTokens ?? 8192}
            onChange={(e) => updateChatSettings({ maxTokens: parseInt(e.target.value) })}
            className="w-full bg-input border border-border rounded text-[13px] text-foreground p-2 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="4096" className="bg-popover text-foreground">4096 tokens</option>
            <option value="8192" className="bg-popover text-foreground">8192 tokens</option>
            <option value="16384" className="bg-popover text-foreground">16384 tokens</option>
            <option value="32768" className="bg-popover text-foreground">32768 tokens</option>
          </select>
        </div>

        {/* Context Optimizer Mode */}
        <div className="space-y-3 pt-4 border-t border-border">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-foreground flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-muted-foreground" />
              Context Optimizer
            </label>
          </div>
          <select 
            value={chatSettings.contextMode ?? 'prune'}
            onChange={(e) => updateChatSettings({ contextMode: e.target.value as 'off' | 'prune' | 'summarize' })}
            className="w-full bg-input border border-border rounded text-[13px] text-foreground p-2 focus:outline-none focus:border-primary cursor-pointer"
          >
            <option value="off" className="bg-popover text-foreground">Off (Fixed Context)</option>
            <option value="prune" className="bg-popover text-foreground">Prune Middle (Fast)</option>
            <option value="summarize" className="bg-popover text-foreground">Summarize Middle (Smart)</option>
          </select>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            Dynamic context management. "Prune" drops old messages. "Summarize" uses AI to dense old context.
          </p>
        </div>



        {/* Features Toggle */}
        <div className="space-y-4 pt-4 border-t border-border">
          <h4 className="text-[13px] font-medium text-foreground flex items-center gap-2">
            <Zap className="w-4 h-4 text-muted-foreground" />
            Agent Capabilities
          </h4>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-[13px] text-foreground/80 group-hover:text-foreground transition-colors">
              Subagent Swarm
            </span>
            <input
              type="checkbox"
              className="accent-primary w-4 h-4 bg-input border border-border"
              defaultChecked
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-[13px] text-foreground/80 group-hover:text-foreground transition-colors">
              Artifact Generation
            </span>
            <input
              type="checkbox"
              checked={chatSettings.antigravity ?? true}
              onChange={(e) => updateChatSettings({ antigravity: e.target.checked })}
              className="accent-primary w-4 h-4 bg-input border border-border"
            />
          </label>
        </div>
      </div>

      <div className="p-4 border-t border-border bg-muted/30">
        <button
          onClick={onClose}
          className="w-full bg-muted hover:bg-muted/80 text-foreground border border-border py-2 rounded text-[13px] font-medium transition-colors cursor-pointer"
        >
          Close Settings
        </button>
      </div>
    </div>
  );
};
