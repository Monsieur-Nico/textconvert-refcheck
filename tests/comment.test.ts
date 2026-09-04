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
