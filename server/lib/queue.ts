import * as amqp from 'amqplib';
import logger from './logger.ts';

let connection: amqp.ChannelModel | null = null;
let channel: amqp.Channel | null = null;

const QUEUE_NAME = 'nyx_background_tasks';

export async function connectQueue(): Promise<amqp.Channel> {
  if (channel) return channel;

  const rabbitUrl = process.env.RABBITMQ_URL || 'amqp://localhost';
  try {
    connection = await amqp.connect(rabbitUrl);
    channel = await connection.createChannel();
    await channel.assertQueue(QUEUE_NAME, { durable: true });

    logger.info(`Connected to RabbitMQ at ${rabbitUrl}`);

    connection.on('error', (err: any) => {
      logger.error({ err }, 'RabbitMQ connection error');
      connection = null;
      channel = null;
    });

    connection.on('close', () => {
      logger.warn('RabbitMQ connection closed');
      connection = null;
      channel = null;
    });

    return channel;
  } catch (err) {
    logger.error({ err }, 'Failed to connect to RabbitMQ');
    throw err;
  }
}

export async function publishTask(taskType: string, payload: any): Promise<boolean> {
  const ch = await connectQueue();
  const task = { type: taskType, payload, timestamp: Date.now() };

  return ch.sendToQueue(QUEUE_NAME, Buffer.from(JSON.stringify(task)), {
    persistent: true,
  });
}

export async function consumeTasks(handler: (task: any) => Promise<void>) {
  const ch = await connectQueue();

  // prefetch 1 to distribute load fairly
  await ch.prefetch(1);

  logger.info(`Starting consumer on queue ${QUEUE_NAME}...`);

  await ch.consume(QUEUE_NAME, async (msg) => {
    if (msg !== null) {
      try {
        const task = JSON.parse(msg.content.toString());
        await handler(task);
        ch.ack(msg);
      } catch (err) {
        logger.error({ err }, 'Error processing task from queue');
        // If it's a fatal error, we could nack with requeue: false
        ch.nack(msg, false, false);
      }
    }
  });
}

export async function closeQueue() {
  if (channel) {
    await channel.close();
  }
  if (connection) {
    await connection.close();
  }
}
