import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * This Action's own version, read from the `package.json` GitHub checks
 * out alongside `dist/index.js` when a workflow runs `uses:
 * owner/repo@ref` -- `actionPath` is `GITHUB_ACTION_PATH`, which GitHub
 * Actions sets to that checkout's root directory.
 *
 * Reading it at runtime (rather than bundling the version into dist/ at
 * build time, e.g. via a JSON import) means it's always exactly the
 * version that shipped with the code actually running: package.json and
 * dist/index.js are committed together, so there's no separate value to
 * go stale between a version bump and dist/ being rebuilt.
 *
 * Returns undefined if package.json is missing or malformed rather than
 * throwing -- a missing version number should degrade the comment's
 * footer, not fail the whole check.
 */
export function getActionVersion(actionPath: string | undefined): string | undefined {
  if (!actionPath) return undefined;

  try {
    const raw = readFileSync(join(actionPath, 'package.json'), 'utf8');
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      'version' in parsed &&
      typeof (parsed as { version: unknown }).version === 'string'
    ) {
      return (parsed as { version: string }).version;
    }
    return undefined;
  } catch {
    return undefined;
  }
}
