# Contributing to textconvert refcheck

Thanks for your interest in contributing!

This is a sibling project to [textConvert](https://github.com/Monsieur-Nico/textConvert) -- it doesn't depend on that library directly (see the README's [_Why not just use textConvert directly?_](README.md#why-not-just-use-textconvert-directly)), but its parsers follow the same conventions, and changes here should keep doing so.

## Getting Started

```sh
git clone https://github.com/Monsieur-Nico/textconvert-refcheck.git
cd textconvert-refcheck
npm install
```

## Development Workflow

- **Run tests:** `npm test` (or `npm run test:watch` while iterating)
- **Coverage:** `npm run coverage`
- **Lint:** `npm run lint` (or `npm run lint:fix`)
- **Format:** `npm run format` (or `npm run format:check`)
- **Typecheck:** `npm run typecheck`
- **Build:** `npm run build` -- bundles `src/main.ts` into `dist/index.js` via `ncc`

Or run everything at once: `npm run all`.

Running `npm install` also sets up Git hooks (via [Husky](https://typicode.github.io/husky/)):

- **Pre-commit:** Only staged files are linted and formatted automatically.
- **Pre-push:** Tests are run before every push.
- **Commit message:** Must follow Conventional Commits (checked automatically).

### `dist/` must stay in sync with `src/`

This Action runs the **committed** `dist/index.js`, not `src/` -- GitHub Actions don't run `npm install`/a build step at execution time, so whatever's checked into `dist/` is what actually executes for every consumer using `uses: Monsieur-Nico/textconvert-refcheck@...`.

**Any `src/` change needs `npm run build` run afterward, with the resulting `dist/` changes included in the same PR.** CI enforces this (a "Verify dist/ is up to date with src/" step rebuilds and fails the check if it doesn't match what's committed), but it's much easier to just remember to run the build locally before opening a PR.

## This Action processes untrusted input

Every check this Action runs works on **PR/issue body text that an external, potentially malicious contributor wrote**. That's a real security boundary, not a formality -- a dedicated safety review before the first release found and fixed a genuine markdown-injection vector and an unbounded-API-calls vector, both from crafted input.

When adding or changing anything that touches PR/issue body text (a parser, the comment formatter, anything that echoes matched text back into a comment or API call), think about what a malicious body could contain, not just what a well-formed one looks like. A few things worth keeping in mind:

- Any text derived from the PR/issue body and displayed back in the summary comment needs to go through `escapeMarkdown` (in `src/comment.ts`) before being embedded in the comment -- otherwise it can break out of the intended quoting and inject live markdown.
- Anything that triggers one GitHub API call per matched candidate needs to stay bounded (see `MAX_CHECKS_PER_BODY` in `src/validate.ts`) -- an unbounded loop over attacker-controlled matches is a resource-exhaustion vector against the repository's own automation.
- Prefer linear character-by-character scans over quantified regexes for anything that scans free-form text end-to-end (see the existing parsers in `src/mentions.ts`/`src/references.ts`/`src/files.ts` for the pattern) -- this avoids ReDoS on adversarial input.

## Commit Message Guidelines

This project uses [Conventional Commits](https://www.conventionalcommits.org/), enforced automatically by the commit-msg hook:

```text
<type>: <short summary>
```

**Allowed types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

### How Commit Messages Drive the Version Bump

[release-please](https://github.com/googleapis/release-please) reads commit types on `main` to decide the next version -- this is mechanical (it just parses your commit message), so getting the type right is what actually determines the release:

| Commit type                                       | Version bump                                 |
| ------------------------------------------------- | -------------------------------------------- |
| `fix:`                                            | Patch (`1.0.5` → `1.0.6`)                    |
| `feat:`                                           | Minor (`1.0.5` → `1.1.0`)                    |
| `feat!:` / `fix!:` or a `BREAKING CHANGE:` footer | Major (`1.0.5` → `2.0.0`)                    |
| `docs:`, `chore:`, `test:`, `refactor:`           | None -- doesn't trigger a release on its own |

This is entirely up to whoever writes the commit -- nothing checks whether a change is _actually_ breaking, it only trusts what the message says. For this Action, a breaking change means something that changes behavior for an existing consumer without any action on their part -- e.g. removing/renaming an input, changing what counts as a violation, or changing the comment's marker/format in a way that breaks the update-in-place behavior.

## Proposing Changes

- Open an [issue](https://github.com/Monsieur-Nico/textconvert-refcheck/issues) for bugs or feature requests before a large change, so the approach can be discussed first.
- Use the PR template and follow the commit message guidelines above.

## Release & Publishing

- Releases are managed automatically by [release-please](https://github.com/googleapis/release-please), driven by Conventional Commits on `main`. There's nothing to run manually.
- Every push to `main` that contains releasable commits (`feat`, `fix`, etc.) opens or updates a release PR with the version bump and `CHANGELOG.md` entry. Merging that PR creates the GitHub Release and tag.
- See [_How Commit Messages Drive the Version Bump_](#how-commit-messages-drive-the-version-bump) above for exactly which commit type produces which bump.
- Consumers pin to a floating major-version tag (e.g. `uses: Monsieur-Nico/textconvert-refcheck@v1`), not an exact release. Once release-please publishes, a follow-up job moves that tag to point at the new release automatically -- there's no manual `git tag -f` step anymore.

## License

By contributing, you agree your contributions will be licensed under this project's [MIT License](LICENSE).
