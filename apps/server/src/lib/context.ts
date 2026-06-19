import { AsyncLocalStorage } from 'async_hooks';

export interface RequestContext {
  requestId?: string;
  [key: string]: any;
}

export const requestContext = new AsyncLocalStorage<RequestContext>();

export function getRequestId(): string | undefined {
  return requestContext.getStore()?.requestId;
}
