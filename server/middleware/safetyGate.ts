import { Request, Response, NextFunction } from 'express';
import { 
  analyzePrompt, 
  isMissingDebugDetails, 
  NON_CODE_REJECTION, 
  MISSING_DEBUG_DETAILS_RESPONSE 
} from '../../shared/promptAnalyzer.ts';

export function safetyGateMiddleware(req: Request, res: Response, next: NextFunction) {
  const { prompt } = req.body;
  if (!prompt || typeof prompt !== 'string') {
    return next();
  }

  try {
    const analysis = analyzePrompt(prompt);
    
    // 1. Check code-relatedness
    if (!analysis.isCodeRelated) {
      return res.status(400).json({
        error: 'SAFETY_GATE_BLOCKED',
        type: 'non_code',
        message: NON_CODE_REJECTION,
        details: []
      });
    }

    // 2. Check missing debug details
    if (isMissingDebugDetails(prompt, analysis.intent)) {
      return res.status(400).json({
        error: 'SAFETY_GATE_BLOCKED',
        type: 'missing_details',
        message: MISSING_DEBUG_DETAILS_RESPONSE,
        details: []
      });
    }

    // 3. Check hardware safety hazards (hardwareSafetyFlags)
    if (analysis.hardware?.safetyHazards && analysis.hardware.safetyHazards.length > 0) {
      return res.status(400).json({
        error: 'SAFETY_GATE_BLOCKED',
        type: 'hardware_hazard',
        message: 'Hardware Safety Violations: The prompt contains potential hardware safety risks that require configuration review.',
        details: analysis.hardware.safetyHazards
      });
    }

    // Attach analysis output to request context for downstream components (optimisation)
    (req as any).promptAnalysis = analysis;
    next();
  } catch (err: any) {
    console.error('[Safety Gate Middleware Error]:', err.message);
    next(); // Fail-open if analyzer itself crashes to prevent denial of service
  }
}
