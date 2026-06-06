import crypto from 'crypto';
import { logger } from '../logger.js';

export interface AuditEvent {
  id: string;
  timestamp: string;
  actorId: string;
  action: string;
  resource: string;
  ipAddress: string;
  status: 'SUCCESS' | 'FAILURE';
  details?: any;
  previousHash: string;
  hash: string;
}

export class AuditLog {
  private lastHash: string = crypto.createHash('sha256').update('GENESIS').digest('hex');

  async logEvent(
    actorId: string, 
    action: string, 
    resource: string, 
    ipAddress: string, 
    status: 'SUCCESS' | 'FAILURE',
    details?: any
  ): Promise<AuditEvent> {
    const timestamp = new Date().toISOString();
    const id = crypto.randomUUID();
    
    const eventData = `${id}|${timestamp}|${actorId}|${action}|${resource}|${status}`;
    const hash = crypto.createHash('sha256')
      .update(eventData + this.lastHash)
      .digest('hex');

    const event: AuditEvent = {
      id, timestamp, actorId, action, resource, ipAddress, status, details,
      previousHash: this.lastHash,
      hash
    };

    this.lastHash = hash;

    // In production, this goes to immutable storage (e.g. AWS QLDB or S3 WORM)
    logger.info({ audit: true, event }, `[AUDIT] ${action} on ${resource} by ${actorId}`);
    return event;
  }
}
