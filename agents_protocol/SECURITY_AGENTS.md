# Security Guidelines

## Rules
- Never commit real secrets.
- Track `.env.example` only; real `.env*` values stay out of git.
- If requested change conflicts with `README.md` or seems risky/illogical, request explicit confirmation.
- Add/update security tests for security-relevant behavior changes.

## Evidence Commands
- `git ls-files '.env*'`
- `npm test -- tests/security/secret-leak-scan.test.js`
- `git ls-files | xargs rg -n "(AKIA[0-9A-Z]{16}|AIza[0-9A-Za-z-_]{35}|-----BEGIN (RSA|EC|OPENSSH) PRIVATE KEY-----)" -S || true`

## Pass Criteria
- `PASS` only if tracked `.env*` policy is satisfied and leak scans are clean.
- Missing evidence or detected leaks => non-`PASS`.
