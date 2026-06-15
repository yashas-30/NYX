import { FastifyInstance } from 'fastify';
import { SpeechToTextService } from './speechToText.service.js';
import logger from '../../lib/logger.js';

export async function voiceRouter(fastify: FastifyInstance) {
  // ── STT endpoint ────────────────────────────────────────────────────────────
  fastify.post('/stt', async (request, reply) => {
    logger.info('[Voice Router] Received /stt request');
    const data = await request.file();
    if (!data) {
      return reply.code(400).send({ error: 'No audio file uploaded' });
    }

    try {
      const text = await SpeechToTextService.transcribe(
        data.file,
        data.mimetype,
        data.filename
      );
      return reply.send({ text });
    } catch (err: any) {
      logger.error({ err }, '[Voice Router] Speech to text failed:');
      return reply.code(500).send({ error: err.message });
    }
  });

  // ── TTS endpoint ─────────────────────────────────────────────────────────────
  // Proxies to OpenAI TTS API when OPENAI_API_KEY is set, otherwise returns 501
  fastify.post('/tts', async (request, reply) => {
    logger.info('[Voice Router] Received /tts request');
    const { text, voice = 'alloy' } = request.body as { text: string; voice?: string };

    if (!text || typeof text !== 'string' || text.trim().length === 0) {
      return reply.code(400).send({ error: 'text field is required' });
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      // No API key — client will fall back to browser SpeechSynthesis
      return reply.code(501).send({ error: 'TTS not configured: set OPENAI_API_KEY to enable server-side TTS' });
    }

    try {
      const response = await fetch('https://api.openai.com/v1/audio/speech', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'tts-1',
          input: text.slice(0, 4096), // OpenAI TTS max 4096 chars
          voice,
          response_format: 'mp3',
        }),
      });

      if (!response.ok) {
        const err = await response.text();
        logger.error({ err }, '[Voice Router] OpenAI TTS error:');
        return reply.code(response.status).send({ error: 'TTS generation failed' });
      }

      const audioBuffer = await response.arrayBuffer();
      reply.header('Content-Type', 'audio/mpeg');
      return reply.send(Buffer.from(audioBuffer));
    } catch (err: any) {
      logger.error({ err }, '[Voice Router] TTS request failed:');
      return reply.code(500).send({ error: err.message });
    }
  });
}
