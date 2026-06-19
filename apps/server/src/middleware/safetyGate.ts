import logger from '../lib/logger.js';
import { Request, Response, NextFunction } from 'express';
import {
  analyzePrompt,
  isMissingDebugDetails,
  NON_CODE_REJECTION,
  MISSING_DEBUG_DETAILS_RESPONSE,
} from '@nyx/shared';
import { AuditLog } from '../lib/auditLog.js';

declare global {
  var safetyGateRateLimitStore: Map<string, { count: number; resetTime: number }>;
}

export async function safetyGateMiddleware(request: Request, reply: Response, next: NextFunction) {
  const { prompt, systemInstruction } = (request.body as any) || {};
  if (!prompt || typeof prompt !== 'string') {
    return next();
  }

  // 1. Bypass safety gate entirely for internal NYX Prompt Analyzer requests
  if (
    systemInstruction &&
    typeof systemInstruction === 'string' &&
    systemInstruction.includes('NYX Prompt Analyzer')
  ) {
    return next();
  }

  const ip = request.ip || 'unknown';
  const now = Date.now();
  const windowMs = 60 * 1000;

  if (!global.safetyGateRateLimitStore) {
    global.safetyGateRateLimitStore = new Map<string, { count: number; resetTime: number }>();
  }

  const store = global.safetyGateRateLimitStore;
  let record = store.get(ip);
  if (!record || record.resetTime < now) {
    record = { count: 0, resetTime: now + windowMs };
  }

  record.count += 1;
  store.set(ip, record);

  if (record.count > 10) {
    logger.warn(`[Safety Gate] Rate limit exceeded for IP: ${ip}`);
    reply
      .status(429)
      .json({ error: 'Too many requests to safety gate bypass. Please try again later.' });
    return;
  }

  try {
    const analysis = analyzePrompt(prompt);

    // 2. Check code-relatedness
    if (!analysis.isCodeRelated) {
      const trimmed = prompt.trim();
      const GREETINGS =
        /^(hi|hello|hey|greetings|good\s+morning|good\s+afternoon|good\s+evening|howdy|yo|sup|whats\s+up|what's\s+up|how\s+are\s+you|how's\s+it\s+going|what's\s+good|thanks?|thank\s+you|okay|ok|cool|nice|great|awesome|got\s+it|sure|yes|no|yep|nope|bye|goodbye|see\s+you|good\s+night|good\s+day)\b/i;
      const IDENTITY =
        /\b(who\s+are\s+you|your\s+identity|what\s+is\s+your\s+name|when\s+were\s+you\s+built|tell\s+me\s+about\s+yourself|who\s+built\s+you|are\s+you\s+nyx|who\s+is\s+nyx|what\s+can\s+you\s+do|what\s+are\s+you|help\s+me)\b/i;
      const CONVERSATIONAL =
        /^(how\s+are\s+you|how's\s+it\s+going|what's\s+up|tell\s+me\s+a\s+joke|what\s+do\s+you\s+think|how\s+do\s+you\s+feel|do\s+you\s+like|what's\s+your\s+favorite|can\s+you\s+help|thanks?\s+for|i\s+appreciate|what\s+time\s+is\s+it|good\s+job|well\s+done)/i;
      const isAllowedChat =
        GREETINGS.test(trimmed) || IDENTITY.test(trimmed) || CONVERSATIONAL.test(trimmed);

      if (!isAllowedChat) {
        reply.status(400).json({
          error: 'SAFETY_GATE_BLOCKED',
          type: 'non_code',
          message: NON_CODE_REJECTION,
          details: [],
        });
        return;
      }
    }

    // 3. High-risk intent classifier
    const HIGH_RISK_PATTERNS = [
      /delete\s+(all\s+files|everything|the\s+project)/i,
      /rm\s+-rf/i,
      /ignore\s+(all\s+)?(previous\s+)?(instructions|rules|system\s+prompt)/i,
      /bypass\s+(safety|security)/i,
      /format\s+(c:|drive|disk)/i,
      /drop\s+(database|table)/i,
    ];

    const isHighRisk = HIGH_RISK_PATTERNS.some((pattern) => pattern.test(prompt));
    if (isHighRisk) {
      logger.warn('[Safety Gate] High-risk intent detected in prompt');
      AuditLog.log({
        category: 'safety_gate',
        event: { promptSnippet: prompt.substring(0, 100) },
        status: 'blocked',
      }).catch(() => {});

      reply.status(403).json({
        error: 'SAFETY_GATE_BLOCKED',
        type: 'high_risk_intent',
        message: 'High-risk intent detected. Manual approval required.',
        requires_approval: true,
      });
      return;
    }

    // 4. Check missing debug details
    if (isMissingDebugDetails(prompt, analysis.intent)) {
      reply.status(400).json({
        error: 'SAFETY_GATE_BLOCKED',
        type: 'missing_details',
        message: MISSING_DEBUG_DETAILS_RESPONSE,
        details: [],
      });
      return;
    }

    // Attach analysis output to request context for downstream components
    (request as any).promptAnalysis = analysis;
    next();
  } catch (error: any) {
    logger.error('[Safety Gate Middleware Error]:', error.message);
    next(error);
  }
}
