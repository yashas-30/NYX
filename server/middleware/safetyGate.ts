import logger from '../lib/logger.ts';
import { Request, Response, NextFunction } from 'express';
import { 
  analyzePrompt, 
  isMissingDebugDetails, 
  NON_CODE_REJECTION, 
  MISSING_DEBUG_DETAILS_RESPONSE 
} from '../../shared/promptAnalyzer.ts';

export function safetyGateMiddleware(req: Request, res: Response, next: NextFunction) {
  const { prompt, systemInstruction } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return next();
  }

  // 1. Bypass safety gate entirely for internal NYX Prompt Analyzer requests
  if (systemInstruction && typeof systemInstruction === 'string' && systemInstruction.includes('NYX Prompt Analyzer')) {
    return next();
  }

  try {
    const analysis = analyzePrompt(prompt);
    
    // 2. Check code-relatedness (greetings, identity, and allowed chat bypass safety block)
    if (!analysis.isCodeRelated) {
      const trimmed = prompt.trim();
      const GREETINGS = /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)\b/i;
      const IDENTITY = /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;
      const CONVERSATIONAL = /^(how\s+are\s+you|how's\s+it\s+going|what's\s+up|tell\s+me\s+a\s+joke|what\s+do\s+you\s+think|how\s+do\s+you\s+feel|do\s+you\s+like|what's\s+your\s+favorite|can\s+you\s+help|thanks?\s+for|i\s+appreciate|what\s+time\s+is\s+it|good\s+job|well\s+done)/i;
      const isAllowedChat = GREETINGS.test(trimmed) || IDENTITY.test(trimmed) || CONVERSATIONAL.test(trimmed);

      if (!isAllowedChat) {
        return res.status(400).json({
          error: 'SAFETY_GATE_BLOCKED',
          type: 'non_code',
          message: NON_CODE_REJECTION,
          details: []
        });
      }
    }

    // 3. Check missing debug details
    if (isMissingDebugDetails(prompt, analysis.intent)) {
      return res.status(400).json({
        error: 'SAFETY_GATE_BLOCKED',
        type: 'missing_details',
        message: MISSING_DEBUG_DETAILS_RESPONSE,
        details: []
      });
    }

    // Attach analysis output to request context for downstream components (optimisation)
    // Hardware safety hazards are informational for warnings/optimization recommendations, not reasons to block execution.
    (req as any).promptAnalysis = analysis;
    next();
  } catch (error: any) {
    logger.error('[Safety Gate Middleware Error]:', error.message);
    next(); // Fail-open if analyzer itself crashes to prevent denial of service
  }
}
