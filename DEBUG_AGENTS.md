# Debug Guidelines

## Debug & Verification Commands
- `npm run dev`: start local development server.
- `npm run build`: production build via Vite.
- `npm run preview`: preview built app locally.
- `npm run lint`: run ESLint across the project.
- `npm test`: run Vitest in watch mode.
- `npm run test:run`: run tests once (CI-friendly).
- `npm run test:coverage`: run tests with coverage output.

## Testing Guidelines
- Framework: Vitest (+ Testing Library for React UI tests).
- Add/update tests for behavior changes, validation, security, and API contracts.
- Prefer targeted runs while developing, e.g.:
  - `npm test -- tests/api/points-upload-url.test.js`
  - `npm test -- tests/security/secret-leak-scan.test.js`

## Evidence Commands
- `npm run lint`
- `npm run test:run`
- `npm run build`

## Pass Criteria
- `PASS` only if required debug commands complete successfully (exit code 0) for the requested scope.
- If evidence commands are not run or any required command fails, verdict must not be `PASS`.
