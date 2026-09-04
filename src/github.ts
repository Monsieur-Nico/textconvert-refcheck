import type { getOctokit } from '@actions/github';

export type Octokit = ReturnType<typeof getOctokit>;

export interface RepoContext {
  owner: string;
  repo: string;
  /** The PR/issue number being checked. */
  number: number;
  /** The PR's head SHA -- undefined for a plain issue (no branch to check files against). */
  headSha?: string;
}

// Small in-memory caches, scoped to a single Action run -- the same
// collaborator/tree lookups are likely needed for several references in
// one PR body, and this is a one-shot process, not a long-lived service.
const collaboratorCache = new Map<string, Promise<Set<string>>>();
const treeCache = new Map<string, Promise<Set<string>>>();

/** Real repo collaborator logins, lowercased (GitHub logins are case-insensitive). */
export async function getCollaboratorLogins(
  octokit: Octokit,
  ctx: RepoContext,
): Promise<Set<string>> {
  const key = `${ctx.owner}/${ctx.repo}`;
  const cached = collaboratorCache.get(key);
  if (cached) return cached;

  const promise = octokit
    .paginate(octokit.rest.repos.listCollaborators, {
      owner: ctx.owner,
      repo: ctx.repo,
      per_page: 100,
    })
    .then((collaborators: Array<{ login: string }>) => {
      return new Set(collaborators.map((collaborator) => collaborator.login.toLowerCase()));
    });

  collaboratorCache.set(key, promise);
  return promise;
}

export async function issueExists(
  octokit: Octokit,
  owner: string,
  repo: string,
  number: number,
): Promise<boolean> {
  try {
    await octokit.rest.issues.get({ owner, repo, issue_number: number });
    return true;
  } catch (err) {
    if (isNotFound(err)) return false;
    throw err;
  }
}

/** Every file path in the repo tree at `ref`, as a Set for O(1) lookup. */
export async function getRepoTreePaths(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
): Promise<Set<string>> {
  const key = `${owner}/${repo}@${ref}`;
  const cached = treeCache.get(key);
  if (cached) return cached;

  interface TreeResponse {
    data: { tree: Array<{ type?: string; path?: string }> };
  }

  const promise = octokit.rest.git
    .getTree({ owner, repo, tree_sha: ref, recursive: 'true' })
    .then(({ data }: TreeResponse) => {
      const paths = data.tree
        .filter((entry) => entry.type === 'blob' && entry.path !== undefined)
        .map((entry) => entry.path as string);
      return new Set(paths);
    });

  treeCache.set(key, promise);
  return promise;
}

/** How many lines a file has, or null if the file/ref can't be resolved. */
export async function getFileLineCount(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  path: string,
): Promise<number | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== 'file' || !data.content) return null;

    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return content.split('\n').length;
  } catch (err) {
    if (isNotFound(err)) return null;
    throw err;
  }
}

function isNotFound(err: unknown): boolean {
  return typeof err === 'object' && err !== null && 'status' in err && err.status === 404;
}
