// Characters allowed in a GitHub username: letters, digits, and hyphen.
// Deliberately not textconvert's extractMentions -- that matches Twitter/
// Instagram's mention convention (letters/digits/underscore, no hyphen),
// but GitHub usernames legitimately contain hyphens (e.g. `github-actions`),
// which extractMentions would silently truncate at.
const usernameChars = new Set('abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-');

const BOT_SUFFIX = '[bot]';

/**
 * Whether `candidate` (the text after `@`, no brackets) is shaped like a
 * real GitHub username: 1-39 characters, no leading/trailing hyphen, no
 * consecutive hyphens.
 */
function isValidUsernameShape(candidate: string): boolean {
  if (candidate.length === 0 || candidate.length > 39) return false;
  if (candidate.startsWith('-') || candidate.endsWith('-')) return false;
  if (candidate.includes('--')) return false;
  return true;
}

/**
 * Finds `@mention`-shaped candidates in text: `@` followed by a
 * validly-shaped GitHub username, only starting when the `@` isn't itself
 * preceded by a username character (so an email address's `@` is never
 * mistaken for a mention). Also recognizes the literal `[bot]` suffix
 * GitHub App accounts carry in their real login (e.g. `github-actions[bot]`),
 * which isn't part of the normal username character set.
 *
 * A single linear pass over the text, no regex backtracking risk -- this
 * runs against attacker-controlled PR/issue body text.
 */
export function findMentionCandidates(text: string): string[] {
  const candidates: string[] = [];

  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '@') continue;
    if (i > 0 && usernameChars.has(text[i - 1])) continue;

    let end = i + 1;
    while (end < text.length && usernameChars.has(text[end])) end++;

    const body = text.slice(i + 1, end);
    if (!isValidUsernameShape(body)) {
      i = end - 1;
      continue;
    }

    // `@owner/team` is GitHub's own syntax for mentioning a *team*, not a
    // user -- a fundamentally different reference this action doesn't
    // validate (it checks individual collaborators, not team membership).
    // The same shape is also just how npm scoped package names look
    // (`@vercel/ncc`, `@actions/core`), which show up constantly in this
    // kind of PR body. Either way, treating the text before the `/` as a
    // lone user mention is wrong, so skip it entirely rather than flag an
    // org/scope name for not being a real user.
    if (text[end] === '/') {
      i = end - 1;
      continue;
    }

    let matchEnd = end;
    if (text.slice(end, end + BOT_SUFFIX.length) === BOT_SUFFIX) {
      matchEnd = end + BOT_SUFFIX.length;
    }

    candidates.push(text.slice(i, matchEnd));
    i = matchEnd - 1;
  }

  return candidates;
}

/** Whether `mention` (including its leading `@`) refers to a GitHub App/bot account. */
export function isBotMention(mention: string): boolean {
  return mention.endsWith(BOT_SUFFIX);
}
