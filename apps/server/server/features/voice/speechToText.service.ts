import { loadKeys } from '../vault/vault.service.js';
import logger from '../../lib/logger.js';
import { Readable } from 'stream';

async function streamToBuffer(stream: Readable): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

export class SpeechToTextService {
  static async transcribe(fileStream: Readable, mimetype: string, filename: string): Promise<string> {
    const keys = await loadKeys();
    const groqKey = keys['groq'] || process.env.GROQ_API_KEY || '';
    const openaiKey = keys['openai'] || process.env.OPENAI_API_KEY || '';

    const buffer = await streamToBuffer(fileStream);
    const audioBlob = new Blob([new Uint8Array(buffer)], { type: mimetype || 'audio/wav' });
    const formData = new FormData();
    formData.append('file', audioBlob, filename || 'audio.wav');

    if (groqKey) {
      logger.info('[STT] Transcribing via Groq Whisper...');
      formData.append('model', 'whisper-large-v3-turbo');
      
      const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${groqKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Groq Whisper transcription failed: ${response.statusText} - ${errorText}`);
      }

      const result: any = await response.json();
      return result.text || '';
    } else if (openaiKey) {
      logger.info('[STT] Transcribing via OpenAI Whisper...');
      formData.append('model', 'whisper-1');

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${openaiKey}`,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenAI Whisper transcription failed: ${response.statusText} - ${errorText}`);
      }

      const result: any = await response.json();
      return result.text || '';
    } else {
      throw new Error('No Groq or OpenAI API key configured for speech transcription.');
    }
  }
}
