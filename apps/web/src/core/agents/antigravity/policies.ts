/**
 * @file src/core/agents/antigravity/policies.ts
 * @description Declarative Policy & Hook execution system for Antigravity SDK.
 */

import { Policy, CapabilitiesConfig } from './types';

export function allow(pattern: string): Policy {
  return { pattern, action: 'allow' };
}

export function deny(pattern: string): Policy {
  return { pattern, action: 'deny' };
}

export function ask_user(
  pattern: string,
  handler?: (toolName: string, args: any) => Promise<boolean>
): Policy {
  return { pattern, action: 'ask_user', handler };
}

export function enforce(policies: Policy[], capabilities?: CapabilitiesConfig): HookRunner {
  return new HookRunner(policies, capabilities);
}

export class HookRunner {
  constructor(
    private policies: Policy[] = [],
    private capabilities?: CapabilitiesConfig
  ) {}

  public async evaluateToolCall(toolName: string, args: any): Promise<boolean> {
    // 1. Evaluate Capabilities
    if (this.capabilities) {
      if (this.capabilities.read_only) {
        if (['write_file', 'create_directory', 'edit_file', 'run_terminal'].includes(toolName)) {
          return false;
        }
      }
      if (this.capabilities.allow_terminal === false && toolName === 'run_terminal') {
        return false;
      }
      if (
        this.capabilities.allow_web === false &&
        ['web_search', 'deep_research'].includes(toolName)
      ) {
        return false;
      }
    }

    // 2. Evaluate Declarative Policies in order
    for (const policy of this.policies) {
      if (this.matchesPattern(toolName, policy.pattern)) {
        if (policy.action === 'deny') return false;
        if (policy.action === 'allow') return true;
        if (policy.action === 'ask_user') {
          if (policy.handler) {
            return await policy.handler(toolName, args);
          }
          return true;
        }
      }
    }

    return true; // Default allow if not matched
  }

  private matchesPattern(name: string, pattern: string): boolean {
    if (pattern === '*') return true;
    if (pattern.endsWith('*')) {
      const prefix = pattern.slice(0, -1);
      return name.startsWith(prefix);
    }
    return name === pattern;
  }
}
