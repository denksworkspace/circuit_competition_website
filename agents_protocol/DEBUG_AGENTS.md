# Debug Guidelines

## Standard Commands
- `npm run dev`
- `npm run build`
- `npm run preview`
- `npm run lint`
- `npm test`
- `npm run test:run`
- `npm run test:coverage`

## Testing Rules
- Framework: Vitest (+ Testing Library for React UI tests).
- Add/update tests for behavior, validation, security, and API contract changes.
- Prefer targeted tests while iterating.

## Evidence Commands
- `npm run lint`
- `npm run test:run`
- `npm run build`

## Pass Criteria
- `PASS` only if evidence commands complete successfully (exit code 0) for requested scope.
- Missing evidence or failed commands => non-`PASS`.
