// Characters that end a URL, matching the same boundary rule used
// throughout this project and textconvert's own extractUrls.
const urlBoundaryChars = new Set([...' \t\n\r\f\v<>"\'()[]{}']);

export interface FileReference {
  /** The full matched text, e.g. the markdown link or the blob URL. */
  raw: string;
  /** null means "this repo, this PR's branch" (a relative markdown link). */
  owner: string | null;
  repo: string | null;
  /** null means "whatever branch/ref this PR is on" (a relative markdown link). */
  ref: string | null;
  /** File path, relative to the repo root. */
  path: string;
  /** Line number from a `#L10` (or `#L10-L20`, in which case this is the start) anchor, if present. */
  line: number | null;
}

const GITHUB_PREFIX = 'https://github.com/';
const blobUrlPattern = /^([^/]+)\/([^/]+)\/blob\/([^/]+)\/(.+)$/;
const lineAnchorPattern = /^L(\d+)(-L\d+)?$/;

/**
 * Finds GitHub blob URLs (e.g.
 * `https://github.com/owner/repo/blob/main/src/foo.ts#L10`) referencing a
 * specific file, optionally with a line anchor.
 */
export function findBlobUrlReferences(text: string): FileReference[] {
  const references: FileReference[] = [];
  let searchFrom = 0;

  while (searchFrom < text.length) {
    const start = text.indexOf(GITHUB_PREFIX, searchFrom);
    if (start === -1) break;

    let end = start;
    while (end < text.length && !urlBoundaryChars.has(text[end])) end++;

    const rest = text.slice(start + GITHUB_PREFIX.length, end);
    const [pathPart, fragment] = splitFragment(rest);
    const match = blobUrlPattern.exec(pathPart);

    if (match) {
      const [, owner, repo, ref, path] = match;
      references.push({
        raw: text.slice(start, end),
        owner,
        repo,
        ref,
        path,
        line: parseLineAnchor(fragment),
      });
    }

    searchFrom = end > start ? end : start + 1;
  }

  return references;
}

function splitFragment(value: string): [string, string | undefined] {
  const hashIndex = value.indexOf('#');
  if (hashIndex === -1) return [value, undefined];
  return [value.slice(0, hashIndex), value.slice(hashIndex + 1)];
}

function parseLineAnchor(fragment: string | undefined): number | null {
  if (!fragment) return null;
  const match = lineAnchorPattern.exec(fragment);
  if (!match) return null;
  return Number(match[1]);
}

// Characters that can't appear inside a markdown link's `(...)` target,
// matching CommonMark's own rule for an unbracketed link destination.
const markdownLinkBoundaryChars = new Set([...' \t\n()<>']);

/**
 * Finds relative markdown links (`[text](path/to/file.ts)`) that look like
 * a same-repo file reference -- not an absolute URL (`http://...`), not an
 * anchor-only link (`#section`), and not a mailto: link.
 */
export function findRelativeLinkReferences(text: string): FileReference[] {
  const references: FileReference[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '[') continue;

    const closeBracket = text.indexOf(']', i);
    if (closeBracket === -1) continue;
    if (text[closeBracket + 1] !== '(') {
      continue;
    }

    const openParen = closeBracket + 1;
    let end = openParen + 1;
    while (end < text.length && !markdownLinkBoundaryChars.has(text[end])) end++;
    if (text[end] !== ')') continue;

    const target = text.slice(openParen + 1, end);

    if (isRelativeFileTarget(target)) {
      const [pathPart, fragment] = splitFragment(target);
      references.push({
        raw: text.slice(i, end + 1),
        owner: null,
        repo: null,
        ref: null,
        path: pathPart,
        line: parseLineAnchor(fragment),
      });
    }

    i = end;
  }

  return references;
}

function isRelativeFileTarget(target: string): boolean {
  if (!target) return false;
  if (target.startsWith('#')) return false;
  if (target.includes('://')) return false;
  if (target.startsWith('mailto:')) return false;
  return true;
}

/** Finds every file/line reference in text, in both supported forms. */
export function findFileReferences(text: string): FileReference[] {
  return [...findBlobUrlReferences(text), ...findRelativeLinkReferences(text)];
}
