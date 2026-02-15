# Security Guidelines

## Security & Configuration Tips
- Never commit real secrets (`.env*` except `.env.example`).
- Keep placeholders in `.env.example`; store real values in local/hosted env settings.
- If a requested change conflicts with `README.md` or appears risky/illogical, request explicit confirmation before implementation.

## Security Testing
- Add/update tests for security-related behavior.
- Prefer targeted security checks while developing, e.g.:
  - `npm test -- tests/security/secret-leak-scan.test.js`

## Evidence Commands
- `git ls-files '.env*'`
- `npm test -- tests/security/secret-leak-scan.test.js`
- `git ls-files | xargs rg -n "(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{35}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)" -S || true`

## Pass Criteria
- `PASS` only if tracked `.env*` policy is satisfied and secret-scan checks show no credential leaks.
- If evidence commands are not run or outputs indicate leaks/policy violations, verdict must not be `PASS`.
