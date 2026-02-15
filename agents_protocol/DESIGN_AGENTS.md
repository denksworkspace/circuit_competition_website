# Design Guidelines

## Coding Style & Naming Conventions
- Use ES modules and modern React function components.
- Keep code and comments in English only.
- Match existing formatting (4-space indentation, semicolons, double quotes).
- Naming patterns:
  - components: `PascalCase` (e.g. `src/components/CustomTooltip.jsx`),
  - utilities/services/helpers: `camelCase` file names (e.g. `src/services/apiClient.js`, `src/utils/pointUtils.js`),
  - tests: `*.test.js` / `*.test.jsx`.
- Use ESLint (`npm run lint`) before opening a PR.

## UI Review Notes
- Include screenshots for UI changes in PRs.

## Evidence Commands
- `npm run lint`
- `git ls-files | xargs rg -nP "\\p{Cyrillic}" -S || true`
- `rg --files src/components src/utils src/services tests | sort`
- `rg -n "(\\bAGETNS\\b|\\bAGNETS\\b|\\bAGNTS\\b|\\bAENTS\\b)" AGENTS.md AGENTS_INDEX.md agents_protocol/*.md | rg -v "e.g.,|typo/context scan|\\(e\\.g\\." || true`

## Pass Criteria
- `PASS` only if lint succeeds, non-English code/comment scan has no hits, naming/path conventions are not violated, and typo/context scan has no critical hits for protocol keywords.
- If evidence commands are not run or outputs show violations, verdict must not be `PASS`.
