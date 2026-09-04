// GitHub owner (user/org) names follow the same shape as usernames
// (letters/digits/hyphen). Repo names additionally allow underscore and
// period. Word characters (used for boundary checks) match GitHub's own
// notion of "not glued to another token".
const ownerChars = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-');
const repoChars = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_.');
const wordChars = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_');
const digitChars = new Set('0123456789');

// Characters that end a URL: whitespace and the delimiters commonly used
// to wrap a URL in prose, matching the same boundary rule textconvert's
// own extractUrls uses.
const urlBoundaryChars = new Set([...' \t\n\r\f\v<>"\'()[]{}']);

export interface IssueReference {
  /** The full matched text, e.g. '#123', 'owner/repo#123', or the URL. */
  raw: string;
  /** null means "this repo" (a bare #123, or an owner/repo#123 that failed to parse a repo). */
  owner: string | null;
  repo: string | null;
  number: number;
}

/**
 * If `text` immediately before `hashIndex` (the position of a `#`) is
 * shaped like a clean two-segment `owner/repo`, returns it; otherwise
 * null. A backward character scan, no regex.
 */
function tryParseQualifiedPrefix(
  text: string,
  hashIndex: number,
): { raw: string; owner: string; repo: string } | null {
  let repoStart = hashIndex;
  while (repoStart > 0 && repoChars.has(text[repoStart - 1])) repoStart--;
  if (repoStart === hashIndex) return null;
  if (repoStart === 0 || text[repoStart - 1] !== '/') return null;

  const slashIndex = repoStart - 1;
  let ownerStart = slashIndex;
  while (ownerStart > 0 && ownerChars.has(text[ownerStart - 1])) ownerStart--;
  if (ownerStart === slashIndex) return null;

  // Reject a third path segment (e.g. 'foo/bar/baz#1') -- if another '/'
  // or owner-shaped character immediately precedes the owner run, this
  // isn't a clean two-segment owner/repo pair.
  const before = ownerStart > 0 ? text[ownerStart - 1] : undefined;
  if (before !== undefined && (ownerChars.has(before) || before === '/')) return null;

  return {
    raw: text.slice(ownerStart, hashIndex),
    owner: text.slice(ownerStart, slashIndex),
    repo: text.slice(repoStart, hashIndex),
  };
}

/**
 * Finds shorthand issue/PR references: bare `#123` and the qualified
 * `owner/repo#123` form. Not built on `extractHashtags` -- that function's
 * own boundary rule (reject `#` immediately preceded by a word character,
 * to correctly exclude `C#`) is exactly what a qualified reference like
 * `owner/repo#123` needs to *allow* (the repo name is a word-character
 * run right before `#`), so the two boundary rules are fundamentally
 * incompatible and this needs its own scan.
 *
 * A bare `#123` still applies that same "not glued to a word character"
 * rule (matching GitHub's own auto-linking behavior, which doesn't treat
 * `baz#1` as a reference either); a qualified `owner/repo#123` is checked
 * for its own two-segment shape instead.
 */
export function findShorthandReferences(text: string): IssueReference[] {
  const references: IssueReference[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '#') continue;

    let end = i + 1;
    while (end < text.length && digitChars.has(text[end])) end++;

    // Must have at least one digit, and not be immediately followed by
    // more word characters (so '#123abc' isn't mistaken for issue 123).
    if (end === i + 1 || (end < text.length && wordChars.has(text[end]))) continue;

    const number = Number(text.slice(i + 1, end));
    const qualified = tryParseQualifiedPrefix(text, i);

    if (qualified) {
      references.push({
        raw: qualified.raw + text.slice(i, end),
        owner: qualified.owner,
        repo: qualified.repo,
        number,
      });
    } else if (i === 0 || !wordChars.has(text[i - 1])) {
      references.push({ raw: text.slice(i, end), owner: null, repo: null, number });
    }

    i = end - 1;
  }

  return references;
}

const GITHUB_PREFIX = 'https://github.com/';
const urlPattern = /^([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)$/;

/**
 * Finds full-URL issue/PR references, e.g.
 * `https://github.com/owner/repo/issues/123` or `.../pull/123`.
 */
export function findUrlReferences(text: string): IssueReference[] {
  const references: IssueReference[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const start = text.indexOf(GITHUB_PREFIX, searchFrom);
    if (start === -1) break;

    let end = start;
    while (end < text.length && !urlBoundaryChars.has(text[end])) end++;

    const path = text.slice(start + GITHUB_PREFIX.length, end);
    const match = urlPattern.exec(path);

    if (match) {
      const [, owner, repo, , numberStr] = match;
      references.push({ raw: text.slice(start, end), owner, repo, number: Number(numberStr) });
    }

    searchFrom = end > start ? end : start + 1;
  }

  return references;
}

/** Finds every issue/PR reference in text, in all three supported forms. */
export function findIssueReferences(text: string): IssueReference[] {
  return [...findShorthandReferences(text), ...findUrlReferences(text)];
}
