import type { Octokit, RepoContext } from './github';
import type { Violation } from './validate';

// Hidden marker used to find this Action's own comment on a later run, so
// it's updated in place instead of posting a new comment on every push.
export const COMMENT_MARKER = '<!-- textconvert-refcheck -->';

const MARKETPLACE_URL = 'https://github.com/marketplace/actions/textconvert-refcheck';
const LOGO_URL =
  'https://raw.githubusercontent.com/Monsieur-Nico/textconvert-refcheck/main/media/logo.png';

// Above this many violations, the list is collapsed into a <details> so a
// large PR body doesn't turn the comment into an endless scroll -- below
// it, the list stays directly visible since hiding 1-5 items behind a
// click costs more than it saves.
const DETAILS_THRESHOLD = 5;

const VIOLATION_LABELS: Record<Violation['type'], string> = {
  mention: '@mention',
  'issue-reference': 'issue/PR reference',
  'file-reference': 'file/line reference',
};

// Fixed display size for the logo in the header card below (the source
// PNG is 500x500 -- explicit width/height keep it from ever rendering
// oversized regardless of source resolution).
const LOGO_SIZE = 44;

// A header card: the project logo inline with a heading-sized, linked
// product name, followed by a plain subtitle line. This is what carries
// the Action's branding, since it posts as the generic
// github-actions[bot] identity rather than a custom GitHub App.
//
// This deliberately isn't a <table> layout -- GitHub's comment
// sanitizer strips both the `style` and `border` attributes outright
// (verified by rendering through the real GitHub markdown API), so a
// <table> always gets its default bordered-cell styling with no way to
// suppress it.
//
// It's also deliberately not a floated image (`align="left"` +
// `clear`): a float only pushes following content below it once that
// content's *combined* height happens to exceed the image's height,
// which isn't reliable -- the subtitle line ended up rendering beside
// the logo instead of under the heading. Putting the image inline
// inside the heading itself (vertical-centered against it via
// `align="absmiddle"`, which survives sanitization same as `align="left"`
// did) avoids floats entirely: the subtitle is just a plain paragraph
// that always starts on its own line below, no wrap math involved.
function headerCard(): string {
  return [
    `### <img src="${LOGO_URL}" width="${LOGO_SIZE}" height="${LOGO_SIZE}" align="absmiddle" alt="textconvert refcheck" /> [textconvert refcheck](${MARKETPLACE_URL})`,
    '',
    'Reference integrity check',
  ].join('\n');
}

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
    return [
      COMMENT_MARKER,
      '',
      headerCard(),
      '',
      '> [!TIP]',
      '> **All references are valid.** No dangling mentions, issue/PR references, or file/line references were found.',
    ].join('\n');
  }

  const lines = violations.map((v) => {
    const raw = escapeMarkdown(v.raw);
    const reason = escapeMarkdown(v.reason);
    return `- **${VIOLATION_LABELS[v.type]}** \`${raw}\` — ${reason}`;
  });

  const noun = violations.length === 1 ? 'reference' : 'references';
  const listBlock =
    violations.length > DETAILS_THRESHOLD
      ? [
          '<details open>',
          `<summary><strong>${violations.length} dangling ${noun}</strong></summary>`,
          '',
          ...lines,
          '',
          '</details>',
        ]
      : lines;

  const body = [
    COMMENT_MARKER,
    '',
    headerCard(),
    '',
    '> [!WARNING]',
    `> **${violations.length} dangling ${noun}.**`,
    '',
    ...listBlock,
  ];

  if (violations.some((v) => v.type === 'mention')) {
    body.push(
      '',
      '> [!TIP]',
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
