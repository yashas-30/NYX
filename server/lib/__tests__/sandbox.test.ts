import { describe, it, expect } from 'vitest';
import { parseShellCommand } from '../sandbox.ts';

describe('Sandbox Security', () => {
  it('blocks command chaining', () => {
    expect(parseShellCommand('npm install && rm -rf /').hasForbiddenChaining).toBe(true);
  });

  it('blocks subshells', () => {
    expect(parseShellCommand('node -e "$(cat /etc/passwd)"').hasForbiddenChaining).toBe(true);
  });

  it('allows safe commands', () => {
    const result = parseShellCommand('npm run build');
    expect(result.hasForbiddenChaining).toBe(false);
    expect(result.tokens[0].value).toBe('npm');
  });
});
