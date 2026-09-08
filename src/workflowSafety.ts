import * as core from '@actions/core';
import { parse as parseYaml } from 'yaml';
import type { Octokit } from './github';

// Matched case-insensitively against a step's `uses:` value -- this is the
// same repo slug already hardcoded elsewhere for this Action's own URLs
// (see comment.ts), so a step referencing it by tag, branch, or SHA all
// match regardless of how it's pinned.
const ACTION_REPO = 'monsieur-nico/textconvert-refcheck';

// A `with.ref` matching any of these resolves to the fork's own commit --
// the untrusted side of a pull_request_target run. A checkout step with no
// `ref` at all is NOT dangerous: pull_request_target defaults checkout to
// the safe base branch.
const FORK_REF_PATTERNS = [/github\.event\.pull_request\.head\.(sha|ref)/, /github\.head_ref/];

const SECURITY_DOCS_URL =
  'https://docs.github.com/en/actions/reference/security/securely-using-pull_request_target';

interface WorkflowStep {
  uses?: unknown;
  with?: { ref?: unknown };
}

interface WorkflowJob {
  steps?: unknown;
}

interface WorkflowFile {
  jobs?: Record<string, WorkflowJob | undefined>;
}

export interface PullRequestRefInfo {
  head: { repo?: { full_name?: string } | null };
  base: { repo: { full_name?: string } };
}

function isStep(value: unknown): value is WorkflowStep {
  return typeof value === 'object' && value !== null;
}

function stepUsesThisAction(step: WorkflowStep): boolean {
  return typeof step.uses === 'string' && step.uses.toLowerCase().includes(ACTION_REPO);
}

function stepChecksOutForkHead(step: WorkflowStep): boolean {
  if (typeof step.uses !== 'string' || !/^actions\/checkout@/i.test(step.uses)) return false;

  const ref = step.with?.ref;
  return typeof ref === 'string' && FORK_REF_PATTERNS.some((pattern) => pattern.test(ref));
}

/**
 * Finds the id of a job that both runs this Action and checks out the
 * fork's untrusted PR head -- the "pwn request" pattern ({@link
 * SECURITY_DOCS_URL}): under `pull_request_target`, that job holds a
 * write-capable token and this repo's secrets, which a malicious fork PR
 * can steal via anything the checked-out ref lets it execute (a package.json
 * script, a Makefile, a test file). Returns null if the pattern isn't
 * present, or the parsed value isn't shaped like a workflow file.
 */
export function findUnsafeJob(workflow: unknown): string | null {
  if (typeof workflow !== 'object' || workflow === null) return null;
  const jobs = (workflow as WorkflowFile).jobs;
  if (typeof jobs !== 'object' || jobs === null) return null;

  for (const [jobId, job] of Object.entries(jobs)) {
    const steps = job?.steps;
    if (!Array.isArray(steps)) continue;

    const typedSteps = steps.filter(isStep);
    const runsThisAction = typedSteps.some(stepUsesThisAction);
    const checksOutForkHead = typedSteps.some(stepChecksOutForkHead);
    if (runsThisAction && checksOutForkHead) return jobId;
  }

  return null;
}

/**
 * Fetches and parses the workflow file actually executing this run (from
 * the base ref, via `GITHUB_WORKFLOW_REF`/`GITHUB_WORKFLOW_SHA` -- never
 * the fork's copy, since that's the whole point of `pull_request_target`).
 * Returns null on anything that stops this from being determined -- an
 * unset env var, a fetch failure, an unparseable file -- so the caller can
 * treat "can't tell" as distinct from "checked, and it's safe."
 */
async function fetchCurrentWorkflow(
  octokit: Octokit,
  owner: string,
  repo: string,
): Promise<unknown | null> {
  const workflowRef = process.env.GITHUB_WORKFLOW_REF;
  const workflowSha = process.env.GITHUB_WORKFLOW_SHA;
  if (!workflowRef || !workflowSha) return null;

  // e.g. "owner/repo/.github/workflows/refcheck.yml@refs/heads/main".
  const prefix = `${owner}/${repo}/`;
  if (!workflowRef.startsWith(prefix)) return null;
  const path = workflowRef.slice(prefix.length).split('@')[0];

  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref: workflowSha });
    if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return parseYaml(content);
  } catch {
    return null;
  }
}

function unsafeJobMessage(jobId: string): string {
  return [
    `Refusing to run: job "${jobId}" checks out the fork's untrusted PR head while ` +
      'triggered by pull_request_target. That grants this job a write-capable GITHUB_TOKEN ' +
      "and this repo's secrets, which the checked-out code can use to run arbitrary commands " +
      'with write access (a package.json script, a Makefile, a test file -- anything that ' +
      'gets executed). This is the "pwn request" pattern.',
    '',
    'To fix it:',
    `- Move the checkout/build/test step(s) in "${jobId}" to a separate job or workflow that ` +
      'stays on the plain `pull_request` trigger (read-only token, safe to run untrusted code ' +
      'against). Keep this action in its own pull_request_target job that never checks out ' +
      "the fork's code.",
    '- If code from the PR genuinely must run in a pull_request_target job, check out the base ' +
      "branch there instead of the fork's ref, or drop that job's own `permissions:` to " +
      '`contents: read` (and no other write scopes) if it does not actually need write access.',
    '',
    `See: ${SECURITY_DOCS_URL}`,
  ].join('\n');
}

/**
 * Guards against running this Action in a job vulnerable to the "pwn
 * request" pattern. No-ops (returns true) for anything other than a
 * pull_request_target run against a fork PR -- same-repo branches never
 * hit this, since they never get an elevated token they wouldn't already
 * have under plain `pull_request`.
 *
 * When the pattern is present, hard-fails the job via `core.setFailed`
 * and returns false so the caller skips the rest of the run: the whole
 * point is that this job cannot be trusted with the write-capable token
 * it was handed, so this Action shouldn't go on to use it either (e.g. to
 * post a comment).
 *
 * When the check can't be completed (workflow file unavailable, GITHUB_*
 * env vars missing, an unparseable file), this warns and returns true --
 * failing open, since an inability to verify isn't evidence of the
 * problem, and this Action already worked before this check existed.
 */
export async function guardAgainstPwnRequest(
  octokit: Octokit,
  eventName: string,
  owner: string,
  repo: string,
  pullRequest: PullRequestRefInfo | undefined,
): Promise<boolean> {
  if (eventName !== 'pull_request_target' || !pullRequest) return true;

  const isFork = pullRequest.head.repo?.full_name !== pullRequest.base.repo?.full_name;
  if (!isFork) return true;

  const workflow = await fetchCurrentWorkflow(octokit, owner, repo);
  if (workflow === null) {
    core.warning(
      "Could not verify this workflow's safety for pull_request_target on a fork PR " +
        "(couldn't fetch or parse the workflow file) -- proceeding, but see " +
        `${SECURITY_DOCS_URL} to confirm no step in this job checks out the fork's untrusted code.`,
    );
    return true;
  }

  const unsafeJob = findUnsafeJob(workflow);
  if (unsafeJob === null) return true;

  core.setFailed(unsafeJobMessage(unsafeJob));
  return false;
}
