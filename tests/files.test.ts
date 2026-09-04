import { describe, expect, it } from 'vitest';
import {
  findBlobUrlReferences,
  findFileReferences,
  findRelativeLinkReferences,
} from '../src/files';

describe('#findBlobUrlReferences', () => {
  it('finds a blob URL with no line anchor', () => {
    expect(
      findBlobUrlReferences('See https://github.com/octocat/hello-world/blob/main/src/foo.ts'),
    ).toEqual([
      {
        raw: 'https://github.com/octocat/hello-world/blob/main/src/foo.ts',
        owner: 'octocat',
        repo: 'hello-world',
        ref: 'main',
        path: 'src/foo.ts',
        line: null,
      },
    ]);
  });

  it('finds a blob URL with a single-line anchor', () => {
    expect(
      findBlobUrlReferences('https://github.com/octocat/hello-world/blob/main/src/foo.ts#L10'),
    ).toEqual([
      {
        raw: 'https://github.com/octocat/hello-world/blob/main/src/foo.ts#L10',
        owner: 'octocat',
        repo: 'hello-world',
        ref: 'main',
        path: 'src/foo.ts',
        line: 10,
      },
    ]);
  });

  it('finds a blob URL with a line range anchor, using the start line', () => {
    expect(
      findBlobUrlReferences('https://github.com/octocat/hello-world/blob/main/src/foo.ts#L10-L20'),
    ).toEqual([
      {
        raw: 'https://github.com/octocat/hello-world/blob/main/src/foo.ts#L10-L20',
        owner: 'octocat',
        repo: 'hello-world',
        ref: 'main',
        path: 'src/foo.ts',
        line: 10,
      },
    ]);
  });

  it('finds a nested path', () => {
    expect(
      findBlobUrlReferences(
        'https://github.com/octocat/hello-world/blob/main/src/nested/deep/foo.ts',
      ),
    ).toEqual([expect.objectContaining({ path: 'src/nested/deep/foo.ts' })]);
  });

  it('ignores an unrelated github.com URL', () => {
    expect(findBlobUrlReferences('https://github.com/octocat/hello-world/issues/1')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(findBlobUrlReferences('')).toEqual([]);
  });
});

describe('#findRelativeLinkReferences', () => {
  it('finds a relative markdown link', () => {
    expect(findRelativeLinkReferences('see [here](src/foo.ts) for details')).toEqual([
      {
        raw: '[here](src/foo.ts)',
        owner: null,
        repo: null,
        ref: null,
        path: 'src/foo.ts',
        line: null,
      },
    ]);
  });

  it('finds a relative link with a line anchor', () => {
    expect(findRelativeLinkReferences('[here](src/foo.ts#L5)')).toEqual([
      {
        raw: '[here](src/foo.ts#L5)',
        owner: null,
        repo: null,
        ref: null,
        path: 'src/foo.ts',
        line: 5,
      },
    ]);
  });

  it('ignores an absolute http(s) link', () => {
    expect(findRelativeLinkReferences('[here](https://example.com/foo)')).toEqual([]);
  });

  it('ignores an anchor-only link', () => {
    expect(findRelativeLinkReferences('[jump](#section)')).toEqual([]);
  });

  it('ignores a mailto link', () => {
    expect(findRelativeLinkReferences('[email](mailto:jordan@example.com)')).toEqual([]);
  });

  it('ignores a reference-style link (no immediate parenthesized target)', () => {
    expect(findRelativeLinkReferences('[here][ref]')).toEqual([]);
  });

  it('finds multiple relative links', () => {
    expect(findRelativeLinkReferences('[a](src/a.ts) and [b](src/b.ts)')).toEqual([
      { raw: '[a](src/a.ts)', owner: null, repo: null, ref: null, path: 'src/a.ts', line: null },
      { raw: '[b](src/b.ts)', owner: null, repo: null, ref: null, path: 'src/b.ts', line: null },
    ]);
  });

  it('returns an empty array when there are no links', () => {
    expect(findRelativeLinkReferences('no links here')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(findRelativeLinkReferences('')).toEqual([]);
  });
});

describe('#findFileReferences', () => {
  it('combines blob URL and relative link references', () => {
    expect(
      findFileReferences(
        '[here](src/a.ts) and https://github.com/octocat/hello-world/blob/main/src/b.ts',
      ),
    ).toEqual([
      expect.objectContaining({ path: 'src/b.ts' }),
      expect.objectContaining({ path: 'src/a.ts' }),
    ]);
  });
});
