const KEY_PATTERNS: Record<string, RegExp> = {
  openrouter: /^sk-or-[a-zA-Z0-9\-_]{20,}$/,
  nvidia:     /^nvapi-[a-zA-Z0-9\-_]{20,}$/,
  gemini:     /^AIzaSy[a-zA-Z0-9\-_]{33}$/,
};

export function validateApiKey(provider: string, key: string): boolean {
  const pattern = KEY_PATTERNS[provider];
  if (!pattern) return true;
  return pattern.test(key);
}
