# Security Guidelines

## Security & Configuration Tips
- Never commit real secrets (`.env*` except `.env.example`).
- Keep placeholders in `.env.example`; store real values in local/hosted env settings.
- If a requested change conflicts with `READMELLM.md` or appears risky/illogical, request explicit confirmation before implementation.

## Security Testing
- Add/update tests for security-related behavior.
- Prefer targeted security checks while developing, e.g.:
  - `npm test -- tests/security/secret-leak-scan.test.js`
