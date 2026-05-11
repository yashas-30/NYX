import { callAI, isCodePrompt } from './inferenceClient';
import { getProviderForModel, PROVIDER_LABELS } from '@/src/core/utils/provider';
import { AnalysisJudgement, CodeAnalysisResult } from '@/src/types';

/**
 * Extracts the first valid JSON object from a string, handling markdown fences.
 */
function extractJSON(text: string): string {
  console.log('[extractJSON] Raw response length:', text?.length);
  
  if (!text || text.trim().length === 0) {
    throw new Error("Model returned empty response.");
  }

  // Check if the response contains an error message
  const lowerText = text.toLowerCase();
  if (lowerText.includes('error') || lowerText.includes('failed') || lowerText.includes('exception')) {
    console.log('[extractJSON] Response contains error:', text.substring(0, 200));
    // Try to extract error message
    const errorMatch = text.match(/"?error"?[\s:]*"?([^"]+)"?/i) || text.match(/error[\s:]+(.+)/i);
    if (errorMatch) {
      throw new Error(`API Error: ${errorMatch[1] || text.substring(0, 100)}`);
    }
  }

  // Try to find content within markdown code blocks first
  const markdownMatch = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  let content = markdownMatch ? markdownMatch[1] : text;
  console.log('[extractJSON] After markdown extraction:', content?.substring(0, 100));
  
  // Try to find any JSON-like structure in the content
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    content = jsonMatch[0];
    console.log('[extractJSON] Found JSON in content');
  }

  // Try to parse to validate it's proper JSON
  try {
    JSON.parse(content);
    console.log('[extractJSON] Successfully parsed JSON');
    return content;
  } catch (parseErr: any) {
    console.log('[extractJSON] Parse failed:', parseErr.message);
    // Try to find the outermost braces
    const startIdx = content.indexOf('{');
    const endIdx = content.lastIndexOf('}');
    
    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const candidate = content.substring(startIdx, endIdx + 1);
      try {
        JSON.parse(candidate);
        console.log('[extractJSON] Found valid JSON with brace matching');
        return candidate;
      } catch {}
    }
    
    // If still failing, show a portion of the response for debugging
    console.log('[extractJSON] Response preview:', text.substring(0, 300));
    throw new Error("Model failed to generate valid JSON structure. The model returned: " + text.substring(0, 150) + "...");
  }
}

/**
 * Compares multiple model responses to find the best 'Daily Driver'.
 */
export async function judgeResponses(
  globalPrompt: string,
  responses: { modelId: string; output: string; localPrompt?: string }[],
  apiKeyOverride?: string,
  preferredModel?: string,
  options?: { lmStudioBaseUrl?: string }
): Promise<string> {
  const model = preferredModel || "gemini-3.1-pro-preview";
  const provider = getProviderForModel(model);

  const rawApiKey = apiKeyOverride?.trim();
  if (!rawApiKey) {
    throw new Error(`${PROVIDER_LABELS[provider]} API key is required for analysis. Please add your key in Settings.`);
  }

  const formattedResponses = responses
    .map(
      (r) => `
MODEL [${r.modelId}]:
SOURCE PROMPT: ${r.localPrompt || globalPrompt}
OUTPUT:
${r.output}
---`
    )
    .join("\n\n");

  const judgePrompt = `
You are an expert AI evaluator comparing responses from different language models.
Find a "Daily Driver" model based on Memory, Formatting, Nuance, Logic, and Efficiency.

USER PROMPT: "${globalPrompt}"

RULES:
1. Reference each model by its exact ID shown in brackets.
2. Output ONLY raw JSON matching the schema below. 
3. DO NOT include any markdown code fences or conversational text.
4. "consensus" is a synthesized best-answer in markdown.

SCHEMA:
{
  "bestResponseId": "exact modelId string",
  "consensus": "Synthesized markdown answer",
  "methodology": "Daily-Driver Optimization Audit",
  "differences": [
    {
      "category": "Memory|Formatting|Nuance|Logic|Efficiency",
      "description": "Short divergence description",
      "impact": "high|medium|low"
    }
  ],
  "critique": {
    "<modelId>": {
      "analysis": "Pillar-focused analysis",
      "actionableFeedback": "Specific improvement tip",
      "score": <0-100>
    }
  }
}

MODEL RESPONSES:
${formattedResponses}
`;

  const result = await callAI(
    model,
    provider,
    judgePrompt,
    rawApiKey,
    "Output ONLY valid JSON. No markdown fences. No yapping.",
    { maxTokens: 8192 },
    undefined,
    undefined,
    undefined,
    undefined,
    options
  );

  console.log('[Analysis] Raw API response:', result.text?.substring(0, 500));
  console.log('[Analysis] Response length:', result.text?.length);
  
  if (!result.text || result.text.trim().length === 0) {
    throw new Error("Model returned empty response.");
  }

  return extractJSON(result.text || "{}");
}

/**
 * Specialized judge for code generation tasks.
 */
export async function judgeCodeResponses(
  userPrompt: string,
  responses: { modelId: string; output: string; localPrompt?: string }[],
  apiKeyOverride?: string,
  preferredModel?: string,
  options?: { lmStudioBaseUrl?: string }
): Promise<string> {
  const model = preferredModel || "gemini-3.1-pro-preview";
  const provider = getProviderForModel(model);

  const rawApiKey = apiKeyOverride?.trim();
  if (!rawApiKey) {
    throw new Error(`${PROVIDER_LABELS[provider]} API key is required for code analysis. Please add your key in Settings.`);
  }

  const formattedResponses = responses
    .map(r => `MODEL [${r.modelId}]:\n${r.output}\n---`)
    .join("\n\n");

  const judgePrompt = `
You are a Lead Software Architect reviewing code from multiple AI models.
Evaluate implementation quality using a strict 100-point rubric.

USER'S CODING TASK: "${userPrompt}"

RUBRIC:
1. **Execution (40 pts)**: Reliability, edge cases, security.
2. **Explanation (30 pts)**: Clarity of architecture, formatting.
3. **Efficiency (30 pts)**: Optimization, modularity.

RULES:
1. Output ONLY raw JSON. No markdown code fences. No conversational text.
2. Every model ID MUST have an entry in "modelCodeAnalysis".
3. "combinedCode" must be a complete, runnable best-of implementation.

SCHEMA:
{
  "isCodeResponse": true,
  "language": "detected-lang",
  "bestModelId": "modelId",
  "combinedCode": "Complete code implementation",
  "combinedExplanation": "Architectural summary",
  "modelCodeAnalysis": {
    "<modelId>": {
      "codeQualityScore": <0-100>,
      "executionScore": <0-40>,
      "explanationScore": <0-30>,
      "efficiencyScore": <0-30>,
      "strengths": ["list"],
      "weaknesses": ["list"],
      "extractedCode": "code block"
    }
  },
  "codeDifferences": [
    {
      "aspect": "Execution|Explanation|Efficiency",
      "description": "Short divergence description",
      "winner": "modelId"
    }
  ]
}

MODEL RESPONSES:
${formattedResponses}
`;

  const result = await callAI(
    model,
    provider,
    judgePrompt,
    rawApiKey,
    "Output ONLY valid JSON. No markdown fences. No yapping.",
    { maxTokens: 16384 },
    undefined,
    undefined,
    undefined,
    undefined,
    options
  );

  return extractJSON(result.text || "{}");
}
