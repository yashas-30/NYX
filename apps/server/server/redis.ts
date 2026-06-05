import { Redis } from 'ioredis';

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  lazyConnect: true,           // Don't connect until first command
  enableOfflineQueue: false,   // Don't queue commands when disconnected
  retryStrategy: (times) => {
    // Exponential back-off, cap at 30s, give up after 10 attempts
    if (times > 10) return null;
    return Math.min(times * 500, 30_000);
  },
  maxRetriesPerRequest: 0,
});

redis.on('error', () => {
  // Suppress "unhandled error" crashes — Redis is optional in dev
});

export default redis;
