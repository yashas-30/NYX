const KEY_PATTERNS: Record<string, RegExp> = {
  gemini: /^AIzaSy[a-zA-Z0-9\-_]{33}$/,
};

export function validateApiKey(provider: string, key: string): boolean {
  const pattern = KEY_PATTERNS[provider];
  if (!pattern) return true;
  return pattern.test(key);
}
