# Push Guidelines

## Rules
- Use concise imperative commit messages.
- PR must include: problem/solution summary, affected paths/endpoints, executed test evidence, UI screenshots when applicable.

## Evidence Commands
- `git status --short`
- `git branch --show-current`
- `git remote -v`
- `git log --oneline -n 5`

## Pass Criteria
- `PASS` only if push prerequisites are satisfied: valid branch/remote, intentional staged state, and traceable recent commit context.
- Missing evidence or push-readiness issues => non-`PASS`.
