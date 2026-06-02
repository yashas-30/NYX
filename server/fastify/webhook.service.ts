import { v4 as uuidv4 } from 'uuid';
import { db } from '../db/client.ts';
import { asyncJobs } from '../db/schema.ts';
import { eq } from 'drizzle-orm';
import logger from '../lib/logger.ts';
import { ProviderAdapter, ChatRequest } from './adapters/base.adapter.ts';

export class WebhookService {
  /**
   * Enqueues an async job for processing and returns a jobId
   */
  async enqueueJob(
    provider: string,
    model: string,
    webhookUrl: string,
    chatReq: ChatRequest,
    adapter: ProviderAdapter,
    apiKey: string
  ): Promise<string> {
    const jobId = uuidv4();
    const now = Date.now();

    await db.insert(asyncJobs).values({
      id: jobId,
      provider,
      model,
      status: 'pending',
      webhookUrl,
      requestPayload: JSON.stringify(chatReq),
      createdAt: now,
      updatedAt: now,
    });

    // Start processing in the background
    this.processJob(jobId, provider, chatReq, adapter, apiKey).catch((err) => {
      logger.error({ err, jobId }, '[WebhookService] Background processing failed entirely');
    });

    return jobId;
  }

  /**
   * Processes the job and sends the webhook
   */
  private async processJob(
    jobId: string,
    provider: string,
    chatReq: ChatRequest,
    adapter: ProviderAdapter,
    apiKey: string
  ) {
    try {
      await this.updateStatus(jobId, 'processing');

      // We consume the stream internally to get the full result
      const stream = adapter.streamChat(chatReq, apiKey);
      let fullResponse = '';

      for await (const chunk of stream) {
        fullResponse += chunk;
      }

      await this.updateStatus(jobId, 'completed', fullResponse);
      await this.deliverWebhook(jobId, 'completed', fullResponse);
    } catch (err: any) {
      logger.error({ err, jobId }, '[WebhookService] Job processing error');
      await this.updateStatus(jobId, 'failed', undefined, err.message);
      await this.deliverWebhook(jobId, 'failed', undefined, err.message);
    }
  }

  private async updateStatus(
    jobId: string,
    status: string,
    resultPayload?: string,
    error?: string
  ) {
    const updateData: any = {
      status,
      updatedAt: Date.now(),
    };
    if (resultPayload !== undefined) updateData.resultPayload = resultPayload;
    if (error !== undefined) updateData.error = error;

    await db.update(asyncJobs).set(updateData).where(eq(asyncJobs.id, jobId));
  }

  private async deliverWebhook(
    jobId: string,
    status: string,
    resultPayload?: string,
    error?: string
  ) {
    try {
      // Get the job record to find the webhookUrl
      const [job] = await db.select().from(asyncJobs).where(eq(asyncJobs.id, jobId)).limit(1);
      if (!job || !job.webhookUrl) return;

      const payload = {
        jobId,
        provider: job.provider,
        model: job.model,
        status,
        result: resultPayload,
        error,
      };

      await fetch(job.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      logger.info(`[WebhookService] Successfully delivered webhook for job ${jobId}`);
    } catch (err: any) {
      logger.error({ err, jobId }, '[WebhookService] Failed to deliver webhook');
    }
  }
}

export const webhookService = new WebhookService();
