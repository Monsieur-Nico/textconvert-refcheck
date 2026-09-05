import { describe, expect, it, vi } from 'vitest';
import { COMMENT_MARKER, formatComment, upsertComment } from '../src/comment';
import type { Octokit, RepoContext } from '../src/github';
import type { Violation } from '../src/validate';

describe('#formatComment', () => {
  it('formats an all-clear message when there are no violations', () => {
    const body = formatComment([]);
    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('no dangling references found');
  });

  it('formats a list of violations', () => {
    const violations: Violation[] = [
      { type: 'mention', raw: '@jordam', reason: '@jordam does not match a collaborator.' },
      { type: 'issue-reference', raw: '#234', reason: '#234 does not exist.' },
    ];

    const body = formatComment(violations);

    expect(body).toContain(COMMENT_MARKER);
    expect(body).toContain('@jordam');
    expect(body).toContain('#234');
    expect(body).toContain('does not match a collaborator');
    expect(body).toContain('does not exist');
  });

  it('appends a backtick hint when a mention is flagged', () => {
    const violations: Violation[] = [
      { type: 'mention', raw: '@jordam', reason: '@jordam does not match a collaborator.' },
    ];

    const body = formatComment(violations);

    expect(body).toContain('wrap it in backticks');
  });

  it('omits the backtick hint when no mention is flagged', () => {
    const violations: Violation[] = [
      { type: 'issue-reference', raw: '#234', reason: '#234 does not exist.' },
    ];

    const body = formatComment(violations);

    expect(body).not.toContain('wrap it in backticks');
  });

  it('strips a backtick from raw so it cannot break out of the code span', () => {
    const violations: Violation[] = [
      {
        type: 'file-reference',
        raw: '[x](src/foo.ts`**FAKE**`)',
        reason: 'does not exist.',
      },
    ];

    const body = formatComment(violations);

    // No backtick anywhere in the rendered line -- specifically, the
    // opening code-span backtick must be immediately followed by content
    // with no backtick until the single closing backtick that follows it.
    const line = body.split('\n').find((l) => l.includes('file/line reference'));
    expect(line).toBeDefined();
    expect(line!.match(/`/g)?.length).toBe(2);
    expect(line).not.toContain('**FAKE**');
  });

  it('escapes markdown-active characters in reason, which is not code-quoted', () => {
    const violations: Violation[] = [
      {
        type: 'mention',
        raw: '@jordam',
        reason: '@jordam_the_**faker** does not match [a collaborator](https://evil.example).',
      },
    ];

    const body = formatComment(violations);

    expect(body).toContain('\\_the\\_');
    expect(body).toContain('\\*\\*faker\\*\\*');
    expect(body).toContain('\\[a collaborator\\]');
  });
});

describe('#upsertComment', () => {
  const ctx: RepoContext = { owner: 'octocat', repo: 'hello-world', number: 1 };

  function makeOctokit(existingComments: Array<{ id: number; body?: string }>) {
    return {
      paginate: vi.fn().mockResolvedValue(existingComments),
      rest: {
        issues: {
          listComments: vi.fn(),
          updateComment: vi.fn().mockResolvedValue(undefined),
          createComment: vi.fn().mockResolvedValue(undefined),
        },
      },
    } as unknown as Octokit;
  }

  it('creates a new comment when there is no existing marked comment', async () => {
    const octokit = makeOctokit([{ id: 1, body: 'an unrelated comment' }]);

    await upsertComment(octokit, ctx, 'new body');

    expect(octokit.rest.issues.createComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'octocat',
        repo: 'hello-world',
        issue_number: 1,
        body: 'new body',
      }),
    );
    expect(octokit.rest.issues.updateComment).not.toHaveBeenCalled();
  });

  it('updates the existing marked comment in place', async () => {
    const octokit = makeOctokit([{ id: 42, body: `${COMMENT_MARKER}\nold body` }]);

    await upsertComment(octokit, ctx, 'new body');

    expect(octokit.rest.issues.updateComment).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'octocat',
        repo: 'hello-world',
        comment_id: 42,
        body: 'new body',
      }),
    );
    expect(octokit.rest.issues.createComment).not.toHaveBeenCalled();
  });
});
