# Contributing to textconvert refcheck

Thanks for your interest in contributing!

## Getting Started

```sh
git clone https://github.com/Monsieur-Nico/textconvert-refcheck.git
cd textconvert-refcheck
npm install
```

## Development Workflow

- **Run tests:** `npm test` (or `npm run test:watch` while iterating)
- **Lint:** `npm run lint` (or `npm run lint:fix`)
- **Format:** `npm run format` (or `npm run format:check`)
- **Typecheck:** `npm run typecheck`
- **Build:** `npm run build` -- bundles `src/main.ts` into `dist/index.js` via `ncc`

Or run everything at once: `npm run all`.

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

This project uses [Conventional Commits](https://www.conventionalcommits.org/):

```text
<type>: <short summary>
```

**Allowed types:** `feat`, `fix`, `refactor`, `docs`, `test`, `chore`.

## Proposing Changes

- Open an [issue](https://github.com/Monsieur-Nico/textconvert-refcheck/issues) for bugs or feature requests before a large change, so the approach can be discussed first.
- Use the PR template and follow the commit message guidelines above.

## License

By contributing, you agree your contributions will be licensed under this project's [MIT License](LICENSE).
