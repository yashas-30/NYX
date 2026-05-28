import { AIService } from '@src/core/services/ai.service';
import { AISettings } from '@src/infrastructure/types';

export interface ExecutionPlan {
  summary: string;
  files: Array<{
    path: string;
    description: string;
    language: string;
  }>;
  verifyCommands: string[];
  architecture: string;
}

export async function runPlanningStage(
  nyxModel: string,
  nyxProvider: string,
  nyxApiKey: string,
  planPrompt: string,
  pipelineSettings: AISettings,
  signal: AbortSignal,
  trackUsage: (provider: string, tokens: number) => void
): Promise<ExecutionPlan | null> {
  const planningInstruction = `You are Nyx, an autonomous agentic coding AI. Your task is to analyze the user's prompt and codebase context, then generate a highly structured JSON execution plan.

Output ONLY a raw JSON object (no markdown code fences). The JSON must follow this exact schema:
{
  "summary": "Brief 1-sentence description of what will be built",
  "files": [
    {
      "path": "relative/path/to/file.ext",
      "description": "What this file does",
      "language": "typescript"
    }
  ],
  "verifyCommands": ["npm run build", "node src/test.js"],
  "architecture": "Brief architectural overview"
}

Agentic Planning Rules:
1. FULL-OUTPUT PROTOCOL: Set the checklist to produce complete files from the start. Plan to implement comprehensive solutions rather than quick scripts or skeletons.
2. PREMIUM EDITORIAL & MINIMALIST UI ACCENTS: If the prompt touches UI design or frontend components, plan files matching our Utilitarian Editorial UI design language (Monochrome bone canvas, crisp borders 1px solid #EAEAEA, no heavy shadows, SF Pro/Geist Sans body, Editorial serif headings, desaturated spot pastels, and asymmetric Bento Box structures).
3. MODULAR REACT ARCHITECTURE: Separate data/logic from presentations. Plan distinct mockData.ts files for static content, custom hooks in src/hooks/ for state/event logic, and strict typescript prop interfaces.
4. BATON-PASSING LOOP: If the request is for iterative site builders, plan to parse or update the baton file (.stitch/next-prompt.md), consult sitemaps in SITE.md, and persist screen details in metadata.json.
5. VERIFICATION ROBUSTNESS: Plan build/test commands to validate your code. Use only: npm, node, python, python3, git, gcc, make. Keep commands practical.`;

  try {
    const planResult = await AIService.execute(
      nyxModel,
      nyxProvider,
      planPrompt,
      nyxApiKey,
      planningInstruction,
      { ...pipelineSettings, maxTokens: 2048, temperature: 0.15 },
      undefined,
      signal,
      undefined
    );
    const planText = planResult.text
      .trim()
      .replace(/^```json\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    const parsed = JSON.parse(planText) as ExecutionPlan;
    trackUsage(nyxProvider, planResult.metrics.tokens);
    return parsed;
  } catch (err) {
    console.warn('[Agentic Loop] Plan generation failed:', err);
    return null;
  }
}
