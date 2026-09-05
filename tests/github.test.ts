import { describe, expect, it, vi } from 'vitest';
import {
  getCollaboratorLogins,
  getFileLineCount,
  getRepoTreePaths,
  issueExists,
  type Octokit,
} from '../src/github';

function makeOctokit(overrides: Record<string, unknown> = {}): Octokit {
  return {
    paginate: vi.fn(),
    rest: {
      issues: { get: vi.fn() },
      git: { getTree: vi.fn() },
      repos: { getContent: vi.fn(), listCollaborators: vi.fn() },
      ...overrides,
    },
  } as unknown as Octokit;
}

function notFoundError(): Error & { status: number } {
  return Object.assign(new Error('Not Found'), { status: 404 });
}

describe('#getCollaboratorLogins', () => {
  it('returns collaborator logins, lowercased', async () => {
    const octokit = makeOctokit();
    (octokit.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([
      { login: 'Jordan' },
      { login: 'alex-dev' },
    ]);

    const logins = await getCollaboratorLogins(octokit, { owner: 'o1', repo: 'r1', number: 1 });

    expect(logins).toEqual(new Set(['jordan', 'alex-dev']));
    expect(octokit.paginate).toHaveBeenCalledWith(octokit.rest.repos.listCollaborators, {
      owner: 'o1',
      repo: 'r1',
      per_page: 100,
    });
  });

  it('caches the result per owner/repo, calling paginate only once', async () => {
    const octokit = makeOctokit();
    (octokit.paginate as ReturnType<typeof vi.fn>).mockResolvedValue([{ login: 'jordan' }]);
    const ctx = { owner: 'o2', repo: 'r2', number: 1 };

    await getCollaboratorLogins(octokit, ctx);
    await getCollaboratorLogins(octokit, ctx);

    expect(octokit.paginate).toHaveBeenCalledTimes(1);
  });
});

describe('#issueExists', () => {
  it('returns true when the issue is found', async () => {
    const octokit = makeOctokit();
    (octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockResolvedValue({});

    await expect(issueExists(octokit, 'o', 'r', 1)).resolves.toBe(true);
  });

  it('returns false on a 404', async () => {
    const octokit = makeOctokit();
    (octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockRejectedValue(notFoundError());

    await expect(issueExists(octokit, 'o', 'r', 1)).resolves.toBe(false);
  });

  it('rethrows a non-404 error', async () => {
    const octokit = makeOctokit();
    const serverError = Object.assign(new Error('boom'), { status: 500 });
    (octokit.rest.issues.get as ReturnType<typeof vi.fn>).mockRejectedValue(serverError);

    await expect(issueExists(octokit, 'o', 'r', 1)).rejects.toThrow('boom');
  });
});

describe('#getRepoTreePaths', () => {
  it('returns only blob paths, ignoring trees and entries without a path', async () => {
    const octokit = makeOctokit();
    (octokit.rest.git.getTree as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: {
        tree: [
          { type: 'blob', path: 'src/foo.ts' },
          { type: 'tree', path: 'src' },
          { type: 'blob', path: undefined },
        ],
      },
    });

    const paths = await getRepoTreePaths(octokit, 'o3', 'r3', 'main');

    expect(paths).toEqual(new Set(['src/foo.ts']));
  });

  it('caches the result per owner/repo@ref, calling getTree only once', async () => {
    const octokit = makeOctokit();
    (octokit.rest.git.getTree as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { tree: [] },
    });

    await getRepoTreePaths(octokit, 'o4', 'r4', 'abc123');
    await getRepoTreePaths(octokit, 'o4', 'r4', 'abc123');

    expect(octokit.rest.git.getTree).toHaveBeenCalledTimes(1);
  });
});

describe('#getFileLineCount', () => {
  it('returns the line count of a file', async () => {
    const octokit = makeOctokit();
    const content = Buffer.from('line1\nline2\nline3').toString('base64');
    (octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { type: 'file', content },
    });

    await expect(getFileLineCount(octokit, 'o', 'r', 'main', 'src/foo.ts')).resolves.toBe(3);
  });

  it('returns null when the path is a directory (array response)', async () => {
    const octokit = makeOctokit();
    (octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockResolvedValue({ data: [] });

    await expect(getFileLineCount(octokit, 'o', 'r', 'main', 'src')).resolves.toBeNull();
  });

  it('returns null when the entry has no content (e.g. a submodule)', async () => {
    const octokit = makeOctokit();
    (octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { type: 'file', content: undefined },
    });

    await expect(getFileLineCount(octokit, 'o', 'r', 'main', 'src/foo.ts')).resolves.toBeNull();
  });

  it('returns null on a 404', async () => {
    const octokit = makeOctokit();
    (octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockRejectedValue(notFoundError());

    await expect(getFileLineCount(octokit, 'o', 'r', 'main', 'src/foo.ts')).resolves.toBeNull();
  });

  it('rethrows a non-404 error', async () => {
    const octokit = makeOctokit();
    const serverError = Object.assign(new Error('boom'), { status: 500 });
    (octokit.rest.repos.getContent as ReturnType<typeof vi.fn>).mockRejectedValue(serverError);

    await expect(getFileLineCount(octokit, 'o', 'r', 'main', 'src/foo.ts')).rejects.toThrow('boom');
  });
});
