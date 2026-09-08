import * as core from '@actions/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Octokit } from '../src/github';
import {
  findUnsafeJob,
  guardAgainstPwnRequest,
  type PullRequestRefInfo,
} from '../src/workflowSafety';

vi.mock('@actions/core', () => ({
  warning: vi.fn(),
  setFailed: vi.fn(),
}));

function refcheckStep() {
  return { uses: 'Monsieur-Nico/textconvert-refcheck@v1' };
}

function checkoutStep(withRef?: string) {
  return withRef === undefined
    ? { uses: 'actions/checkout@v4' }
    : { uses: 'actions/checkout@v4', with: { ref: withRef } };
}

describe('#findUnsafeJob', () => {
  it('returns null for a non-object or jobless workflow', () => {
    expect(findUnsafeJob(null)).toBeNull();
    expect(findUnsafeJob('not a workflow')).toBeNull();
    expect(findUnsafeJob({})).toBeNull();
  });

  it('flags a job that runs this action and checks out the fork head sha', () => {
    const workflow = {
      jobs: {
        refcheck: {
          steps: [checkoutStep('${{ github.event.pull_request.head.sha }}'), refcheckStep()],
        },
      },
    };

    expect(findUnsafeJob(workflow)).toBe('refcheck');
  });

  it('flags a job checking out github.event.pull_request.head.ref', () => {
    const workflow = {
      jobs: {
        refcheck: {
          steps: [checkoutStep('${{ github.event.pull_request.head.ref }}'), refcheckStep()],
        },
      },
    };

    expect(findUnsafeJob(workflow)).toBe('refcheck');
  });

  it('flags a job checking out github.head_ref', () => {
    const workflow = {
      jobs: {
        refcheck: {
          steps: [checkoutStep('${{ github.head_ref }}'), refcheckStep()],
        },
      },
    };

    expect(findUnsafeJob(workflow)).toBe('refcheck');
  });

  it('does not flag a bare checkout with no ref (defaults to the safe base branch)', () => {
    const workflow = {
      jobs: {
        refcheck: { steps: [checkoutStep(), refcheckStep()] },
      },
    };

    expect(findUnsafeJob(workflow)).toBeNull();
  });

  it('does not flag a checkout pinned to a fixed, safe ref', () => {
    const workflow = {
      jobs: {
        refcheck: { steps: [checkoutStep('main'), refcheckStep()] },
      },
    };

    expect(findUnsafeJob(workflow)).toBeNull();
  });

  it('does not flag the fork checkout when it is in a different job than this action', () => {
    const workflow = {
      jobs: {
        test: { steps: [checkoutStep('${{ github.event.pull_request.head.sha }}')] },
        refcheck: { steps: [refcheckStep()] },
      },
    };

    expect(findUnsafeJob(workflow)).toBeNull();
  });

  it('does not flag a job that only runs this action, with no checkout at all', () => {
    const workflow = { jobs: { refcheck: { steps: [refcheckStep()] } } };

    expect(findUnsafeJob(workflow)).toBeNull();
  });
});

describe('#guardAgainstPwnRequest', () => {
  const samePr: PullRequestRefInfo = {
    head: { repo: { full_name: 'octocat/hello-world' } },
    base: { repo: { full_name: 'octocat/hello-world' } },
  };

  const forkPr: PullRequestRefInfo = {
    head: { repo: { full_name: 'someone-else/hello-world' } },
    base: { repo: { full_name: 'octocat/hello-world' } },
  };

  function makeOctokit(content?: string) {
    return {
      rest: {
        repos: {
          getContent: vi
            .fn()
            .mockResolvedValue(
              content === undefined
                ? { data: [] }
                : { data: { type: 'file', content: Buffer.from(content).toString('base64') } },
            ),
        },
      },
    } as unknown as Octokit;
  }

  beforeEach(() => {
    vi.stubEnv(
      'GITHUB_WORKFLOW_REF',
      'octocat/hello-world/.github/workflows/refcheck.yml@refs/heads/main',
    );
    vi.stubEnv('GITHUB_WORKFLOW_SHA', 'abc123');
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.clearAllMocks();
  });

  it('proceeds without checking anything for a non-pull_request_target event', async () => {
    const octokit = makeOctokit();

    const safe = await guardAgainstPwnRequest(
      octokit,
      'pull_request',
      'octocat',
      'hello-world',
      forkPr,
    );

    expect(safe).toBe(true);
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it('proceeds when the PR head repo matches the base (not a fork)', async () => {
    const octokit = makeOctokit();

    const safe = await guardAgainstPwnRequest(
      octokit,
      'pull_request_target',
      'octocat',
      'hello-world',
      samePr,
    );

    expect(safe).toBe(true);
    expect(octokit.rest.repos.getContent).not.toHaveBeenCalled();
  });

  it('warns and proceeds when the workflow path is not a file (e.g. a directory)', async () => {
    const octokit = makeOctokit();

    const safe = await guardAgainstPwnRequest(
      octokit,
      'pull_request_target',
      'octocat',
      'hello-world',
      forkPr,
    );

    expect(safe).toBe(true);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Could not verify'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('warns and proceeds when fetching the workflow file throws', async () => {
    const octokit = {
      rest: { repos: { getContent: vi.fn().mockRejectedValue(new Error('boom')) } },
    } as unknown as Octokit;

    const safe = await guardAgainstPwnRequest(
      octokit,
      'pull_request_target',
      'octocat',
      'hello-world',
      forkPr,
    );

    expect(safe).toBe(true);
    expect(core.warning).toHaveBeenCalledWith(expect.stringContaining('Could not verify'));
    expect(core.setFailed).not.toHaveBeenCalled();
  });

  it('fails the job when the fetched workflow has the pwn request pattern', async () => {
    const workflowYaml = [
      'jobs:',
      '  refcheck:',
      '    steps:',
      '      - uses: actions/checkout@v4',
      '        with:',
      '          ref: ${{ github.event.pull_request.head.sha }}',
      '      - uses: Monsieur-Nico/textconvert-refcheck@v1',
    ].join('\n');
    const octokit = makeOctokit(workflowYaml);

    const safe = await guardAgainstPwnRequest(
      octokit,
      'pull_request_target',
      'octocat',
      'hello-world',
      forkPr,
    );

    expect(safe).toBe(false);
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('job "refcheck"'));
    expect(core.setFailed).toHaveBeenCalledWith(expect.stringContaining('pwn request'));
  });

  it('proceeds when the fetched workflow is safe', async () => {
    const workflowYaml = [
      'jobs:',
      '  refcheck:',
      '    steps:',
      '      - uses: actions/checkout@v4',
    ].join('\n');
    const octokit = makeOctokit(workflowYaml);

    const safe = await guardAgainstPwnRequest(
      octokit,
      'pull_request_target',
      'octocat',
      'hello-world',
      forkPr,
    );

    expect(safe).toBe(true);
    expect(core.setFailed).not.toHaveBeenCalled();
    expect(core.warning).not.toHaveBeenCalled();
  });
});
