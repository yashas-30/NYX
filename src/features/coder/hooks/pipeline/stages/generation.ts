import { AIService } from '@src/core/services/ai.service';
import { AISettings } from '@src/infrastructure/types';
import { ExecutionPlan } from './planning';
import { writeFileWithHistory } from '../utils/fileWriter';

export async function runGenerationStage(
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
  renderPlanChecklist: () => string,
  streamUpdate: (text: string) => void,
  taskStatuses: string[],
  generatedFiles: Array<{ path: string; content: string }>
): Promise<void> {
  for (let i = 0; i < plan.files.length; i++) {
    const file = plan.files[i];
    taskStatuses[i] = '🔄';
    const acc = renderPlanChecklist() + `---\n\n⚙️ *Generating \`${file.path}\`...*\n`;
    streamUpdate(acc);

    const fileGenInstruction = `You are Nyx, an autonomous coding agent. Generate the COMPLETE, production-ready source code for the file described below.

File Path: ${file.path}
File Description: ${file.description}
Language: ${file.language}
Project Context: ${plan.summary}
Architecture: ${plan.architecture}

${rulesBlock}

Core Rules:
1. FULL-OUTPUT ENFORCEMENT: Output ONLY raw code. Do NOT include markdown fences, introductions, explanations, or commentary.
2. ABSOLUTE BAN ON PLACEHOLDERS: The code must be 100% complete and fully runnable. Never write "// ...", "// rest of code", "// TODO", "/* similar to above */", or "and so on" shortcuts.
3. PREMIUM EDITORIAL & MINIMALIST UI (Frontend files):
   - Adhere to the Premium Utilitarian Minimalism & Editorial UI guidelines: warm monochrome bone canvas background, typography contrast (SF Pro/Geist Sans body + Instrument Serif headings with tight tracking/leading), asymmetric Bento Box feature grids, crisp corners (max 8px/12px border radius), 1px solid #EAEAEA borders, spot pastels for status indicators/tags, no generic placeholders, no gradients, and zero heavy shadows.
4. REACT COMPONENT MODULARITY: Move event handlers to custom hooks, separate mock data to mockData.ts, and enforce strict Readonly props type interfaces.`;

    const fileGenPrompt = `USER PROMPT: ${prompt}\n\nGenerate the complete source code for: ${file.path}\n${file.description}${codebaseContext}`;

    try {
      const fileResult = await AIService.execute(
        nyxModel,
        nyxProvider,
        fileGenPrompt,
        nyxApiKey,
        fileGenInstruction,
        { ...pipelineSettings, maxTokens: 8192, temperature: 0.2 },
        undefined,
        signal,
        undefined
      );
      trackUsage(nyxProvider, fileResult.metrics.tokens);

      // Clean any accidental markdown fences from the output
      let fileContent = fileResult.text.trim();
      fileContent = fileContent
        .replace(/^```\w*\n?/i, '')
        .replace(/\n?```\s*$/i, '')
        .trim();

      generatedFiles.push({ path: file.path, content: fileContent });

      // Write file to workspace with history
      try {
        // Read previous content first to supply to writeFileWithHistory if possible
        let prevContent: string | null = null;
        try {
          const readRes = await fetch(
            `/api/nyx/read-file?filePath=${encodeURIComponent(file.path)}`,
            { signal }
          );
          if (readRes.ok) {
            const readData = await readRes.json();
            if (readData.success) {
              prevContent = readData.content;
            }
          }
        } catch {
          /* file might not exist, ignore */
        }

        await writeFileWithHistory(file.path, fileContent, prevContent);
        taskStatuses[i] = '✅';
        const okAcc =
          renderPlanChecklist() + `---\n\n✅ **Wrote** \`${file.path}\` to workspace\n\n`;
        streamUpdate(okAcc);
      } catch (writeErr: any) {
        taskStatuses[i] = '⚠️';
        const errAcc =
          renderPlanChecklist() +
          `---\n\n⚠️ **Write failed** for \`${file.path}\`: ${writeErr.message}\n*(Code was generated but could not be written to disk)*\n\n`;
        streamUpdate(errAcc);
      }
    } catch (err: any) {
      taskStatuses[i] = '❌';
      const failAcc =
        renderPlanChecklist() +
        `---\n\n❌ **Generation failed** for \`${file.path}\`: ${err.message}\n\n`;
      streamUpdate(failAcc);
      console.error(`[Agentic Loop] File generation failed for ${file.path}:`, err);
    }
  }
}
