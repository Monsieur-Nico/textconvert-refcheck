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

async function validateMentions(
  octokit: Octokit,
  ctx: RepoContext,
  body: string,
): Promise<Violation[]> {
  const mentions = findMentionCandidates(body).filter((mention) => !isBotMention(mention));
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
  const sameRepoRefs = findIssueReferences(body).filter((ref) =>
    isSameRepo(ctx, ref.owner, ref.repo),
  );

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
  const sameRepoRefs = findFileReferences(body).filter((ref) =>
    isSameRepo(ctx, ref.owner, ref.repo),
  );
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
