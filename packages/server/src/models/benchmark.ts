import { LocalModelManager, AIService } from './utils.js';

export interface BenchmarkResult {
  modelId: string;
  quantization: string;
  timestamp: number;
  tests: Record<string, BenchmarkTest>;
  overallScore: number;
}

export interface BenchmarkTest {
  name: string;
  score: number; // 0-100
  latency: number;
  tokens: number;
  tps: number;
  details: string;
}

export const BENCHMARK_SUITE = {
  coding: {
    prompt: 'Write a Python function to find the longest common subsequence of two strings using dynamic programming. Include type hints and docstring.',
    evalCriteria: ['correctness', 'code_quality', 'completeness']
  },
  reasoning: {
    prompt: 'A farmer has 17 sheep and all but 9 die. How many sheep are left? Explain your reasoning step by step.',
    evalCriteria: ['correctness', 'reasoning_quality']
  },
  math: {
    prompt: 'Solve: d/dx (x^3 * sin(x)) at x = π/4. Show all steps.',
    evalCriteria: ['correctness', 'step_clarity']
  },
  multilingual: {
    prompt: 'Translate the following to French: "The quick brown fox jumps over the lazy dog."',
    evalCriteria: ['accuracy', 'fluency']
  }
};

export async function benchmarkModel(
  modelId: string, 
  quantization: string,
  onProgress: (test: string, progress: number) => void
): Promise<BenchmarkResult> {
  const results: Record<string, BenchmarkTest> = {};

  for (const [testName, test] of Object.entries(BENCHMARK_SUITE)) {
    onProgress(testName, 0);

    const startTime = Date.now();
    const response = await LocalModelManager.run(modelId, test.prompt, {
      maxTokens: 2048,
      temperature: 0.2
    });
    const latency = Date.now() - startTime;

    onProgress(testName, 50);

    // Evaluate response (using a cloud model for evaluation)
    const evalPrompt = `Evaluate the following response to: "${test.prompt}"\n\nResponse: ${response}\n\nScore from 0-100 based on: ${test.evalCriteria.join(', ')}. Return only the numeric score.`;
    const evalResponse = await AIService.execute('gemini-2.5-flash', 'gemini', evalPrompt);
    const score = parseInt(evalResponse.text) || 50;

    onProgress(testName, 100);

    results[testName] = {
      name: testName,
      score,
      latency,
      tokens: Math.ceil(response.length / 4),
      tps: Math.ceil(response.length / 4) / (latency / 1000),
      details: response.slice(0, 200)
    };
  }

  const overallScore = Object.values(results).reduce((sum, r) => sum + r.score, 0) / Object.values(results).length;

  return {
    modelId,
    quantization,
    timestamp: Date.now(),
    tests: results,
    overallScore
  };
}
