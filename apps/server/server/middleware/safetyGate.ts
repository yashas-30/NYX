import { FastifyRequest, FastifyReply } from 'fastify';

const BLOCKED_PATTERNS = [
  /ignore previous instructions/i,
  /system prompt/i,
  /DAN/i, // Do Anything Now pattern
  /you are no longer an AI/i
];

export const safetyGate = async (request: FastifyRequest, reply: FastifyReply) => {
  const body: any = request.body;
  if (body && body.prompt) {
    const prompt = body.prompt;
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(prompt)) {
        // Log jailbreak attempt
        console.warn(`[SAFETY] Blocked prompt injection attempt from IP ${request.ip}`);
        reply.status(400).send({ error: 'Safety Violation: Blocked content pattern detected' });
        throw new Error('Safety Violation');
      }
    }
  }
};
