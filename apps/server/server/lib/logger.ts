import pino from 'pino';

function redactString(str: string): string {
  return str.replace(/([?&]key=)[^&\s]+/g, '$1[REDACTED]');
}

function redactValue(val: any): any {
  if (typeof val === 'string') {
    return redactString(val);
  }
  if (Array.isArray(val)) {
    return val.map(redactValue);
  }
  if (val && typeof val === 'object') {
    if (val instanceof Error) {
      const errObj: any = {
        name: val.name,
        message: redactString(val.message),
        stack: val.stack ? redactString(val.stack) : undefined,
      };
      for (const k of Object.keys(val)) {
        if (!['name', 'message', 'stack'].includes(k)) {
          errObj[k] = redactValue((val as any)[k]);
        }
      }
      return errObj;
    }
    const newObj: any = {};
    for (const k of Object.keys(val)) {
      newObj[k] = redactValue(val[k]);
    }
    return newObj;
  }
  return val;
}

export const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: process.env.NODE_ENV === 'development' 
    ? { target: 'pino-pretty', options: { colorize: true } }
    : undefined,
  base: { service: 'nyx', version: process.env.NYX_VERSION || '4.0.0' },
  hooks: {
    logMethod(inputArgs, method) {
      const redactedArgs = inputArgs.map(redactValue);
      return method.apply(this, redactedArgs as [obj: unknown, msg?: string, ...args: unknown[]]);
    }
  }
});

export default logger;
