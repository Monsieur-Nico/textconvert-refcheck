import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { getActionVersion } from '../src/version';

describe('#getActionVersion', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'refcheck-version-'));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads the version from package.json at the given path', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ version: '1.5.0' }));
    expect(getActionVersion(dir)).toBe('1.5.0');
  });

  it('returns undefined when actionPath is undefined', () => {
    expect(getActionVersion(undefined)).toBeUndefined();
  });

  it('returns undefined when package.json does not exist', () => {
    expect(getActionVersion(join(dir, 'does-not-exist'))).toBeUndefined();
  });

  it('returns undefined when package.json is malformed', () => {
    writeFileSync(join(dir, 'package.json'), 'not json');
    expect(getActionVersion(dir)).toBeUndefined();
  });

  it('returns undefined when package.json has no version field', () => {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'x' }));
    expect(getActionVersion(dir)).toBeUndefined();
  });
});
