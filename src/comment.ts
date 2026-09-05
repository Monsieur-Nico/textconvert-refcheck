import type { Octokit, RepoContext } from './github';
import type { Violation } from './validate';

// Hidden marker used to find this Action's own comment on a later run, so
// it's updated in place instead of posting a new comment on every push.
export const COMMENT_MARKER = '<!-- textconvert-refcheck -->';

const MARKETPLACE_URL = 'https://github.com/marketplace/actions/textconvert-refcheck';
const NAME_LINK = `[textconvert refcheck](${MARKETPLACE_URL})`;

const VIOLATION_LABELS: Record<Violation['type'], string> = {
  mention: '@mention',
  'issue-reference': 'issue/PR reference',
  'file-reference': 'file/line reference',
};

// Violation.raw/reason are built from attacker-controlled PR/issue body
// text -- some parsers (URL-form references, in particular) allow
// characters other than the ones a real username/path/issue-number would
// ever contain. Without this, a crafted value containing a backtick could
// break out of the `${v.raw}` code span below and inject live markdown
// into a comment this Action posts with its own credibility (not script
// execution -- GitHub sanitizes real HTML in comments -- but real content
// spoofing, e.g. fake bold text or a misleading link dressed up to look
// like part of the bot's own trusted output).
//
// Backticks are stripped outright rather than escaped: escaping a
// backtick doesn't reliably neutralize it *inside* a span already
// delimited by backticks, and none of this Action's valid extraction
// results ever legitimately contain one, so nothing real is lost.
// Everything else CommonMark treats as inline-formatting syntax is
// backslash-escaped, since a value used in `reason` isn't inside a code
// span at all and needs its own protection.
function escapeMarkdown(value: string): string {
  return value.replace(/`/g, '').replace(/([*_[\]\\])/g, '\\$1');
}

/** Formats the summary comment body for a set of violations (empty = all clear). */
export function formatComment(violations: Violation[]): string {
  if (violations.length === 0) {
    return `${COMMENT_MARKER}\n✅ **${NAME_LINK}** — no dangling references found.`;
  }

  const lines = violations.map((v) => {
    const raw = escapeMarkdown(v.raw);
    const reason = escapeMarkdown(v.reason);
    return `- **${VIOLATION_LABELS[v.type]}** \`${raw}\` — ${reason}`;
  });

  const body = [COMMENT_MARKER, `### ⚠️ ${NAME_LINK} found dangling references`, '', ...lines];

  if (violations.some((v) => v.type === 'mention')) {
    body.push(
      '',
      "> If a flagged `@mention` is a typo, fix the username. If it's just prose that isn't meant to tag anyone, wrap it in backticks (e.g. `` `@mentions` ``) and this check will leave it alone next time.",
    );
  }

  return body.join('\n');
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
