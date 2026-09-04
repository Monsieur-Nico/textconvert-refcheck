import * as core from '@actions/core';
import * as github from '@actions/github';
import { formatComment, upsertComment } from './comment';
import type { RepoContext } from './github';
import { validateBody } from './validate';

// v1 scope: reacts to the PR/issue body itself (pull_request,
// pull_request_target, issues events) -- not comment bodies
// (issue_comment events), which would be a different, later addition.
async function run(): Promise<void> {
  try {
    const token = core.getInput('github-token', { required: true });
    const failOnViolation = core.getBooleanInput('fail-on-violation');

    const octokit = github.getOctokit(token);
    const { context } = github;
    const { owner, repo } = context.repo;

    let number: number | undefined;
    let body: string | null | undefined;
    let headSha: string | undefined;

    if (context.payload.pull_request) {
      number = context.payload.pull_request.number;
      body = context.payload.pull_request.body;
      headSha = context.payload.pull_request.head?.sha;
    } else if (context.payload.issue) {
      number = context.payload.issue.number;
      body = context.payload.issue.body;
    }

    if (number === undefined) {
      core.info('No pull_request or issue payload found on this event -- nothing to check.');
      return;
    }

    const ctx: RepoContext = { owner, repo, number, headSha };
    const violations = await validateBody(octokit, ctx, body ?? '');

    core.info(`Found ${violations.length} dangling reference(s).`);

    await upsertComment(octokit, ctx, formatComment(violations));

    if (failOnViolation && violations.length > 0) {
      core.setFailed(`Found ${violations.length} dangling reference(s) in the PR/issue body.`);
    }
  } catch (err) {
    core.setFailed(err instanceof Error ? err.message : String(err));
  }
}

run();
