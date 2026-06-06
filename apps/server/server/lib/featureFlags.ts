import { initialize, Unleash } from 'unleash-client';
import { config } from '../config/index.js';

let unleash: Unleash | null = null;

if (config.UNLEASH_URL && config.UNLEASH_API_KEY) {
  unleash = initialize({
    url: config.UNLEASH_URL,
    appName: 'nyx',
    customHeaders: { Authorization: config.UNLEASH_API_KEY }
  });
}

export const isEnabled = (flag: string): boolean => {
  if (!unleash) return true; // Default to true if not configured
  return unleash.isEnabled(flag);
};
