import logger from './logger.ts';
import axios from 'axios';

interface AlertContext {
  severity: 'info' | 'warning' | 'error' | 'critical';
  source: string;
  message: string;
  details?: Record<string, any>;
}

export class AlertsService {
  private static slackWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  private static pagerDutyRoutingKey = process.env.PAGERDUTY_ROUTING_KEY;

  static async sendAlert(context: AlertContext) {
    logger.info({ alert: context }, '[Alerts] Dispatching alert');

    const tasks: Promise<void>[] = [];

    if (this.slackWebhookUrl) {
      tasks.push(
        this.sendToSlack(context).catch((err) => {
          logger.error({ error: err.message }, '[Alerts] Failed to send Slack alert');
        })
      );
    }

    if (
      this.pagerDutyRoutingKey &&
      (context.severity === 'error' || context.severity === 'critical')
    ) {
      tasks.push(
        this.sendToPagerDuty(context).catch((err) => {
          logger.error({ error: err.message }, '[Alerts] Failed to send PagerDuty alert');
        })
      );
    }

    await Promise.allSettled(tasks);
  }

  private static async sendToSlack(context: AlertContext) {
    if (!this.slackWebhookUrl) return;

    const emoji =
      context.severity === 'critical'
        ? '🚨'
        : context.severity === 'error'
          ? '❌'
          : context.severity === 'warning'
            ? '⚠️'
            : 'ℹ️';

    const payload = {
      blocks: [
        {
          type: 'header',
          text: {
            type: 'plain_text',
            text: `${emoji} NYX Alert: ${context.severity.toUpperCase()}`,
          },
        },
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `*Source:* ${context.source}\n*Message:* ${context.message}`,
          },
        },
      ],
    };

    if (context.details) {
      payload.blocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Details:*\n\`\`\`${JSON.stringify(context.details, null, 2)}\`\`\``,
        },
      });
    }

    await axios.post(this.slackWebhookUrl, payload, { timeout: 5000 });
  }

  private static async sendToPagerDuty(context: AlertContext) {
    if (!this.pagerDutyRoutingKey) return;

    const payload = {
      routing_key: this.pagerDutyRoutingKey,
      event_action: 'trigger',
      payload: {
        summary: `[NYX ${context.severity.toUpperCase()}] ${context.message}`,
        source: context.source,
        severity: context.severity === 'critical' ? 'critical' : 'error',
        custom_details: context.details || {},
      },
    };

    await axios.post('https://events.pagerduty.com/v2/enqueue', payload, { timeout: 5000 });
  }
}
