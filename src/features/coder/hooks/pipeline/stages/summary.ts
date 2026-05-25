import { ExecutionPlan } from './planning';

export function runSummaryStage(
  plan: ExecutionPlan,
  generatedFiles: Array<{ path: string; content: string }>,
  verificationLog: string,
  getAccumulatedOutput: () => string,
  setAccumulatedOutput: (val: string) => void,
  streamUpdate: (text: string) => void
): string {
  let acc = getAccumulatedOutput() + `---\n\n## 📊 Execution Summary\n\n`;
  acc += `**Goal:** ${plan.summary}\n\n`;
  acc += `**Files Written:** ${generatedFiles.length}\n\n`;

  for (const file of generatedFiles) {
    const fileExt = file.path.split('.').pop() || 'text';
    acc += `### \`${file.path}\`\n\n\`\`\`${fileExt}\n${file.content}\n\`\`\`\n\n`;
  }

  if (verificationLog) {
    acc += `### \`Verification Results\`\n\n\`\`\`\n${verificationLog}\n\`\`\`\n\n`;
  }

  acc += `### ⚡ How to Use\n\n`;
  acc += `1. All files have been written directly to your workspace.\n`;
  acc += `2. Review the generated code in your editor.\n`;
  if (plan.verifyCommands.length > 0) {
    acc += `3. Run verification: ${plan.verifyCommands.map(c => `\`${c}\``).join(', ')}\n`;
  }
  acc += `\n*Powered by NYX Autonomous Agent v3.0*\n`;

  setAccumulatedOutput(acc);
  streamUpdate(acc);
  return acc;
}
