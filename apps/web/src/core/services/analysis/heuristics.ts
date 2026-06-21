/**
 * @file services/analysis/heuristics.ts
 * @description Standalone heuristic functions extracted from PromptAnalysisService.
 */

import type { PromptAnalysis } from '@src/types/agent';

// ---------------------------------------------------------------------------
// Intent detection
// ---------------------------------------------------------------------------

export function detectIntentWithConfidence(lower: string, original: string): {
  intent: PromptAnalysis['intent'];
  confidence: number;
} {
  const scores: Record<string, number> = { question: 0, code: 0, search: 0, command: 0, conversation: 0 };

  if (/^(what|how|why|when|where|who|which|is|are|can|does|do)\b/.test(lower)) scores.question += 0.4;
  if (/\?\s*$/.test(original)) scores.question += 0.3;
  if (/^(explain|describe|tell me about)\b/.test(lower)) scores.question += 0.2;

  if (/^(write|create|build|generate|code|fix|refactor|debug|implement|develop)\b/.test(lower)) scores.code += 0.5;
  if (/\b(function|class|component|api|endpoint|database|query|bug|error|exception)\b/.test(lower)) scores.code += 0.3;
  if (/```[\w]*\n/.test(original)) scores.code += 0.4;
  if (/[{};]\s*\n/.test(original) && original.length > 50) scores.code += 0.2;

  if (/^(search|find|lookup|google|look up|check)\b/.test(lower)) scores.search += 0.5;
  if (/\b(latest|current|today|news|weather|price|stock|market|update)\b/.test(lower)) scores.search += 0.3;

  if (/^(do|make|set|change|update|delete|remove|add|create|run|execute|deploy|build)\b/.test(lower)) scores.command += 0.4;
  if (/^(please|can you|could you)\b/.test(lower) && scores.code < 0.3) scores.command += 0.2;

  scores.conversation += 0.1;

  let maxScore = 0;
  let winner: string = 'conversation';
  for (const [intent, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      winner = intent;
    }
  }

  const total = Object.values(scores).reduce((a, b) => a + b, 0);
  const confidence = total > 0 ? maxScore / total : 0.5;

  return { intent: winner as PromptAnalysis['intent'], confidence };
}

// ---------------------------------------------------------------------------
// Tone detection
// ---------------------------------------------------------------------------

export function detectToneWithConfidence(lower: string, original: string): {
  tone: PromptAnalysis['tone'];
  confidence: number;
} {
  let technical = 0, casual = 0, professional = 0;

  if (/\b(explain|how does|architecture|implementation|algorithm|complexity|optimization)\b/.test(lower)) technical += 1;
  if (/\b(code|function|method|class|interface|type|generic|async|await)\b/.test(lower)) technical += 0.5;
  if (original.includes('`') || original.includes('```')) technical += 0.5;

  const casualWords = ['hey', 'hi', 'lol', 'haha', 'dude', 'bro', 'thanks', 'btw', 'omg', 'wtf'];
  casualWords.forEach(w => { if (lower.includes(w)) casual += 0.4; });
  if (/!{2,}/.test(original)) casual += 0.2;

  if (/\b(please|thank you|regards|sincerely|best|formal|report|document|proposal)\b/.test(lower)) professional += 0.5;
  if (original.length > 200 && casual < 0.5) professional += 0.3;

  const scores = { technical, casual, professional };
  let maxScore = 0;
  let winner: string = 'professional';
  for (const [tone, score] of Object.entries(scores)) {
    if (score > maxScore) {
      maxScore = score;
      winner = tone;
    }
  }

  const total = technical + casual + professional;
  return { tone: winner as PromptAnalysis['tone'], confidence: total > 0 ? maxScore / total : 0.5 };
}

// ---------------------------------------------------------------------------
// Domain detection
// ---------------------------------------------------------------------------

const DOMAINS = [
  {
    name: 'software_engineering',
    patterns: [/\b(react|typescript|python|rust|go|javascript|java|cpp|c\+\+|api|database|sql|frontend|backend|devops|docker|kubernetes|git|github)\b/i],
    weight: 1.0,
  },
  {
    name: 'data_science',
    patterns: [/\b(pandas|numpy|tensorflow|pytorch|ml|machine learning|dataset|model|training|inference|llm|embedding|vector)\b/i],
    weight: 1.0,
  },
  {
    name: 'science',
    patterns: [/\b(math|physics|chemistry|biology|science|theorem|equation|formula|experiment|hypothesis)\b/i],
    weight: 0.8,
  },
  {
    name: 'finance',
    patterns: [/\b(stock|market|finance|invest|economy|crypto|bitcoin|trading|portfolio|dividend|etf)\b/i],
    weight: 0.9,
  },
  {
    name: 'legal',
    patterns: [/\b(law|legal|court|sue|attorney|contract|clause|liability|regulation|compliance|gdpr|hipaa)\b/i],
    weight: 0.9,
  },
  {
    name: 'medical',
    patterns: [/\b(health|medical|doctor|symptom|disease|diagnosis|treatment|patient|clinical|pharma)\b/i],
    weight: 0.8,
  },
  {
    name: 'creative',
    patterns: [/\b(story|poem|write|creative|design|art|music|song|script|novel|character|plot)\b/i],
    weight: 0.7,
  },
  {
    name: 'business',
    patterns: [/\b(strategy|marketing|sales|customer|product|startup|funding|pitch|revenue|growth|okr|kpi)\b/i],
    weight: 0.8,
  },
];

export function detectDomainWithConfidence(lower: string): {
  domain: string;
  confidence: number;
} {
  let maxScore = 0;
  let winner = 'general';

  for (const d of DOMAINS) {
    let score = 0;
    for (const pattern of d.patterns) {
      const matches = (lower.match(pattern) || []).length;
      score += matches * d.weight;
    }
    if (score > maxScore) {
      maxScore = score;
      winner = d.name;
    }
  }

  return { domain: winner, confidence: Math.min(maxScore / 2, 1) };
}

// ---------------------------------------------------------------------------
// Web search need
// ---------------------------------------------------------------------------

export function checkWebSearchNeed(lower: string, _original: string): boolean {
  const timeSensitive = /\b(today|latest|current|now|news|recent|weather|price|update|breaking|just released|new version)\b/;
  const explicitSearch = /\b(search|find|lookup|google|look up|check online|web search)\b/;
  const timelessKnowledge = /\b(explain|how does|why is|concept|theory|principle|definition)\b/;

  if (timelessKnowledge.test(lower) && !timeSensitive.test(lower)) return false;
  return timeSensitive.test(lower) || explicitSearch.test(lower);
}

// ---------------------------------------------------------------------------
// Reasoning need
// ---------------------------------------------------------------------------

export function checkReasoningNeed(lower: string, original: string): boolean {
  const deepReasoning = /\b(analyze|compare|evaluate|synthesize|prove|derive|optimize|design|architecture|trade-off|pros and cons|advantages|disadvantages)\b/;
  const multiStep = /\b(step by step|first.*then|process|workflow|pipeline|sequence|chain)\b/;
  const mathComplex = /[∫∑∏√∞∂∇]|\b(integrate|differentiate|matrix|eigenvalue|probability|statistics)\b/;

  const simpleWhy = /^(why is|why does|why do)\b.*\?$/;
  if (simpleWhy.test(lower) && original.length < 100) return false;

  return deepReasoning.test(lower) || multiStep.test(lower) || mathComplex.test(lower);
}

// ---------------------------------------------------------------------------
// Complexity estimation
// ---------------------------------------------------------------------------

export function estimateComplexity(lower: string, original: string): 1 | 2 | 3 {
  let score = 0;

  if (original.length > 1000) score += 2;
  else if (original.length > 300) score += 1;

  const bulletPoints = (original.match(/^[•\-*]\s/mg) || []).length;
  if (bulletPoints > 5) score += 1;

  const complexOps = /\b(compare|analyze|evaluate|synthesize|design|implement|refactor|migrate|integrate|scale|optimize)\b/;
  if (complexOps.test(lower)) score += 1;

  const domainMatches = ['code', 'design', 'business', 'technical'].filter(d => lower.includes(d)).length;
  if (domainMatches > 1) score += 1;

  if (lower.includes('previous') || lower.includes('earlier') || lower.includes('you said')) score += 1;

  return score >= 3 ? 3 : score >= 1 ? 2 : 1;
}

// ---------------------------------------------------------------------------
// Expertise detection
// ---------------------------------------------------------------------------

export function detectExpertise(lower: string, original: string): PromptAnalysis['userExpertise'] {
  if (/\b(beginner|newbie|noob|just started|learning|tutorial|explain like i'm|eli5)\b/.test(lower)) return 'beginner';
  if (original.length < 50 && /^(what|how)\b/.test(lower)) return 'beginner';

  const expertJargon = /\b(refactor|abstract|polymorphism|microservice|event-driven|cqrs|event sourcing|sharding|indexing|query optimization|memory leak|race condition|deadlock)\b/;
  const specificQuestions = /\b(specifically|in particular|regarding|with respect to|considering|given that)\b/;
  if (expertJargon.test(lower) || specificQuestions.test(lower)) return 'expert';

  return 'intermediate';
}

// ---------------------------------------------------------------------------
// Urgency detection
// ---------------------------------------------------------------------------

export function detectUrgency(lower: string, original: string): PromptAnalysis['urgency'] {
  if (/\b(urgent|asap|emergency|critical|broken|down|not working|stuck|blocked|help!|please help)\b/.test(lower)) return 'high';
  if (/!{2,}/.test(original) || original.toUpperCase() === original) return 'high';
  if (/\b(soon|quickly|fast|when possible|at your earliest)\b/.test(lower)) return 'medium';
  return 'low';
}

// ---------------------------------------------------------------------------
// Model routing
// ---------------------------------------------------------------------------

export function routeModel(
  complexity: number,
  reasoning: boolean,
  webSearch: boolean
): PromptAnalysis['suggestedModel'] {
  if (complexity === 3 || reasoning) return 'reasoning';
  if (webSearch || complexity === 2) return 'standard';
  return 'fast';
}

// ---------------------------------------------------------------------------
// Context window estimation
// ---------------------------------------------------------------------------

export function estimateContextWindow(prompt: string, complexity: number): number {
  const inputTokens = Math.ceil(prompt.length / 4);
  const outputTokens = complexity === 1 ? 512 : complexity === 2 ? 2048 : 4096;
  return inputTokens + outputTokens;
}

// ---------------------------------------------------------------------------
// Confidence calculation
// ---------------------------------------------------------------------------

export function calculateConfidence(
  intentConf: number,
  toneConf: number,
  domainConf: number,
  length: number
): number {
  const lengthBonus = Math.min(length / 500, 0.2);
  const base = (intentConf + toneConf + domainConf) / 3;
  return Math.min(base + lengthBonus, 0.95);
}

// ---------------------------------------------------------------------------
// Execution mode heuristics
// ---------------------------------------------------------------------------

export function detectExecutionMode(lower: string, complexity: number): {
  suggestedExecutionMode: 'standard' | 'parallel' | 'ensemble' | 'ab-test';
  suggestedExecutionReasoning: string;
} {
  const isABTest = /\b(a\/b\s*test|ab\s*test|split\s*test|ab-test)\b/i.test(lower);
  const isParallel =
    /\b(compare|comparison|versus|vs|side\s*by\s*side|parallel|simultaneous|simultaneously|difference\s*between)\b/i.test(lower) ||
    /\b(model\s*difference|which\s*model\s*is\s*better|which\s*is\s*better)\b/i.test(lower);
  const isEnsemble = /\b(ensemble|synthesize|synthesis|consensus|merge\s*responses|combine\s*answers|blend)\b/i.test(lower);

  if (isABTest) {
    return {
      suggestedExecutionMode: 'ab-test',
      suggestedExecutionReasoning: 'Detected request for A/B testing of responses.',
    };
  } else if (isParallel) {
    return {
      suggestedExecutionMode: 'parallel',
      suggestedExecutionReasoning: 'Detected comparative query. Running models in parallel for side-by-side evaluation.',
    };
  } else if (isEnsemble) {
    return {
      suggestedExecutionMode: 'ensemble',
      suggestedExecutionReasoning: 'Detected request for consensus synthesis across multiple models.',
    };
  }

  return {
    suggestedExecutionMode: 'standard',
    suggestedExecutionReasoning: 'Standard conversational request. Using single selected model.',
  };
}

// ---------------------------------------------------------------------------
// fastAnalyze orchestrator
// ---------------------------------------------------------------------------

export function fastAnalyze(prompt: string): PromptAnalysis {
  const lower = prompt.toLowerCase();
  const original = prompt;

  const intentResult = detectIntentWithConfidence(lower, original);
  const toneResult = detectToneWithConfidence(lower, original);
  const domainResult = detectDomainWithConfidence(lower);
  const webSearch = checkWebSearchNeed(lower, original);
  const reasoning = checkReasoningNeed(lower, original);
  const complexity = estimateComplexity(lower, original);
  const expertise = detectExpertise(lower, original);
  const urgency = detectUrgency(lower, original);

  const confidence = calculateConfidence(
    intentResult.confidence,
    toneResult.confidence,
    domainResult.confidence,
    prompt.length
  );

  const { suggestedExecutionMode, suggestedExecutionReasoning } = detectExecutionMode(lower, complexity);

  return {
    intent: intentResult.intent,
    tone: toneResult.tone,
    domain: domainResult.domain,
    requiresWebSearch: webSearch,
    requiresReasoning: reasoning,
    estimatedComplexity: complexity,
    complexity,
    confidence,
    suggestedModel: routeModel(complexity, reasoning, webSearch),
    needsToolUse: webSearch || reasoning || complexity === 3,
    urgency,
    userExpertise: expertise,
    contextWindowNeeded: estimateContextWindow(original, complexity),
    suggestedExecutionMode,
    suggestedExecutionReasoning,
  };
}
