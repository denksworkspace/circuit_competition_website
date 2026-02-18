# Optimization Guidelines

## Rules
- Optimize only measured bottlenecks; keep behavior unchanged.
- Avoid accidental quadratic paths; use `Map`/`Set`/indexes for repeated lookups.
- Keep expensive work out of hot render/request paths.
- Prefer bounded concurrency; avoid races and non-deterministic async merges.
- Prevent over-fetching and duplicate requests.
- Validate optimization claims with concrete measurements or asymptotic evidence.

## Evidence Commands
- `AGENTS.md [<files>] asymptotics`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- Optional:
  - `time npm run test:run`
  - `time npm run build`

## Pass Criteria
- `PASS` only if optimization claims have evidence and quality gates pass.
- Missing metrics/evidence or failed quality gates => non-`PASS`.
