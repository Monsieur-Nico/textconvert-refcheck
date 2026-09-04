import { describe, expect, it } from 'vitest';
import { maskCode } from '../src/markdown';

describe('#maskCode', () => {
  it('blanks an inline code span', () => {
    const input = 'cc `@dependabot rebase` please';
    const codeSpan = '`@dependabot rebase`';
    const expected = input.replace(codeSpan, ' '.repeat(codeSpan.length));
    expect(maskCode(input)).toBe(expected);
    expect(maskCode(input)).not.toContain('@dependabot');
  });

  it('blanks a fenced code block', () => {
    const input = 'before\n```js\nconst x = 1;\n```\nafter';
    const result = maskCode(input);
    expect(result).not.toContain('const x = 1;');
    expect(result).toContain('before');
    expect(result).toContain('after');
  });

  it('preserves overall length and newlines', () => {
    const input = 'before\n`code`\nafter';
    const result = maskCode(input);
    expect(result.length).toBe(input.length);
    expect(result.split('\n').length).toBe(input.split('\n').length);
  });

  it('handles a double-backtick span containing a literal single backtick', () => {
    // CommonMark rule: an N-backtick span closes at the next run of
    // exactly N backticks, so a lone backtick inside a `` `` `` span
    // doesn't end it early.
    const input = 'see `` `@notreal` `` here';
    const result = maskCode(input);
    expect(result).not.toContain('@notreal');
    expect(result).toContain('see');
    expect(result).toContain('here');
  });

  it('leaves text with no code spans unchanged in content', () => {
    expect(maskCode('no code here')).toBe('no code here');
  });

  it('does not hang on an unterminated code span', () => {
    const input = 'before `unterminated code with no closing backtick';
    expect(() => maskCode(input)).not.toThrow();
  });

  it('returns an empty string for empty input', () => {
    expect(maskCode('')).toBe('');
  });
});
