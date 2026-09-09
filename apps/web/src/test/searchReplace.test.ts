import { describe, it, expect } from 'vitest';
import { parseSearchReplaceBlocks, applySearchReplace } from '../features/chat/utils/searchReplace';

describe('searchReplace', () => {
  it('parses single search replace block', () => {
    const text = `Here is the fix:
<<<<<<< SEARCH
const rocketSize = 50;
=======
const rocketSize = 20;
>>>>>>>
Hope that helps!`;

    const blocks = parseSearchReplaceBlocks(text);
    expect(blocks.length).toBe(1);
    expect(blocks[0].search.trim()).toBe('const rocketSize = 50;');
    expect(blocks[0].replace.trim()).toBe('const rocketSize = 20;');
    expect(blocks[0].isComplete).toBe(true);
  });

  it('applies search replace in-place', () => {
    const baseCode = `function init() {
  const planetDistance = 100;
  const rocketSize = 50;
  console.log("ready");
}`;

    const stream = `I fixed the rocket size and planet distance:
<<<<<<< SEARCH
  const planetDistance = 100;
  const rocketSize = 50;
=======
  const planetDistance = 400;
  const rocketSize = 15;
>>>>>>>`;

    const { updatedCode, appliedCount } = applySearchReplace(baseCode, stream);
    expect(appliedCount).toBe(1);
    expect(updatedCode).toContain('const planetDistance = 400;');
    expect(updatedCode).toContain('const rocketSize = 15;');
    expect(updatedCode).toContain('console.log("ready");');
    expect(updatedCode).toContain('function init() {');
  });

  it('applies multiple search replace blocks', () => {
    const baseCode = `// Top
let a = 1;
// Middle
let b = 2;
// Bottom
let c = 3;`;

    const stream = `Applying fixes:
<<<<<<< SEARCH
let a = 1;
=======
let a = 10;
>>>>>>>

And also:
<<<<<<< SEARCH
let c = 3;
=======
let c = 30;
>>>>>>>`;

    const { updatedCode, appliedCount } = applySearchReplace(baseCode, stream);
    expect(appliedCount).toBe(2);
    expect(updatedCode).toContain('let a = 10;');
    expect(updatedCode).toContain('let b = 2;');
    expect(updatedCode).toContain('let c = 30;');
  });

  it('tracks active edit line and range during live in-progress streaming', () => {
    const baseCode = `line 1
line 2
line 3
target line 4
line 5
line 6`;

    // Stream is in the middle of typing replacement without >>>>>>> yet
    const partialStream = `<<<<<<< SEARCH
target line 4
=======
new streamed line 4`;

    const result = applySearchReplace(baseCode, partialStream);
    expect(result.appliedCount).toBe(1);
    expect(result.updatedCode).toContain('new streamed line 4');
    expect(result.activeEditLine).toBe(4);
    expect(result.activeEditRange?.startLine).toBe(4);
    expect(result.isStreamingEdit).toBe(true);
  });
});
