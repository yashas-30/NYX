import React from 'react';
import { X, Settings2, Sliders, Zap, Database, BrainCircuit, Maximize } from 'lucide-react';
import { useSettingsStore } from '../../../core/stores/useSettingsStore';

interface ChatSettingsProps {
  isOpen: boolean;
  onClose: () => void;
}

export const ChatSettings: React.FC<ChatSettingsProps> = ({ isOpen, onClose }) => {
  const { chatSettings, updateChatSettings } = useSettingsStore();

  if (!isOpen) return null;

  return (
    <div className="absolute top-0 right-0 w-80 h-full bg-[#09090B] border-l border-[rgba(255,255,255,0.06)] shadow-sm border border-border z-40 flex flex-col transform transition-transform duration-300">
      <div className="flex items-center justify-between p-4 border-b border-[rgba(255,255,255,0.06)] bg-[#0e1416]">
        <div className="flex items-center gap-2 text-[#F8FAFC]">
          <Settings2 className="w-5 h-5 text-primary" />
          <span className="font-medium">Model Settings</span>
        </div>
        <button
          onClick={onClose}
          className="p-1 text-[#4A5059] hover:text-[#F8FAFC] transition-colors rounded"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Temperature */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-[#F8FAFC] flex items-center gap-2">
              <Sliders className="w-4 h-4 text-[#4A5059]" />
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
            className="w-full accent-primary h-1 bg-[#18181B] rounded-md appearance-none cursor-pointer"
          />
          <p className="text-[11px] text-[#4A5059] leading-relaxed">
            Controls randomness: Lower values are more deterministic, higher values are more
            creative.
          </p>
        </div>

        {/* Max Context Length */}
        <div className="space-y-3 pt-4 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-[#F8FAFC] flex items-center gap-2">
              <Database className="w-4 h-4 text-[#4A5059]" />
              Max Output Tokens
            </label>
            <span className="text-[12px] font-mono text-primary">{chatSettings.maxTokens ?? 8192}</span>
          </div>
          <select 
            value={chatSettings.maxTokens ?? 8192}
            onChange={(e) => updateChatSettings({ maxTokens: parseInt(e.target.value) })}
            className="w-full bg-[#18181B] border border-[rgba(255,255,255,0.06)] rounded text-[13px] text-[#F8FAFC] p-2 focus:outline-none focus:border-primary"
          >
            <option value="4096">4096 tokens</option>
            <option value="8192">8192 tokens</option>
            <option value="16384">16384 tokens</option>
            <option value="32768">32768 tokens</option>
          </select>
        </div>

        {/* Context Optimizer Mode */}
        <div className="space-y-3 pt-4 border-t border-[rgba(255,255,255,0.06)]">
          <div className="flex items-center justify-between">
            <label className="text-[13px] font-medium text-[#F8FAFC] flex items-center gap-2">
              <BrainCircuit className="w-4 h-4 text-[#4A5059]" />
              Context Optimizer
            </label>
          </div>
          <select 
            value={chatSettings.contextMode ?? 'prune'}
            onChange={(e) => updateChatSettings({ contextMode: e.target.value as 'off' | 'prune' | 'summarize' })}
            className="w-full bg-[#18181B] border border-[rgba(255,255,255,0.06)] rounded text-[13px] text-[#F8FAFC] p-2 focus:outline-none focus:border-primary"
          >
            <option value="off">Off (Fixed Context)</option>
            <option value="prune">Prune Middle (Fast)</option>
            <option value="summarize">Summarize Middle (Smart)</option>
          </select>
          <p className="text-[11px] text-[#4A5059] leading-relaxed">
            Dynamic context management. "Prune" drops old messages. "Summarize" uses AI to dense old context.
          </p>
        </div>



        {/* Features Toggle */}
        <div className="space-y-4 pt-4 border-t border-[rgba(255,255,255,0.06)]">
          <h4 className="text-[13px] font-medium text-[#F8FAFC] flex items-center gap-2">
            <Zap className="w-4 h-4 text-[#4A5059]" />
            Agent Capabilities
          </h4>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-[13px] text-[#bbc9cd] group-hover:text-[#F8FAFC] transition-colors">
              Subagent Swarm
            </span>
            <input
              type="checkbox"
              className="accent-primary w-4 h-4 bg-[#18181B] border-[rgba(255,255,255,0.06)]"
              defaultChecked
            />
          </label>

          <label className="flex items-center justify-between cursor-pointer group">
            <span className="text-[13px] text-[#bbc9cd] group-hover:text-[#F8FAFC] transition-colors">
              Artifact Generation
            </span>
            <input
              type="checkbox"
              checked={chatSettings.antigravity ?? true}
              onChange={(e) => updateChatSettings({ antigravity: e.target.checked })}
              className="accent-primary w-4 h-4 bg-[#18181B] border-[rgba(255,255,255,0.06)]"
            />
          </label>
        </div>
      </div>

      <div className="p-4 border-t border-[rgba(255,255,255,0.06)] bg-[#0e1416]">
        <button
          onClick={onClose}
          className="w-full bg-[#18181B] hover:bg-[rgba(255,255,255,0.06)] text-[#F8FAFC] border border-[rgba(255,255,255,0.06)] py-2 rounded text-[13px] font-medium transition-colors"
        >
          Close Settings
        </button>
      </div>
    </div>
  );
};
