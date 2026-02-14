# Push Guidelines

## Commit & Pull Request Guidelines
- Follow concise, imperative commit messages seen in history:
  - `Fix Neon bind error in upload settings schema init`
  - `Add roles, multi-file upload, upload logs...`
- PRs should include:
  - clear problem/solution summary,
  - affected paths/endpoints,
  - test evidence (what was run),
  - screenshots for UI changes.

## Evidence Commands
- `git status --short`
- `git branch --show-current`
- `git remote -v`
- `git log --oneline -n 5`

## Pass Criteria
- `PASS` only if commit/push prerequisites are satisfied (valid branch/remote, clean or intentionally staged state, and traceable commit context).
- If evidence commands are not run or outputs show push-readiness issues, verdict must not be `PASS`.
