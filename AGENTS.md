# Repository Guidelines

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

## Build, Test, and Development Commands
- `npm run dev`: start local development server.
- `npm run build`: production build via Vite.
- `npm run preview`: preview built app locally.
- `npm run lint`: run ESLint across the project.
- `npm test`: run Vitest in watch mode.
- `npm run test:run`: run tests once (CI-friendly).
- `npm run test:coverage`: run tests with coverage output.

## Coding Style & Naming Conventions
- Use ES modules and modern React function components.
- Keep code and comments in English only.
- Match existing formatting (4-space indentation, semicolons, double quotes).
- Naming patterns:
  - components: `PascalCase` (`CustomTooltip.jsx`),
  - utilities/services/helpers: `camelCase` file names (`apiClient.js`, `pointUtils.js`),
  - tests: `*.test.js` / `*.test.jsx`.
- Use ESLint (`npm run lint`) before opening a PR.

## Testing Guidelines
- Framework: Vitest (+ Testing Library for React UI tests).
- Add/update tests for behavior changes, validation, security, and API contracts.
- Prefer targeted runs while developing, e.g.:
  - `npm test -- tests/api/points-upload-url.test.js`
  - `npm test -- tests/security/secret-leak-scan.test.js`

## Commit & Pull Request Guidelines
- Follow concise, imperative commit messages seen in history:
  - `Fix Neon bind error in upload settings schema init`
  - `Add roles, multi-file upload, upload logs...`
- PRs should include:
  - clear problem/solution summary,
  - affected paths/endpoints,
  - test evidence (what was run),
  - screenshots for UI changes.

## Security & Configuration Tips
- Never commit real secrets (`.env*` except `.env.example`).
- Keep placeholders in `.env.example`; store real values in local/hosted env settings.
- If a requested change conflicts with `READMELLM.md` or appears risky/illogical, request explicit confirmation before implementation.
