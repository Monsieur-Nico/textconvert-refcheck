# Security Policy

## Supported Versions

Only the latest `v1.x` release is supported. Consumers pinned to the floating `v1` tag get fixes automatically; if you're pinned to an exact version (e.g. `v1.0.2`), update to the latest tag to get a fix.

## Reporting a Vulnerability

Please **do not** open a public issue for a security vulnerability.

Instead, use GitHub's private reporting for this repository: go to the [Security tab](https://github.com/Monsieur-Nico/textconvert-refcheck/security/advisories/new) and click "Report a vulnerability". This opens a private advisory visible only to the maintainer until a fix is ready.

Include:
- The version of the action you're using
- A minimal PR/issue body or workflow config that reproduces the issue
- What you expected vs. what happened

You should get a response within a few days.

## Scope

This action reads pull request and issue bodies (attacker-controllable text, in the case of external contributors) and posts a comment back using the workflow's `GITHUB_TOKEN`. Reports of particular interest:

- Ways a crafted PR/issue body could break out of the posted comment's markdown (injection)
- Ways a crafted body could force excessive API calls or an oversized comment (resource abuse)
- Ways the action could be tricked into reading or writing outside the repository it's running in
