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
