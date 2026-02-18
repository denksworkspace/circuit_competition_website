# Structure Guidelines

## Scope
- Keep structure aligned to Vite + React + serverless API layout.
- Expected roots: `src/`, `api/`, `tests/`, `public/`.

## Rules
- Remove unused imports in touched files.
- Split multi-responsibility files into cohesive modules without behavior changes.
- Remove duplicate logic/styles; prefer shared helpers for reused logic.
- Treat dependency-tree boundary violations or missing paths as structural failures.

## Evidence Commands
- `find src api tests -maxdepth 4 -type d | sort`
- `rg --files src api tests`
- `AGENTS.md tree-dependency`
- `npm run lint`

## Pass Criteria
- `PASS` only if required paths exist, dependency tree has no `|?? ... (missing path)`, and lint shows no structural violations.
- Missing evidence or contradictory outputs => non-`PASS`.
