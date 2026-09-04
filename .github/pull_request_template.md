# Conventional Commit Message Format

Please use the Conventional Commits format for your commits:

`<type>: <short summary>`

**Allowed types:**

- feat: ✨ Features
- fix: 🐛 Fixes
- refactor: 🧼 Refactors
- docs: 📚 Documentation
- test: ✅ Tests
- chore: 🔧 Chores

**Example:**
`fix: don't flag a bot mention missing the [bot] suffix`

---

## Summary

_Provide an overview..._

### PR checklist

- [ ] Added or updated tests for the change.
- [ ] `npm run typecheck`, `npm run lint`, and `npm test` all pass.
- [ ] Ran `npm run build` and committed the resulting `dist/` changes -- required for any `src/` change, since this Action runs the committed `dist/index.js`, not `src/`, at execution time.
- [ ] Updated the README if the change affects usage, inputs, or scope.

### Details

_What changed, and why?_

### References

_Link any related issue or context..._
