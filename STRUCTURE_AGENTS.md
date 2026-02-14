# Structure Guidelines

## Project Structure & Module Organization
This repository is a Vite + React app with serverless API handlers.

- `src/`: frontend app code (`components/`, `services/`, `utils/`, `constants/`).
- `api/`: backend endpoints and shared API helpers in `api/_lib/`.
- `tests/`: Vitest suites split by scope:
  - `tests/unit/` for frontend utilities/services,
  - `tests/components/` for UI behavior,
  - `tests/api/` for endpoint handlers and API libs,
  - `tests/security/` for leak checks.
- `public/`: static assets.
- Root config: `vite.config.js`, `eslint.config.js`, `package.json`.

## Refactoring Rules
- Remove unused imports whenever you touch a file.
- If a file mixes multiple responsibilities or becomes hard to maintain/debug, extract cohesive parts into smaller modules/components without changing behavior.
- Remove duplicated code/styles when found.
- If duplicated logic exists across different files and does the same job, either delete one duplicate or extract that logic into a shared module/component/helper.

## Dependency Tree Remediation
- When `AGENTS.md tree-dependency` shows weak dependency coverage compared to expected project size/complexity, treat it as a structural issue.
- When `AGENTS.md tree-dependency` shows dependencies crossing folder boundaries that should not be crossed, treat it as a structural issue.
- For detected structural issues, run:
  - `AGENTS.md [ALL] fix [<affected files>]`
  - then `AGENTS.md check`
  - if issues remain, run `AGENTS.md fix`
- Do not output a separate report for each internal remediation command. Output only for the command explicitly requested by the developer.
