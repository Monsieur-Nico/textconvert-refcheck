import { describe, expect, it } from 'vitest';
import { findIssueReferences, findShorthandReferences, findUrlReferences } from '../src/references';

describe('#findShorthandReferences', () => {
  it('finds a bare issue reference', () => {
    expect(findShorthandReferences('Closes #123')).toEqual([
      { raw: '#123', owner: null, repo: null, number: 123 },
    ]);
  });

  it('finds a qualified owner/repo reference', () => {
    expect(findShorthandReferences('See octocat/hello-world#42')).toEqual([
      { raw: 'octocat/hello-world#42', owner: 'octocat', repo: 'hello-world', number: 42 },
    ]);
  });

  it('finds multiple references', () => {
    expect(findShorthandReferences('Closes #1, related to #2')).toEqual([
      { raw: '#1', owner: null, repo: null, number: 1 },
      { raw: '#2', owner: null, repo: null, number: 2 },
    ]);
  });

  it('ignores a non-numeric hashtag', () => {
    expect(findShorthandReferences('Tagged #typescript')).toEqual([]);
  });

  it('ignores "C#" (word char immediately before the #)', () => {
    expect(findShorthandReferences('Written in C#')).toEqual([]);
  });

  it('does not match at all for a third path segment (not a clean owner/repo pair, and glued to a word character so not a bare reference either)', () => {
    expect(findShorthandReferences('foo/bar/baz#1')).toEqual([]);
  });

  it('returns an empty array when there are no references', () => {
    expect(findShorthandReferences('no references here')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(findShorthandReferences('')).toEqual([]);
  });
});

describe('#findUrlReferences', () => {
  it('finds an issues URL', () => {
    expect(findUrlReferences('See https://github.com/octocat/hello-world/issues/123')).toEqual([
      {
        raw: 'https://github.com/octocat/hello-world/issues/123',
        owner: 'octocat',
        repo: 'hello-world',
        number: 123,
      },
    ]);
  });

  it('finds a pull URL', () => {
    expect(findUrlReferences('https://github.com/octocat/hello-world/pull/7')).toEqual([
      {
        raw: 'https://github.com/octocat/hello-world/pull/7',
        owner: 'octocat',
        repo: 'hello-world',
        number: 7,
      },
    ]);
  });

  it('ignores an unrelated github.com URL', () => {
    expect(findUrlReferences('https://github.com/octocat/hello-world')).toEqual([]);
  });

  it('returns an empty array when there are no URLs', () => {
    expect(findUrlReferences('no urls here')).toEqual([]);
  });

  it('returns an empty array for empty input', () => {
    expect(findUrlReferences('')).toEqual([]);
  });
});

describe('#findIssueReferences', () => {
  it('combines shorthand and URL references', () => {
    expect(
      findIssueReferences('Closes #1 and https://github.com/octocat/hello-world/issues/2'),
    ).toEqual([
      { raw: '#1', owner: null, repo: null, number: 1 },
      {
        raw: 'https://github.com/octocat/hello-world/issues/2',
        owner: 'octocat',
        repo: 'hello-world',
        number: 2,
      },
    ]);
  });
});
