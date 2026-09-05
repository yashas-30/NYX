import { describe, it, expect } from 'vitest';
import {
  BuiltinTools,
  TemplatedSystemInstructions,
  CustomSystemInstructions,
  resolveSystemInstructions,
  Image,
  Document,
} from '../core/agents/antigravity/types';
import { policy, HookRunner } from '../core/agents/antigravity/policies';
import { ChatResponse } from '../core/agents/antigravity/conversation';
import { TOOL_REGISTRY } from '../infrastructure/services/toolSystem';

describe('Google Antigravity SDK - BuiltinTools', () => {
  it('exports all official Antigravity tools in all()', () => {
    const allTools = BuiltinTools.all();
    expect(allTools).toContain(BuiltinTools.LIST_DIR);
    expect(allTools).toContain(BuiltinTools.SEARCH_DIR);
    expect(allTools).toContain(BuiltinTools.FIND_FILE);
    expect(allTools).toContain(BuiltinTools.VIEW_FILE);
    expect(allTools).toContain(BuiltinTools.CREATE_FILE);
    expect(allTools).toContain(BuiltinTools.EDIT_FILE);
    expect(allTools).toContain(BuiltinTools.RUN_COMMAND);
    expect(allTools).toContain(BuiltinTools.ASK_QUESTION);
    expect(allTools).toContain(BuiltinTools.START_SUBAGENT);
    expect(allTools).toContain(BuiltinTools.GENERATE_IMAGE);
    expect(allTools).toContain(BuiltinTools.SEARCH_WEB);
    expect(allTools).toContain(BuiltinTools.READ_URL_CONTENT);
    expect(allTools).toContain(BuiltinTools.FINISH);
  });

  it('filters out modifying tools in read_only()', () => {
    const roTools = BuiltinTools.read_only();
    expect(roTools).toContain(BuiltinTools.VIEW_FILE);
    expect(roTools).toContain(BuiltinTools.LIST_DIR);
    expect(roTools).toContain(BuiltinTools.SEARCH_WEB);
    expect(roTools).not.toContain(BuiltinTools.CREATE_FILE);
    expect(roTools).not.toContain(BuiltinTools.EDIT_FILE);
    expect(roTools).not.toContain(BuiltinTools.RUN_COMMAND);
  });
});

describe('Google Antigravity SDK - System Instructions', () => {
  it('resolves raw string system instructions', () => {
    expect(resolveSystemInstructions('You are a test bot.')).toBe('You are a test bot.');
    expect(resolveSystemInstructions(undefined)).toBeUndefined();
  });

  it('formats TemplatedSystemInstructions cleanly', () => {
    const templated = new TemplatedSystemInstructions('You are an expert researcher.', [
      { title: 'Core Directives', content: 'Always cite primary sources.' },
      { title: 'Tone', content: 'Concise, academic, direct.' },
    ]);

    const resolved = resolveSystemInstructions(templated);
    expect(resolved).toContain('You are an expert researcher.');
    expect(resolved).toContain('### Core Directives\nAlways cite primary sources.');
    expect(resolved).toContain('### Tone\nConcise, academic, direct.');
  });

  it('formats CustomSystemInstructions correctly', () => {
    const custom = new CustomSystemInstructions('Custom prompt guidelines.');
    expect(resolveSystemInstructions(custom)).toBe('Custom prompt guidelines.');
  });
});

describe('Google Antigravity SDK - Policies & Enforcement', () => {
  it('allows tools when matching allow policy', async () => {
    const runner = new HookRunner([policy.allow('view_file'), policy.deny('*')]);
    const allowed = await runner.evaluateToolCall('view_file', {});
    const denied = await runner.evaluateToolCall('run_command', {});

    expect(allowed).toBe(true);
    expect(denied).toBe(false);
  });

  it('enforces safe_defaults by denying write and terminal commands by default', async () => {
    const runner = new HookRunner(policy.safe_defaults());
    expect(await runner.evaluateToolCall('view_file', {})).toBe(true);
    expect(await runner.evaluateToolCall('search_web', {})).toBe(true);
    expect(await runner.evaluateToolCall('write_file', {})).toBe(false);
    expect(await runner.evaluateToolCall('run_command', {})).toBe(false);
  });

  it('enforces capabilities: blocks start_subagent when enable_subagents is false', async () => {
    const runner = new HookRunner([], { enable_subagents: false });
    const isAllowed = await runner.evaluateToolCall('start_subagent', {});
    expect(isAllowed).toBe(false);
  });

  it('enforces capabilities: restricts to enabled_tools if provided', async () => {
    const runner = new HookRunner([], { enabled_tools: ['search_web', 'read_url_content'] });
    expect(await runner.evaluateToolCall('search_web', {})).toBe(true);
    expect(await runner.evaluateToolCall('view_file', {})).toBe(false);
  });
});

describe('Google Antigravity SDK - ChatResponse Stream & Output', () => {
  it('streams tokens and resolves full text', async () => {
    const response = new ChatResponse();
    setTimeout(() => {
      response.pushToken('Hello ');
      response.pushToken('Antigravity!');
      response.finish();
    }, 10);

    const tokens: string[] = [];
    for await (const t of response) {
      tokens.push(t);
    }

    expect(tokens.join('')).toBe('Hello Antigravity!');
    expect(await response.text()).toBe('Hello Antigravity!');
  });

  it('streams thoughts asynchronously via response.thoughts', async () => {
    const response = new ChatResponse();
    setTimeout(() => {
      response.pushThought('Step 1: Planning');
      response.pushThought('Step 2: Execution');
      response.finish();
    }, 10);

    const thoughts: string[] = [];
    for await (const t of response.thoughts) {
      thoughts.push(t);
    }

    expect(thoughts).toEqual(['Step 1: Planning', 'Step 2: Execution']);
  });

  it('extracts structured JSON output via structured_output()', async () => {
    const response = new ChatResponse();
    response.pushToken('```json\n{"status": "success", "count": 42}\n```');
    response.finish();

    const output = await response.structured_output<{ status: string; count: number }>();
    expect(output).toEqual({ status: 'success', count: 42 });
  });

  it('records usage metadata', () => {
    const response = new ChatResponse();
    response.setUsageMetadata({
      total_token_count: 500,
      prompt_token_count: 400,
      candidates_token_count: 100,
    });
    expect(response.usage_metadata?.total_token_count).toBe(500);
    expect(response.usage_metadata?.prompt_token_count).toBe(400);
  });
});

describe('Google Antigravity SDK - Multimodal Attachments', () => {
  it('creates image attachment instance with from_file', () => {
    const img = Image.from_file('/path/to/test.png');
    expect(img.path).toBe('/path/to/test.png');
  });

  it('creates document attachment instance with from_file', () => {
    const doc = Document.from_file('/path/to/spec.pdf');
    expect(doc.path).toBe('/path/to/spec.pdf');
  });
});

describe('Google Antigravity SDK - Tool Registry Registration', () => {
  it('registers start_subagent, read_url_content, ask_question in tool registry', () => {
    const names = TOOL_REGISTRY.map((t) => t.name);
    expect(names).toContain('start_subagent');
    expect(names).toContain('read_url_content');
    expect(names).toContain('ask_question');
    expect(names).toContain('finish');
  });
});
