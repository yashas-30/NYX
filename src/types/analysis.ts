// ─── Analysis & Judgement Types ───────────────────────────────────────────────

export interface AnalysisJudgement {
  bestResponseId?: string;
  consensus?: string;
  methodology?: string;
  differences?: {
    category: string;
    description: string;
    impact: 'high' | 'medium' | 'low';
  }[];
  critique: Record<string, {
    analysis: string;
    actionableFeedback: string;
    score: number | string;
  }>;
}

export interface CodeAnalysisResult {
  isCodeResponse: boolean;
  language: string;
  bestModelId: string;
  combinedCode: string;
  combinedExplanation: string;
  modelCodeAnalysis: Record<string, {
    codeQualityScore: number;
    executionScore: number;
    explanationScore: number;
    efficiencyScore: number;
    strengths: string[];
    weaknesses: string[];
    extractedCode: string;
  }>;
  codeDifferences: {
    aspect: string;
    description: string;
    winner: string;
  }[];
}
