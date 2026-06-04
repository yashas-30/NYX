import 'dotenv/config';
import logger from './lib/logger.ts';
import { consumeTasks } from './lib/queue.ts';

logger.info('NYX Background Worker process started.');

async function startWorker() {
  try {
    await consumeTasks(async (task) => {
      logger.info({ task }, 'Worker received task');

      // Simulate task processing
      if (task.type === 'data_processing') {
        logger.info('Processing data task...');
        await new Promise((resolve) => setTimeout(resolve, 2000)); // Fake 2s delay
        logger.info('Data task processed successfully.');
      } else if (task.type === 'analytics') {
        logger.info('Running analytics task...');
        await new Promise((resolve) => setTimeout(resolve, 3000));
        logger.info('Analytics task processed successfully.');
      } else {
        logger.warn({ type: task.type }, 'Unknown task type received');
      }
    });
  } catch (error) {
    logger.error({ error }, 'Failed to start worker');
    process.exit(1);
  }
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  logger.info('Shutting down worker process...');
  process.exit(0);
});

process.on('SIGTERM', () => {
  logger.info('Shutting down worker process...');
  process.exit(0);
});

startWorker();
