import { findFileReferences } from './files';
import {
  getCollaboratorLogins,
  getFileLineCount,
  getRepoTreePaths,
  issueExists,
  type Octokit,
  type RepoContext,
} from './github';
import { findIssueReferences } from './references';
import { findMentionCandidates, isBotMention } from './mentions';

export interface Violation {
  type: 'mention' | 'issue-reference' | 'file-reference';
  raw: string;
  reason: string;
}

function isSameRepo(ctx: RepoContext, owner: string | null, repo: string | null): boolean {
  const resolvedOwner = (owner ?? ctx.owner).toLowerCase();
  const resolvedRepo = (repo ?? ctx.repo).toLowerCase();
  return resolvedOwner === ctx.owner.toLowerCase() && resolvedRepo === ctx.repo.toLowerCase();
}

// A hard cap on how many candidates of each type get validated per run,
// applied after de-duplicating identical ones. For issue/PR and file
// references this bounds the number of sequential GitHub API calls a
// single run makes -- without it, a body crafted with many distinct fake
// references (e.g. thousands of unique #1, #2, #3, ... numbers) would
// force one API call per reference, a real resource-exhaustion / rate-
// limit-abuse vector against the repository's own automation, not just a
// theoretical concern. For mentions (no per-item API cost) it instead
// bounds the comment body's size, which GitHub itself caps at 65536
// characters. 50 is far more than any real PR/issue body needs.
const MAX_CHECKS_PER_BODY = 50;

function dedupeBy<T>(items: T[], keyOf: (item: T) => string): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const key = keyOf(item);
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return result;
}

async function validateMentions(
  octokit: Octokit,
  ctx: RepoContext,
  body: string,
): Promise<Violation[]> {
  const mentions = dedupeBy(
    findMentionCandidates(body).filter((mention) => !isBotMention(mention)),
    (mention) => mention.toLowerCase(),
  ).slice(0, MAX_CHECKS_PER_BODY);
  if (mentions.length === 0) return [];

  const collaborators = await getCollaboratorLogins(octokit, ctx);

  return mentions
    .filter((mention) => !collaborators.has(mention.slice(1).toLowerCase()))
    .map((mention) => ({
      type: 'mention' as const,
      raw: mention,
      reason: `${mention} does not match a collaborator on this repository.`,
    }));
}

async function validateIssueReferences(
  octokit: Octokit,
  ctx: RepoContext,
  body: string,
): Promise<Violation[]> {
  const violations: Violation[] = [];

  // v1 scope (per #362): only same-repo references are validated. A
  // reference to a different repo is left alone -- validating it would
  // need API access to a repo that might be private or outside this
  // Action's token permissions.
  const sameRepoRefs = dedupeBy(
    findIssueReferences(body).filter((ref) => isSameRepo(ctx, ref.owner, ref.repo)),
    (ref) => String(ref.number),
  ).slice(0, MAX_CHECKS_PER_BODY);

  for (const ref of sameRepoRefs) {
    const exists = await issueExists(octokit, ctx.owner, ctx.repo, ref.number);
    if (!exists) {
      violations.push({
        type: 'issue-reference',
        raw: ref.raw,
        reason: `${ref.raw} does not refer to an existing issue or pull request in this repository.`,
      });
    }
  }

  return violations;
}

async function validateFileReferences(
  octokit: Octokit,
  ctx: RepoContext,
  body: string,
): Promise<Violation[]> {
  // No PR head SHA to check against (e.g. this run is on a plain issue,
  // not a pull request) -- nothing to validate file references against.
  if (!ctx.headSha) return [];

  const violations: Violation[] = [];
  const sameRepoRefs = dedupeBy(
    findFileReferences(body).filter((ref) => isSameRepo(ctx, ref.owner, ref.repo)),
    (ref) => `${ref.path}#${ref.line ?? ''}`,
  ).slice(0, MAX_CHECKS_PER_BODY);
  if (sameRepoRefs.length === 0) return [];

  const treePaths = await getRepoTreePaths(octokit, ctx.owner, ctx.repo, ctx.headSha);

  for (const ref of sameRepoRefs) {
    if (!treePaths.has(ref.path)) {
      violations.push({
        type: 'file-reference',
        raw: ref.raw,
        reason: `${ref.raw} does not refer to a file that exists on this PR's branch.`,
      });
      continue;
    }

    if (ref.line === null) continue;

    const lineCount = await getFileLineCount(octokit, ctx.owner, ctx.repo, ctx.headSha, ref.path);
    if (lineCount !== null && ref.line > lineCount) {
      violations.push({
        type: 'file-reference',
        raw: ref.raw,
        reason: `${ref.raw} references line ${ref.line}, but the file only has ${lineCount} lines.`,
      });
    }
  }

  return violations;
}

/**
 * Validates every @mention, issue/PR reference, and file/line reference in
 * `body` against the real repository, returning the ones that don't
 * resolve to something real.
 */
export async function validateBody(
  octokit: Octokit,
  ctx: RepoContext,
  body: string,
): Promise<Violation[]> {
  const [mentionViolations, issueViolations, fileViolations] = await Promise.all([
    validateMentions(octokit, ctx, body),
    validateIssueReferences(octokit, ctx, body),
    validateFileReferences(octokit, ctx, body),
  ]);

  return [...mentionViolations, ...issueViolations, ...fileViolations];
}
