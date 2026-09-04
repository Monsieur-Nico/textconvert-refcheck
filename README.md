# textconvert refcheck

A GitHub Action that checks every reference in a pull request or issue body actually resolves to something real, and posts one summary comment for anything that doesn't.

```js
// A typo'd mention silently notifies no one:
Thanks @jordam for the review!

// A typo'd issue number silently links nowhere useful:
Closes #234

// A file renamed in this same PR breaks a link nothing else catches
// (see "Why" below):
[see here](src/old-name.ts)
```

`refcheck` catches all three, using [`textconvert`](https://github.com/Monsieur-Nico/textConvert)'s extraction utilities plus the GitHub API to check what's actually real.

---

## What it checks

1. **`@mentions`** — flags a mention that doesn't match a real repository collaborator. Bot/App mentions (anything ending in `[bot]`, e.g. `@dependabot[bot]`) are never flagged.
2. **Issue/PR references** — `#123`, `owner/repo#123`, and full URLs (`https://github.com/owner/repo/issues/123`) — flags a reference to an issue/PR number that doesn't exist in this repository.
3. **File/line references** — relative markdown links (`[text](path/to/file.ts)`) and GitHub blob URLs, optionally with a `#L10` line anchor — flags a reference to a file (or line) that doesn't exist **on the pull request's own branch**.

## Why

- Nothing else validates free-text `@mentions` against a repository's actual collaborators — GitHub's own "invalid reviewer" checks only cover the _structured_ reviewer-request field, a different thing from a mention typed in prose.
- Existing "linked issue" checkers verify a reference is _present_ in a PR body, not that it's _real_ — a typo'd `Closes #234` (when the real issue is `#243`) passes those silently today.
- File-link checkers that work by fetching URLs over HTTP have a well-documented false-positive problem: a file added in the _same_ PR doesn't exist on the base branch yet, so a naive check 404s on something that's actually fine. Checking directly against the PR's own branch tree via the API sidesteps this cleanly.

## How it works

Given a pull request body like:

```md
Thanks @jordam for the first pass!

Closes #234

See [the updated types](src/old-name.ts) for context.
```

`refcheck` posts (or updates) a single comment on the PR:

> ### ⚠️ textconvert refcheck found dangling references
>
> - **@mention** `@jordam` — @jordam does not match a collaborator on this repository.
> - **issue/PR reference** `#234` — #234 does not refer to an existing issue or pull request in this repository.
> - **file/line reference** `[the updated types](src/old-name.ts)` — [the updated types](src/old-name.ts) does not refer to a file that exists on this PR's branch.

A few things worth knowing about that comment:

- **It's the same comment every time, not a new one per run.** `refcheck` finds its own previous comment (via a hidden marker) and updates it in place — so if a later push fixes `@jordam` → `@jordan`, the comment updates too, rather than an old "violations found" comment sitting stale next to a newer clean one.
- **It posts even when everything's clean** — a passing run updates the comment to `✅ textconvert refcheck — no dangling references found.`, so the comment always reflects the PR's current state, not just its worst moment.
- **The check itself doesn't fail by default.** With `fail-on-violation: false` (the default), the workflow run stays green regardless — the comment is purely informational. Set `fail-on-violation: true` to make a run with violations fail the check instead, which blocks merging if that check is marked required in branch protection.

## Usage

```yaml
name: Reference Check

on:
  pull_request:
    types: [opened, edited, synchronize]
  issues:
    types: [opened, edited]

permissions:
  contents: read
  issues: write
  pull-requests: write

jobs:
  refcheck:
    runs-on: ubuntu-latest
    steps:
      - uses: Monsieur-Nico/textconvert-refcheck@v1
        with:
          fail-on-violation: false
```

### Inputs

| Input               | Description                                                                    | Default               |
| ------------------- | ------------------------------------------------------------------------------ | --------------------- |
| `github-token`      | Token used to read the PR/issue body and post the summary comment.             | `${{ github.token }}` |
| `fail-on-violation` | Fail the check when a dangling reference is found, instead of only commenting. | `false`               |

## Scope

- **Same-repo references only.** `owner/repo#123` and blob URLs pointing at a _different_ repository aren't validated — checking them would need API access to a repo that might be private or outside this Action's token permissions.
- **PR/issue bodies only**, not comment bodies (`issue_comment` events) — a different, later addition if there's demand.
- A line-range anchor (`#L10-L20`) is checked against its **start** line only.

## Development

```sh
npm install
npm test
npm run lint
npm run typecheck
npm run build   # bundles src/main.ts into dist/index.js -- required before committing
                # any src/ change, since Actions run the committed dist/, not src/
```

## License

MIT
