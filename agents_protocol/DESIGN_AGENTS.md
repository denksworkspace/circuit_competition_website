# Design Guidelines

## Rules
- Use ES modules and React function components.
- Keep code/comments in English.
- In user-facing UI copy, use mathematical symbols `≤` and `≥` instead of ASCII `<=` and `>=`.
- Match repo formatting: 4-space indentation, semicolons, double quotes.
- Naming:
  - components: `PascalCase`
  - utils/services/helpers: `camelCase`
  - tests: `*.test.js` / `*.test.jsx`
- Include UI screenshots in PRs when UI changes.

## Evidence Commands
- `npm run lint`
- `git ls-files | xargs rg -nP "\\p{Cyrillic}" -S || true`
- `rg --files src/components src/utils src/services tests | sort`
- `rg -n "(\\bAGETNS\\b|\\bAGNETS\\b|\\bAGNTS\\b|\\bAENTS\\b)" AGENTS.md AGENTS_INDEX.md agents_protocol/*.md | rg -v "e.g.,|typo/context scan|\\(e\\.g\\." || true`

## Pass Criteria
- `PASS` only if lint succeeds, naming/path conventions hold, English-only scan is clean for code/comments, and protocol keyword typo scan has no critical hits.
- Missing evidence or violations => non-`PASS`.
