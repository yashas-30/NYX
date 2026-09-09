import { describe, it, expect } from 'vitest';
import { replaceCodeBlockInContent } from '../features/chat/components/ChatMessageList';

describe('replaceCodeBlockInContent', () => {
  it('replaces exact code block inside markdown fences', () => {
    const original = `Here is the requested code:

\`\`\`javascript
const a = 1;
const b = 2;
console.log(a + b);
\`\`\`

Let me know if you need changes.`;

    const oldCode = `const a = 1;\nconst b = 2;\nconsole.log(a + b);`;
    const newCode = `const a = 10;\nconst b = 20;\nconsole.log(a + b);`;

    const result = replaceCodeBlockInContent(original, oldCode, newCode, 'javascript');

    expect(result).toBe(`Here is the requested code:

\`\`\`javascript
const a = 10;
const b = 20;
console.log(a + b);
\`\`\`

Let me know if you need changes.`);
  });

  it('handles code block replacement with trimmed whitespace variations', () => {
    const original = `\`\`\`python
def calculate_sum(x, y):
    return x + y

\`\`\``;

    const oldCode = `def calculate_sum(x, y):\n    return x + y`;
    const newCode = `def calculate_sum(x, y, z=0):\n    return x + y + z`;

    const result = replaceCodeBlockInContent(original, oldCode, newCode, 'python');

    expect(result).toBe(`\`\`\`python
def calculate_sum(x, y, z=0):
    return x + y + z
\`\`\``);
  });

  it('replaces only the matching code block when multiple code blocks exist', () => {
    const original = `First block:
\`\`\`css
body { margin: 0; }
\`\`\`

Second block:
\`\`\`html
<div class="container">Hello</div>
\`\`\`

Third block:
\`\`\`javascript
console.log("done");
\`\`\``;

    const oldHtml = `<div class="container">Hello</div>`;
    const newHtml = `<div class="container text-white">Hello World</div>`;

    const result = replaceCodeBlockInContent(original, oldHtml, newHtml, 'html');

    expect(result).toContain('body { margin: 0; }');
    expect(result).toContain('<div class="container text-white">Hello World</div>');
    expect(result).toContain('console.log("done");');
    expect(result).not.toContain('<div class="container">Hello</div>');
  });

  it('updates the code fence language tag if language changed', () => {
    const original = `\`\`\`js
console.log("test");
\`\`\``;

    const oldCode = `console.log("test");`;
    const newCode = `console.log("test");\nexport {};`;

    const result = replaceCodeBlockInContent(original, oldCode, newCode, 'ts');

    expect(result).toBe(`\`\`\`ts
console.log("test");
export {};
\`\`\``);
  });

  it('falls back to replacing the raw code directly if no matching fence found', () => {
    const original = `Some text without standard fences:
const x = 5;
End of text.`;

    const result = replaceCodeBlockInContent(original, 'const x = 5;', 'const x = 42;');

    expect(result).toBe(`Some text without standard fences:
const x = 42;
End of text.`);
  });
});
