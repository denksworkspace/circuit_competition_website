# Design Guidelines

## Coding Style & Naming Conventions
- Use ES modules and modern React function components.
- Keep code and comments in English only.
- Match existing formatting (4-space indentation, semicolons, double quotes).
- Naming patterns:
  - components: `PascalCase` (`CustomTooltip.jsx`),
  - utilities/services/helpers: `camelCase` file names (`apiClient.js`, `pointUtils.js`),
  - tests: `*.test.js` / `*.test.jsx`.
- Use ESLint (`npm run lint`) before opening a PR.

## UI Review Notes
- Include screenshots for UI changes in PRs.

## Evidence Commands
- `npm run lint`
- `git ls-files | xargs rg -nP "\\p{Cyrillic}" -S || true`
- `rg --files src/components src/utils src/services tests | sort`

## Pass Criteria
- `PASS` only if lint succeeds, non-English code/comment scan has no hits, and naming/path conventions are not violated.
- If evidence commands are not run or outputs show violations, verdict must not be `PASS`.
