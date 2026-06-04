import { AIService } from '@src/core/services/ai.service';
import { AISettings } from '@src/infrastructure/types';
import { ExecutionPlan } from './planning';
import { writeFileWithHistory } from '../utils/fileWriter';

export async function runVerificationStage(
  nyxModel: string,
  nyxProvider: string,
  nyxApiKey: string,
  plan: ExecutionPlan,
  rulesBlock: string,
  prompt: string,
  codebaseContext: string,
  pipelineSettings: AISettings,
  signal: AbortSignal,
  trackUsage: (provider: string, tokens: number) => void,
  streamUpdate: (text: string) => void,
  getAccumulatedOutput: () => string,
  setAccumulatedOutput: (val: string) => void,
  generatedFiles: Array<{ path: string; content: string }>,
  runSandboxCommand: (
    command: string
  ) => Promise<{ success: boolean; stdout: string; stderr: string; error?: string }>
): Promise<string> {
  const MAX_RETRIES = 3;
  let verificationLog = '';

  if (plan.verifyCommands.length > 0) {
    let acc = getAccumulatedOutput() + `---\n\n## 🔬 Sandbox Verification\n\n`;
    setAccumulatedOutput(acc);
    streamUpdate(acc);

    for (const cmd of plan.verifyCommands) {
      let attempts = 0;
      let passed = false;

      while (attempts < MAX_RETRIES && !passed) {
        attempts++;
        acc =
          getAccumulatedOutput() +
          `🔄 Running \`${cmd}\`${attempts > 1 ? ` (retry ${attempts}/${MAX_RETRIES})` : ''}...\n\n`;
        streamUpdate(acc);

        const result = await runSandboxCommand(cmd);

        if (result.success && !result.stderr.trim()) {
          passed = true;
          const truncatedStdout =
            result.stdout.length > 500
              ? result.stdout.substring(0, 500) + '\n...(truncated)'
              : result.stdout;
          const passedMsg = `✅ **\`${cmd}\` passed**\n\`\`\`\n${truncatedStdout || '(no output)'}\n\`\`\`\n\n`;
          acc = getAccumulatedOutput() + passedMsg;
          setAccumulatedOutput(acc);
          verificationLog += `✅ ${cmd}: PASSED\n`;
          streamUpdate(acc);
        } else {
          const errorOutput = result.stderr || result.error || result.stdout || 'Unknown error';
          const truncatedError =
            errorOutput.length > 800
              ? errorOutput.substring(0, 800) + '\n...(truncated)'
              : errorOutput;

          if (attempts >= MAX_RETRIES) {
            const failMsg = `❌ **\`${cmd}\` failed after ${MAX_RETRIES} retries**\n\`\`\`\n${truncatedError}\n\`\`\`\n\n`;
            acc = getAccumulatedOutput() + failMsg;
            setAccumulatedOutput(acc);
            verificationLog += `❌ ${cmd}: FAILED after ${MAX_RETRIES} retries\n`;
            streamUpdate(acc);
            break;
          }

          // ── Self-Correction Diagnostic ────────────────────────────────
          const diagMsg = `⚠️ **\`${cmd}\` failed** — running self-correction diagnostic...\n\`\`\`\n${truncatedError}\n\`\`\`\n\n`;
          acc = getAccumulatedOutput() + diagMsg;
          setAccumulatedOutput(acc);
          streamUpdate(acc);

          const diagnosticInstruction = `You are Nyx, an autonomous self-correcting coding agent. A build/test command failed. Analyze the error output and determine which file(s) need to be fixed.

Output ONLY a raw JSON object (no markdown code fences):
{
  "diagnosis": "Brief explanation of the root cause",
  "fixes": [
    {
      "path": "relative/path/to/file.ext",
      "content": "COMPLETE corrected file content — not a diff, not a patch, the ENTIRE file"
    }
  ]
}

Self-Correction Rules:
1. FULL CORRECTIVE OUTPUTS: The "content" field must contain 100% complete corrected code. Never output skeletons, diffs, or code containing "// ..." or placeholder comments.
2. PRESERVE QUALITY & ARCHITECTURE: Fix only the build or runtime compilation errors shown. Do not introduce new bugs, do not compromise typescript safety, and ensure frontend files still adhere fully to our premium editorial minimalist guidelines.`;

          const filesContext = generatedFiles
            .map((f) => `--- ${f.path} ---\n${f.content}`)
            .join('\n\n');
          const diagnosticPrompt = `ERROR OUTPUT:\n${truncatedError}\n\nFILES IN WORKSPACE:\n${filesContext}\n\nFix the errors.`;

          try {
            const diagResult = await AIService.execute(
              nyxModel,
              nyxProvider,
              diagnosticPrompt,
              nyxApiKey,
              diagnosticInstruction,
              { ...pipelineSettings, maxTokens: 8192, temperature: 0.1 },
              undefined,
              signal,
              undefined
            );
            trackUsage(nyxProvider, diagResult.metrics.tokens);

            const diagText = diagResult.text
              .trim()
              .replace(/^```json\s*/i, '')
              .replace(/```\s*$/, '')
              .trim();
            const diagParsed = JSON.parse(diagText);

            if (diagParsed.fixes && diagParsed.fixes.length > 0) {
              acc = getAccumulatedOutput() + `🔧 **Diagnosis:** ${diagParsed.diagnosis}\n\n`;
              setAccumulatedOutput(acc);
              streamUpdate(acc);

              for (const fix of diagParsed.fixes) {
                let fixContent = fix.content.trim();
                fixContent = fixContent
                  .replace(/^```\w*\n?/i, '')
                  .replace(/\n?```\s*$/i, '')
                  .trim();

                let prevContent: string | null = null;
                try {
                  const readRes = await fetch(
                    `/api/nyx/read-file?filePath=${encodeURIComponent(fix.path)}`,
                    { signal }
                  );
                  if (readRes.ok) {
                    const readData = await readRes.json();
                    if (readData.success) {
                      prevContent = readData.content;
                    }
                  }
                } catch {
                  /* ignore */
                }

                try {
                  await writeFileWithHistory(fix.path, fixContent, prevContent);
                  acc =
                    getAccumulatedOutput() +
                    `✅ **Re-wrote** \`${fix.path}\` with corrected code\n\n`;
                  setAccumulatedOutput(acc);
                  // Update our local copy
                  const idx = generatedFiles.findIndex((f) => f.path === fix.path);
                  if (idx >= 0) generatedFiles[idx].content = fixContent;
                  else generatedFiles.push({ path: fix.path, content: fixContent });
                } catch (writeErr: any) {
                  acc =
                    getAccumulatedOutput() +
                    `⚠️ **Re-write failed** for \`${fix.path}\`: ${writeErr.message}\n\n`;
                  setAccumulatedOutput(acc);
                }
                streamUpdate(acc);
              }
            } else {
              acc =
                getAccumulatedOutput() +
                `ℹ️ **Diagnosis:** ${diagParsed.diagnosis || 'No automated fix available'}\n\n`;
              setAccumulatedOutput(acc);
              streamUpdate(acc);
              break; // No fixes possible, stop retrying
            }
          } catch (diagErr: any) {
            acc =
              getAccumulatedOutput() +
              `⚠️ Self-correction diagnostic failed: ${diagErr.message}\n\n`;
            setAccumulatedOutput(acc);
            streamUpdate(acc);
            break;
          }
        }
      }
    }
  } else {
    verificationLog = 'No verification commands configured.';
  }

  return verificationLog;
}
