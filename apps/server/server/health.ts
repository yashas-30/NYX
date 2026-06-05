import { db } from './db/client';
import redis from './redis';
import fs from 'fs';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  checks: Record<string, { status: 'pass' | 'fail' | 'warn'; latency: number; message?: string }>;
  timestamp: number;
  version: string;
}

export async function healthCheck(): Promise<HealthStatus> {
  const checks: HealthStatus['checks'] = {};
  let overallStatus: HealthStatus['status'] = 'healthy';

  // Database check
  try {
    const start = Date.now();
    // Assuming Drizzle ORM which supports raw SQL or run
    db.get?.('SELECT 1') ?? db.run?.('SELECT 1') ?? await db.execute('SELECT 1');
    checks.database = { status: 'pass', latency: Date.now() - start };
  } catch (e: any) {
    checks.database = { status: 'fail', latency: 0, message: e.message };
    overallStatus = 'unhealthy';
  }

  // Redis check
  try {
    const start = Date.now();
    await redis.ping();
    checks.redis = { status: 'pass', latency: Date.now() - start };
  } catch (e: any) {
    checks.redis = { status: 'fail', latency: 0, message: e.message };
    overallStatus = 'degraded';
  }

  // Disk space check
  try {
    const start = Date.now();
    const stats = await fs.promises.statfs('/data');
    const freePercent = (stats.bfree / stats.blocks) * 100;
    checks.disk = { 
      status: freePercent > 10 ? 'pass' : freePercent > 5 ? 'warn' : 'fail',
      latency: Date.now() - start,
      message: `${freePercent.toFixed(1)}% free`
    };
    if (freePercent <= 5) overallStatus = 'unhealthy';
    else if (freePercent <= 10 && overallStatus === 'healthy') overallStatus = 'degraded';
  } catch (e: any) {
    checks.disk = { status: 'warn', latency: 0, message: e.message };
  }

  // Memory check
  const memUsage = process.memoryUsage();
  const memPercent = (memUsage.heapUsed / memUsage.heapTotal) * 100;
  checks.memory = {
    status: memPercent < 90 ? 'pass' : 'warn',
    latency: 0,
    message: `${memPercent.toFixed(1)}% used`
  };

  return {
    status: overallStatus,
    checks,
    timestamp: Date.now(),
    version: process.env.NYX_VERSION || 'unknown'
  };
}
