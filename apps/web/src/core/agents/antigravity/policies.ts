/**
 * @file src/core/agents/antigravity/policies.ts
 * @description Declarative Policy & Hook execution system for Antigravity SDK.
 */

import { Policy, CapabilitiesConfig, BuiltinTools } from './types';

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

/**
 * safe_defaults allows read-only tools and asks user for write operations
 * (file creation, editing, or shell command execution) per the Antigravity SDK specification.
 */
export function safe_defaults(
  handler?: (toolName: string, args: any) => Promise<boolean>
): Policy[] {
  return [
    allow('view_file'),
    allow('read_file'),
    allow('list_directory'),
    allow('search_directory'),
    allow('find_file'),
    allow('search_web'),
    allow('web_search'),
    allow('read_url_content'),
    allow('finish'),
    allow('ask_question'),
    ask_user('create_file', handler),
    ask_user('write_file', handler),
    ask_user('edit_file', handler),
    ask_user('run_command', handler),
    ask_user('run_terminal', handler),
    ask_user('execute_code', handler),
  ];
}

export const policy = {
  allow,
  deny,
  ask_user,
  safe_defaults,
};

export function enforce(policies: Policy[], capabilities?: CapabilitiesConfig): HookRunner {
  return new HookRunner(policies, capabilities);
}

export class HookRunner {
  constructor(
    private policies: Policy[] = [],
    private capabilities?: CapabilitiesConfig
  ) {}

  public async evaluateToolCall(toolName: string, args: any): Promise<boolean> {
    const normName = toolName
      .replace(/^default_api:/i, '')
      .replace(/^antigravity:/i, '')
      .replace(/^gemini:/i, '')
      .trim();

    // 1. Evaluate Capabilities Restrictions
    if (this.capabilities) {
      if (this.capabilities.enabled_tools && this.capabilities.enabled_tools.length > 0) {
        const isEnabled = this.capabilities.enabled_tools.some((t) =>
          this.matchesPattern(normName, t)
        );
        if (!isEnabled) return false;
      }

      if (this.capabilities.disabled_tools && this.capabilities.disabled_tools.length > 0) {
        const isDisabled = this.capabilities.disabled_tools.some((t) =>
          this.matchesPattern(normName, t)
        );
        if (isDisabled) return false;
      }

      if (this.capabilities.read_only) {
        if (
          [
            'write_file',
            'create_file',
            'create_directory',
            'edit_file',
            'run_terminal',
            'run_command',
          ].includes(normName)
        ) {
          return false;
        }
      }

      if (
        this.capabilities.allow_terminal === false &&
        ['run_terminal', 'run_command'].includes(normName)
      ) {
        return false;
      }

      if (
        this.capabilities.allow_web === false &&
        ['web_search', 'search_web', 'read_url_content', 'deep_research'].includes(normName)
      ) {
        return false;
      }

      if (this.capabilities.enable_subagents === false && normName === 'start_subagent') {
        return false;
      }
    }

    // 2. Evaluate Declarative Policies in order
    for (const policy of this.policies) {
      if (this.matchesPattern(normName, policy.pattern)) {
        if (policy.action === 'deny') return false;
        if (policy.action === 'allow') return true;
        if (policy.action === 'ask_user') {
          if (policy.handler) {
            return await policy.handler(normName, args);
          }
          return false;
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
