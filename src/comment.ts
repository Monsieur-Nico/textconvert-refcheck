import type { Octokit, RepoContext } from './github';
import type { Violation } from './validate';

// Hidden marker used to find this Action's own comment on a later run, so
// it's updated in place instead of posting a new comment on every push.
export const COMMENT_MARKER = '<!-- textconvert-refcheck -->';

const VIOLATION_LABELS: Record<Violation['type'], string> = {
  mention: '@mention',
  'issue-reference': 'issue/PR reference',
  'file-reference': 'file/line reference',
};

/** Formats the summary comment body for a set of violations (empty = all clear). */
export function formatComment(violations: Violation[]): string {
  if (violations.length === 0) {
    return `${COMMENT_MARKER}\n✅ **textconvert refcheck** — no dangling references found.`;
  }

  const lines = violations.map(
    (v) => `- **${VIOLATION_LABELS[v.type]}** \`${v.raw}\` — ${v.reason}`,
  );

  return [
    COMMENT_MARKER,
    '### ⚠️ textconvert refcheck found dangling references',
    '',
    ...lines,
  ].join('\n');
}

interface CommentLike {
  id: number;
  body?: string;
}

/**
 * Posts `body` as a comment on the PR/issue, updating this Action's own
 * previous comment (found via {@link COMMENT_MARKER}) in place if one
 * exists, rather than posting a new comment on every run.
 */
export async function upsertComment(
  octokit: Octokit,
  ctx: RepoContext,
  body: string,
): Promise<void> {
  const comments: CommentLike[] = await octokit.paginate(octokit.rest.issues.listComments, {
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.number,
    per_page: 100,
  });

  const existing = comments.find((comment) => comment.body?.includes(COMMENT_MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner: ctx.owner,
      repo: ctx.repo,
      comment_id: existing.id,
      body,
    });
    return;
  }

  await octokit.rest.issues.createComment({
    owner: ctx.owner,
    repo: ctx.repo,
    issue_number: ctx.number,
    body,
  });
}
