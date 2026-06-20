import React from 'react';
import { useSettingsStore, ToolPermissions } from '@src/shared/store/useSettingsStore';
import { Switch } from '@src/shared/components/ui/switch';

const DESTRUCTIVE_TOOLS = [
  { id: 'write_file', label: 'Write File', description: 'Create or overwrite files on disk' },
  { id: 'edit_file', label: 'Edit File', description: 'Modify specific blocks within existing files' },
  { id: 'run_terminal_command', label: 'Terminal Commands', description: 'Execute raw terminal commands' },
  { id: 'run_shell', label: 'Shell Execution', description: 'Execute bash/shell scripts' },
  { id: 'run_test', label: 'Run Tests', description: 'Execute test suites' },
  { id: 'lint_code', label: 'Lint Code', description: 'Run code linters and formatting' },
  { id: 'run_python', label: 'Python Script', description: 'Execute python scripts' },
  { id: 'run_javascript', label: 'JavaScript Exec', description: 'Execute node/js scripts' },
  { id: 'computer_use', label: 'Computer Use', description: 'Interact with the local OS via API' },
  { id: 'schedule_task', label: 'Schedule Tasks', description: 'Add background cron jobs' }
];

export const ToolSettingsSection: React.FC = () => {
  const { toolPermissions, updateToolPermissions } = useSettingsStore();

  const toggleAutoApproveAll = (checked: boolean) => {
    updateToolPermissions({ autoApproveAll: checked });
  };

  const toggleTool = (toolId: string, checked: boolean) => {
    const current = new Set(toolPermissions.autoApproveTools || []);
    if (checked) {
      current.add(toolId);
    } else {
      current.delete(toolId);
    }
    updateToolPermissions({ autoApproveTools: Array.from(current) });
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-sm font-medium text-foreground mb-1">Tool Execution Permissions</h3>
        <p className="text-xs text-muted-foreground">
          Configure which destructive tools are allowed to run automatically without manual UI approval.
          Warning: Allowing agents to run terminal commands autonomously can be dangerous.
        </p>
      </div>

      <div className="bg-card border border-border rounded-lg p-5">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-border">
          <div>
            <div className="text-sm font-medium text-foreground">Auto-Approve All Tools</div>
            <div className="text-xs text-muted-foreground mt-0.5">Bypass all manual approval prompts for background agents</div>
          </div>
          <Switch
            checked={toolPermissions.autoApproveAll}
            onCheckedChange={toggleAutoApproveAll}
          />
        </div>

        <div className={`space-y-4 ${toolPermissions.autoApproveAll ? 'opacity-50 pointer-events-none' : ''}`}>
          {DESTRUCTIVE_TOOLS.map((tool) => {
            const isApproved = toolPermissions.autoApproveTools?.includes(tool.id) || false;
            
            return (
              <div key={tool.id} className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-foreground">{tool.label}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{tool.description}</div>
                </div>
                <Switch
                  checked={isApproved}
                  onCheckedChange={(c: boolean) => toggleTool(tool.id, c)}
                />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
