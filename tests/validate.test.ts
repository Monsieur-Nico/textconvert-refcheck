import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Octokit, RepoContext } from '../src/github';

const { getCollaboratorLogins, issueExists, getRepoTreePaths, getFileLineCount } = vi.hoisted(
  () => ({
    getCollaboratorLogins: vi.fn(),
    issueExists: vi.fn(),
    getRepoTreePaths: vi.fn(),
    getFileLineCount: vi.fn(),
  }),
);

vi.mock('../src/github', () => ({
  getCollaboratorLogins,
  issueExists,
  getRepoTreePaths,
  getFileLineCount,
}));

const { validateBody } = await import('../src/validate');

const octokit = {} as Octokit;
const baseCtx: RepoContext = { owner: 'octocat', repo: 'hello-world', number: 1 };

beforeEach(() => {
  vi.resetAllMocks();
  getCollaboratorLogins.mockResolvedValue(new Set(['jordan']));
  issueExists.mockResolvedValue(true);
  getRepoTreePaths.mockResolvedValue(new Set(['src/foo.ts']));
  getFileLineCount.mockResolvedValue(20);
});

describe('#validateBody -- mentions', () => {
  it('flags a mention that is not a collaborator', async () => {
    const violations = await validateBody(octokit, baseCtx, 'cc @jordam');
    expect(violations).toEqual([
      {
        type: 'mention',
        raw: '@jordam',
        reason: '@jordam does not match a collaborator on this repository.',
      },
    ]);
  });

  it('does not flag a mention inside an inline code span (e.g. Dependabot-style command syntax)', async () => {
    const violations = await validateBody(
      octokit,
      baseCtx,
      'You can trigger a rebase by commenting `@dependabot rebase`.',
    );
    expect(violations).toEqual([]);
    expect(getCollaboratorLogins).not.toHaveBeenCalled();
  });

  it('does not flag a real collaborator, case-insensitively', async () => {
    const violations = await validateBody(octokit, baseCtx, 'cc @Jordan');
    expect(violations).toEqual([]);
  });

  it('does not flag a bot mention', async () => {
    const violations = await validateBody(octokit, baseCtx, 'cc @github-actions[bot]');
    expect(violations).toEqual([]);
    expect(getCollaboratorLogins).not.toHaveBeenCalled();
  });

  it('does not call the collaborators API when there are no mentions', async () => {
    await validateBody(octokit, baseCtx, 'no mentions here');
    expect(getCollaboratorLogins).not.toHaveBeenCalled();
  });
});

describe('#validateBody -- issue/PR references', () => {
  it('flags a reference to an issue that does not exist', async () => {
    issueExists.mockResolvedValue(false);
    const violations = await validateBody(octokit, baseCtx, 'Closes #234');
    expect(violations).toEqual([
      {
        type: 'issue-reference',
        raw: '#234',
        reason: '#234 does not refer to an existing issue or pull request in this repository.',
      },
    ]);
  });

  it('does not flag a reference to a real issue', async () => {
    const violations = await validateBody(octokit, baseCtx, 'Closes #234');
    expect(violations).toEqual([]);
  });

  it('does not validate a cross-repo reference (v1 scope)', async () => {
    issueExists.mockResolvedValue(false);
    const violations = await validateBody(octokit, baseCtx, 'See other/repo#1');
    expect(violations).toEqual([]);
    expect(issueExists).not.toHaveBeenCalled();
  });

  it('does not flag a bare reference that is the label of a link to a different repo (e.g. Dependabot changelog links)', async () => {
    issueExists.mockResolvedValue(false);
    const body = '<a href="https://redirect.github.com/other/repo/issues/1574">#1574</a>';
    const violations = await validateBody(octokit, baseCtx, body);
    expect(violations).toEqual([]);
    expect(issueExists).not.toHaveBeenCalled();
  });
});

describe('#validateBody -- file/line references', () => {
  it('flags a reference to a file that does not exist on the PR branch', async () => {
    const ctx = { ...baseCtx, headSha: 'abc123' };
    const violations = await validateBody(octokit, ctx, '[see](src/missing.ts)');
    expect(violations).toEqual([
      {
        type: 'file-reference',
        raw: '[see](src/missing.ts)',
        reason: "[see](src/missing.ts) does not refer to a file that exists on this PR's branch.",
      },
    ]);
  });

  it('does not flag a file that exists', async () => {
    const ctx = { ...baseCtx, headSha: 'abc123' };
    const violations = await validateBody(octokit, ctx, '[see](src/foo.ts)');
    expect(violations).toEqual([]);
  });

  it('flags a line anchor past the end of the file', async () => {
    const ctx = { ...baseCtx, headSha: 'abc123' };
    const violations = await validateBody(octokit, ctx, '[see](src/foo.ts#L50)');
    expect(violations).toEqual([
      {
        type: 'file-reference',
        raw: '[see](src/foo.ts#L50)',
        reason: '[see](src/foo.ts#L50) references line 50, but the file only has 20 lines.',
      },
    ]);
  });

  it('skips file validation entirely when there is no PR head SHA (a plain issue)', async () => {
    const violations = await validateBody(octokit, baseCtx, '[see](src/missing.ts)');
    expect(violations).toEqual([]);
    expect(getRepoTreePaths).not.toHaveBeenCalled();
  });
});

describe('#validateBody -- combined', () => {
  it('returns violations from all three checks together', async () => {
    issueExists.mockResolvedValue(false);
    const ctx = { ...baseCtx, headSha: 'abc123' };
    const body = 'cc @jordam, closes #234, see [here](src/missing.ts)';

    const violations = await validateBody(octokit, ctx, body);

    expect(violations.map((v) => v.type)).toEqual(['mention', 'issue-reference', 'file-reference']);
  });
});

describe('#validateBody -- abuse resistance', () => {
  it('de-duplicates the same issue reference repeated many times into a single API call', async () => {
    issueExists.mockResolvedValue(false);
    const body = Array(200).fill('#234').join(' ');

    const violations = await validateBody(octokit, baseCtx, body);

    expect(issueExists).toHaveBeenCalledTimes(1);
    expect(violations).toHaveLength(1);
  });

  it('caps the number of distinct issue references checked per body', async () => {
    issueExists.mockResolvedValue(false);
    const body = Array.from({ length: 200 }, (_, i) => `#${i + 1}`).join(' ');

    const violations = await validateBody(octokit, baseCtx, body);

    expect(issueExists).toHaveBeenCalledTimes(50);
    expect(violations).toHaveLength(50);
  });

  it('caps the number of distinct file references checked per body', async () => {
    const ctx = { ...baseCtx, headSha: 'abc123' };
    const body = Array.from({ length: 200 }, (_, i) => `[x](src/missing-${i}.ts)`).join(' ');

    const violations = await validateBody(octokit, ctx, body);

    expect(violations).toHaveLength(50);
  });

  it('caps the number of distinct mentions checked per body', async () => {
    const body = Array.from({ length: 200 }, (_, i) => `@user${i}`).join(' ');

    const violations = await validateBody(octokit, baseCtx, body);

    expect(violations).toHaveLength(50);
  });
});
