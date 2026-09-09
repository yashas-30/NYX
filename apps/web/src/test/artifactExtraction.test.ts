import { describe, it, expect } from 'vitest';
import { extractArtifactTitle } from '../features/chat/components/ChatMessageList';

describe('extractArtifactTitle', () => {
  it('extracts title from HTML <title> tag', () => {
    const code = `<!DOCTYPE html><html><head><title>Scientific Calculator</title></head><body></body></html>`;
    expect(extractArtifactTitle(code, 'html', 'write a calculator in html')).toBe(
      'Scientific Calculator'
    );
  });

  it('ignores generic <title> and extracts requested name from user prompt', () => {
    const code = `<!DOCTYPE html><html><head><title>Document</title></head><body></body></html>`;
    expect(extractArtifactTitle(code, 'html', 'write an html code for a calculator')).toBe(
      'Calculator'
    );
  });

  it('extracts name from prompt with creation verbs and extra phrasing', () => {
    expect(
      extractArtifactTitle(
        'console.log(1);',
        'js',
        'can you please create a snake game in javascript please'
      )
    ).toBe('Snake Game');
    expect(
      extractArtifactTitle('<div></div>', 'tsx', 'build a pomodoro timer with sound effects')
    ).toBe('Pomodoro Timer');
    expect(
      extractArtifactTitle('select * from users;', 'sql', 'write a query for monthly active users')
    ).toBe('Monthly Active Users');
  });

  it('extracts title from Slidev frontmatter', () => {
    const code = `---\ntitle: "Q3 Strategy Review"\nlayout: cover\n---\n# Slide 1`;
    expect(extractArtifactTitle(code, 'slidev')).toBe('Q3 Strategy Review');
  });

  it('extracts title from first line comment if no prompt provided', () => {
    const code = `// Weather Forecast App\nconst apiKey = "123";`;
    expect(extractArtifactTitle(code, 'js')).toBe('Weather Forecast App');
  });

  it('falls back intelligently without generic "Web Application"', () => {
    expect(extractArtifactTitle('const x = 1;', 'html')).toBe('HTML Application');
    expect(extractArtifactTitle('const x = 1;', 'tsx')).toBe('React Component');
    expect(extractArtifactTitle('def foo(): pass', 'python')).toBe('Python Script');
  });
});

import { extractLatestCodeBlock } from '../features/chat/components/ChatPage';

describe('extractLatestCodeBlock (Streaming Code Extraction)', () => {
  it('extracts actively streaming unclosed code block', () => {
    const streamContent =
      'Here is the implementation:\n```typescript\nfunction calculateTotal(items: number[]) {\n  return items.reduce((a, b) => a + b, 0);';
    const result = extractLatestCodeBlock(streamContent);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('typescript');
    expect(result?.code).toBe(
      'function calculateTotal(items: number[]) {\n  return items.reduce((a, b) => a + b, 0);'
    );
    expect(result?.isClosed).toBe(false);
  });

  it('extracts code block with colon filename while streaming', () => {
    const streamContent =
      'Here is the file:\n```tsx:components/Button.tsx\nexport const Button = () => <button>Click</button>;';
    const result = extractLatestCodeBlock(streamContent);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('tsx');
    expect(result?.filename).toBe('components/Button.tsx');
    expect(result?.isClosed).toBe(false);
  });

  it('detects closed code block correctly', () => {
    const completedContent =
      'Done:\n```python\ndef hello():\n    print("world")\n```\nLet me know if you need more!';
    const result = extractLatestCodeBlock(completedContent);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('python');
    expect(result?.code.trim()).toBe('def hello():\n    print("world")');
    expect(result?.isClosed).toBe(true);
  });

  it('picks the latest code block when multiple blocks exist', () => {
    const content =
      'First block:\n```json\n{"status": "ok"}\n```\nSecond block:\n```rust\nfn main() {\n    println!("hello");\n}';
    const result = extractLatestCodeBlock(content);
    expect(result).not.toBeNull();
    expect(result?.language).toBe('rust');
    expect(result?.isClosed).toBe(false);
  });
});
