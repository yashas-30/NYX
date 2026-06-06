export class OutputSafetyScanner {
  private SECRET_PATTERNS = [
    /AKIA[0-9A-Z]{16}/, // AWS Access Key
    /sk-[a-zA-Z0-9]{48}/, // OpenAI/Anthropic Key
    /(-----BEGIN PRIVATE KEY-----|-----BEGIN RSA PRIVATE KEY-----)/
  ];

  private DANGEROUS_CODE_PATTERNS = [
    /eval\s*\(/,
    /child_process\.exec\s*\(/,
    /fs\.unlinkSync\s*\(\s*['"]\/['"]\s*\)/
  ];

  public scan(output: string): { safe: boolean; issues: string[] } {
    const issues: string[] = [];
    
    this.SECRET_PATTERNS.forEach(pattern => {
      if (pattern.test(output)) {
        issues.push('Hardcoded secret or private key detected in output');
      }
    });

    this.DANGEROUS_CODE_PATTERNS.forEach(pattern => {
      if (pattern.test(output)) {
        issues.push('Potentially dangerous unsandboxed code execution detected');
      }
    });

    return {
      safe: issues.length === 0,
      issues
    };
  }
}
