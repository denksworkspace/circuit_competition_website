# All Agents Bundle

This file aggregates all AGENTS documents in one place.

## Files Included
- `AGENTS_INDEX.md`
- `agents_protocol/STRUCTURE_AGENTS.md`
- `agents_protocol/DESIGN_AGENTS.md`
- `agents_protocol/SECURITY_AGENTS.md`
- `agents_protocol/DEBUG_AGENTS.md`
- `agents_protocol/PUSH_AGENTS.md`
- `agents_protocol/OPTIMIZATION_AGENTS.md`
- `agents_protocol/COMPILATION_AGENTS.md`

---

## AGENTS_INDEX.md

# Repository Guidelines Index

This repository guidance is split into focused files:

- `agents_protocol/STRUCTURE_AGENTS.md`: project structure and refactoring rules.
- `agents_protocol/DESIGN_AGENTS.md`: coding style, naming conventions, and UI-facing review notes.
- `agents_protocol/SECURITY_AGENTS.md`: secrets handling, risky-change confirmation, and security testing notes.
- `agents_protocol/DEBUG_AGENTS.md`: local debug/build/test workflows and testing guidance.
- `agents_protocol/PUSH_AGENTS.md`: commit and pull request requirements.
- `agents_protocol/OPTIMIZATION_AGENTS.md`: runtime performance and scalability rules.
- `agents_protocol/COMPILATION_AGENTS.md`: deterministic compile-time and dependency resolution checks.
- `AGENTS.md`: single-file bundle with all AGENTS documents.

Read all files before making substantial changes.

## Command Interface

Use this command format:

`AGENTS.md [<targets>] <check|fix> [<files>] <prompt-input> [-safe|-brute] [-ignore [<agents>] [<files>]] [-delegate [~a] [~f]] [-strict]`

or command-scoped mode:

`AGENTS.md <check|fix> <command> <prompt-input> [-safe|-brute] [-ignore [<agents>] [<files>]] [-delegate [~a] [~f]] [-strict]`

- `<targets>`: one or more of `STRUCTURE`, `DESIGN`, `SECURITY`, `DEBUG`, `PUSH`, `OPTIMIZATION`, `COMPILATION`, or `ALL`.
- Shorthand mapping:
  - `STRUCTURE` -> `agents_protocol/STRUCTURE_AGENTS.md`
  - `DESIGN` -> `agents_protocol/DESIGN_AGENTS.md`
  - `SECURITY` -> `agents_protocol/SECURITY_AGENTS.md`
  - `DEBUG` -> `agents_protocol/DEBUG_AGENTS.md`
  - `PUSH` -> `agents_protocol/PUSH_AGENTS.md`
  - `OPTIMIZATION` -> `agents_protocol/OPTIMIZATION_AGENTS.md`
  - `COMPILATION` -> `agents_protocol/COMPILATION_AGENTS.md`
  - `ALL` -> all seven files above
- `<check|fix>`:
  - `check`: verify compliance and report either violations or that everything is compliant.
  - `fix`: apply the selected rules to the selected files.
- `<files>`: file list to review/apply, or `all` for the whole repository.
- `<command>`: one of `tree-dependency`, `sizes`, `asymptotics`, `help`, `add`, `check`, `fix`, `check -future`, `fix -future`, `~protocol`.
- `<prompt-input>`: optional prompt input appended at the end of any `AGENTS.md` command:
  - inline form: `{prompt}`,
  - file form: `[path/to/prompt.txt]` (must be a `.txt` file path).
- `-safe`: optional transactional safety mode for any command:
  - first run `AGENTS.md fix`,
  - then run `AGENTS.md check`,
  - if all verdicts are `PASS`, keep changes,
  - if any verdict is not `PASS`, rollback all changes applied by the current command execution and output rollback reason.
- `-brute`: explicit non-safety mode:
  - apply requested changes without transactional pre-check rollback flow,
  - use only when the operator intentionally bypasses safety protocol.
- `-ignore [<agents>] [<files>]`: optional global exclusions for any command tree:
  - first bracket: `*_AGENTS.md` entries to skip for the whole command tree,
  - second bracket: files to skip for the whole command tree,
  - supports `*` in each bracket.
- `-delegate [~a] [~f]`: optional auto-selection mode:
  - `~a`: agent decides which `*_AGENTS.md` protocols to run for the command,
  - `~f`: agent decides which files to include for the command,
  - both together (`-delegate [~a] [~f]`) let agent choose both protocol set and file scope.
  - examples:
    - `-delegate [~f]`: agent selects file scope,
    - `-delegate [~a] [~f]`: agent selects both protocol set and file scope.
- `-delegate` precedence:
  - when `-delegate [~a]` is present, explicit protocol target lists may be reduced by agent decision.
  - when `-delegate [~f]` is present, explicit file lists may be reduced by agent decision.
  - `-ignore` still applies as hard exclusion after delegate selection.
- Default execution rule (when `-delegate` is not provided):
  - agent must execute exactly what protocol specifies, no extra and no omitted steps.
- `-strict`: explicit strict protocol mode:
  - enforce exact protocol execution (`no more, no less`),
  - reject opportunistic or inferred extra steps that are not in protocol.
- Flag consistency rules:
  - `-safe` and `-brute` are mutually exclusive and must not appear together in one command.
  - Command flags and expansions must not contradict each other or create execution cycles.
  - For mutation commands (`fix`, `add`, and any state-changing command), exactly one of `-safe` or `-brute` must be present; otherwise execution is blocked.
- Preflight risk rule (when `-safe` is not present):
  - analyze prompt impact first,
  - if impact appears high, recommend rerun with `-safe`,
  - if operator still wants to bypass safety protocol, require explicit `-brute` before any mutation is executed.
- Command-scoped expansion:
  - `AGENTS.md check tree-dependency` is equivalent to `AGENTS.md [STRUCTURE, COMPILATION] check [all]`.
  - `AGENTS.md fix tree-dependency` is equivalent to `AGENTS.md [STRUCTURE, COMPILATION] fix [all]`.
  - `AGENTS.md check asymptotics` is equivalent to `AGENTS.md [OPTIMIZATION, COMPILATION] check [all]`.
  - `AGENTS.md fix asymptotics` is equivalent to `AGENTS.md [OPTIMIZATION, COMPILATION] fix [all]`.
  - `AGENTS.md check sizes` is equivalent to `AGENTS.md [STRUCTURE, COMPILATION] check [all]`.
  - `AGENTS.md fix sizes` is equivalent to `AGENTS.md [STRUCTURE, COMPILATION] fix [all]`.
  - `AGENTS.md check ~protocol` runs full protocol check by dependency order from independent blocks upward and includes command-layer checks defined in `AGENTS_INDEX.md`.
  - `AGENTS.md fix ~protocol` runs full protocol fix by dependency order from independent blocks upward and includes command-layer fixes defined in `AGENTS_INDEX.md`.
- Expansion rule:
  - `AGENTS.md [ALL] check [X]` expands to `AGENTS.md [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION, COMPILATION] check [X]`.
  - `AGENTS.md [ALL] fix [X]` expands to `AGENTS.md [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION, COMPILATION] fix [X]`.
  - This means rules from `agents_protocol/STRUCTURE_AGENTS.md`, `agents_protocol/DESIGN_AGENTS.md`, `agents_protocol/SECURITY_AGENTS.md`, `agents_protocol/DEBUG_AGENTS.md`, `agents_protocol/PUSH_AGENTS.md`, `agents_protocol/OPTIMIZATION_AGENTS.md`, and `agents_protocol/COMPILATION_AGENTS.md` are all applied to the same `[X]`.
- If user input starts with `AGENTS.md` but has invalid syntax or unknown command, respond:
  - `No such command, but perhaps you meant: ...`
  - Include one or more closest valid command suggestions.
- Safety gate for mutation requests:
  - If user asks to change/modify code, config, docs, or project state without starting the request with `AGENTS.md`, refuse execution.
  - Response must say changes cannot be applied due to safety constraints.
  - Response must recommend: `AGENTS.md help` to continue safely with the project protocol.
  - Additionally, if mutation request lacks both `-safe` and `-brute`, refuse execution until one is provided.
- After each valid `AGENTS.md` command, output an execution tree that shows:
  - which commands/subcommands were run,
  - in what order,
  - and which step produced the final user-visible result.
- After each valid `AGENTS.md` command, output explicit verdicts:
  - one verdict per executed AGENTS subcommand (e.g. `PASS`/`FAIL`/`SKIPPED` with short reason),
  - and one final overall verdict for the user command.
- Evidence gate for verdicts:
  - `PASS` is allowed only if required evidence commands for that subcommand were executed and matched expected results.
  - If evidence is missing or results do not match expectations, verdict must not be `PASS` (`FAIL` or `SKIPPED` with reason).
- Execution discipline rule:
  - Do not skip protocol-required AGENTS subcommands even if skipping seems faster or more optimal.
  - If a protocol says to run multiple AGENTS commands, execute each of them in order unless blocked by a hard error.
  - If blocked, report exactly which required command failed and why.

Example:

`AGENTS.md [DESIGN, DEBUG] check [all] {prompt} -safe -ignore [SECURITY_AGENTS.md] [README.md]`

Command-scoped example:

`AGENTS.md fix tree-dependency {prompt}`

Expansion example:

`AGENTS.md [ALL] check [file.jsx] {prompt}` -> `AGENTS.md [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION, COMPILATION] check [file.jsx] {prompt}`

Prompt file example:

`AGENTS.md add [prompts/refactor_protocol.txt] -safe`

Strict mode example:

`AGENTS.md check ~protocol {validate exact run} -strict`

## Check Shortcut

Special command:

`AGENTS.md check [<command>] <prompt-input>`

Behavior:

- If `<command>` is omitted, run `AGENTS.md [ALL] check [all]`.
- If `<command>` is provided, run command-scoped check expansion for that command.
- If `<command>` is `~protocol`, evaluate protocol blocks in dependency order from independent blocks upward and include command-layer checks from `AGENTS_INDEX.md`.

## Fix Shortcut

Special command:

`AGENTS.md fix [<command>] <prompt-input>`

Behavior:

- If `<command>` is omitted, run `AGENTS.md [ALL] fix [all]`.
- If `<command>` is provided, run command-scoped fix expansion for that command.
- If `<command>` is `~protocol`, apply fixes in dependency order from independent blocks upward and include command-layer fixes from `AGENTS_INDEX.md`.

## Future Simulation Check

Special command:

`AGENTS.md check -future [console commands] <prompt-input>`

Behavior:

- Run `AGENTS.md [ALL] check -future [console commands]`.
- Evaluate protocol compliance as if the provided console commands will be executed in the future.
- Return verdicts against that simulated execution context.

## Future Simulation Fix

Special command:

`AGENTS.md fix -future [console commands] <prompt-input>`

Behavior:

- Run `AGENTS.md [ALL] fix -future [console commands]`.
- Apply protocol fixes as if the provided console commands will be executed in the future.
- Return fix verdicts against that simulated execution context.

## Tree Dependency Shortcut

Special command:

`AGENTS.md tree-dependency {prompt}`

Behavior:

- Analyze project-level code relationships (imports/usages across files).
- Include protocol-file dependency references (`AGENTS.md`, `AGENTS_INDEX.md`, `agents_protocol/*.md`) in tree output.
- If tree output contains any `|?? ... (missing path)` entry, verdict for `tree-dependency` must be `FAIL`.
- Print a visualized console-style dependency tree that shows how files/modules are connected.
- Output should be tree-formatted (ASCII-style), for example:
  - root
  - |-- src/App.jsx
  - |   |-- src/components/app/ChartSection.jsx
  - |   `-- src/services/apiClient.js
  - `-- api/points.js

## File Sizes Shortcut

Special command:

`AGENTS.md [<files>] sizes {prompt}`

Behavior:

- Print line counts for files listed in square brackets.
- Supports multiple files, e.g. `AGENTS.md [src/App.jsx, src/App.css] sizes {prompt}`.
- Supports `all`, e.g. `AGENTS.md [all] sizes {prompt}` (line counts for all project files).

## Asymptotics Shortcut

Special command:

`AGENTS.md [<files>] asymptotics {prompt}`

Behavior:

- Print asymptotic complexity estimates for code in the selected files.
- Analysis must account for dependency context (imports/calls used by those files), not isolated file text only.
- Supports multiple files, e.g. `AGENTS.md [src/App.jsx, src/utils/pointUtils.js] asymptotics {prompt}`.
- Supports `all`, e.g. `AGENTS.md [all] asymptotics {prompt}`.

## Help Command

Special command:

`AGENTS.md help {prompt}`
or
`AGENTS.md help [path/to/prompt.txt]`

Behavior:

- Print the full list of currently available AGENTS commands with short descriptions.

## Prompt-Aware Help Command

Special command:

`AGENTS.md help {prompt}`

Behavior:

- Analyze the provided prompt intent.
- Print commands that are most relevant to solve the prompt.
- Include a short reason per suggested command.
- Example:
  - `AGENTS.md help {Improve asymptotics while preserving quality}`
  - should include commands such as `AGENTS.md [<files>] asymptotics`, `AGENTS.md [OPTIMIZATION] check [<files>]`, and `AGENTS.md [OPTIMIZATION] fix [<files>]` when applicable.

## Add Command

Special command:

`AGENTS.md add <prompt-input>`

Behavior:

- Take the user prompt as requested change to implement.
- First run `AGENTS.md help <prompt-input>`.
- Then execute/apply the commands suggested by that help result.
- No automatic `AGENTS.md check`/`AGENTS.md fix` is required unless `-safe` is explicitly used.

---

## STRUCTURE_AGENTS.md

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
  - `AGENTS.md [ALL] fix [<affected files>] -safe`
- Do not output a separate report for each internal remediation command. Output only for the command explicitly requested by the developer.

## Evidence Commands
- `find src api tests -maxdepth 4 -type d | sort`
- `rg --files src api tests`
- `AGENTS.md tree-dependency`
- `npm run lint`

## Pass Criteria
- `PASS` only if structure paths exist as expected, dependency tree output has no `|?? ... (missing path)` entries, and no structural violations are reported by dependency tree/lint checks.
- If evidence commands are not run or outputs contradict structure rules, verdict must not be `PASS`.

---

## DESIGN_AGENTS.md

# Design Guidelines

## Coding Style & Naming Conventions
- Use ES modules and modern React function components.
- Keep code and comments in English only.
- Match existing formatting (4-space indentation, semicolons, double quotes).
- Naming patterns:
  - components: `PascalCase` (e.g. `src/components/CustomTooltip.jsx`),
  - utilities/services/helpers: `camelCase` file names (e.g. `src/services/apiClient.js`, `src/utils/pointUtils.js`),
  - tests: `*.test.js` / `*.test.jsx`.
- Use ESLint (`npm run lint`) before opening a PR.

## UI Review Notes
- Include screenshots for UI changes in PRs.

## Evidence Commands
- `npm run lint`
- `git ls-files | xargs rg -nP "\\p{Cyrillic}" -S || true`
- `rg --files src/components src/utils src/services tests | sort`
- `rg -n "(\\bAGETNS\\b|\\bAGNETS\\b|\\bAGNTS\\b|\\bAENTS\\b)" AGENTS.md AGENTS_INDEX.md agents_protocol/*.md | rg -v "e.g.,|typo/context scan|\\(e\\.g\\." || true`

## Pass Criteria
- `PASS` only if lint succeeds, non-English code/comment scan has no hits, naming/path conventions are not violated, and typo/context scan has no critical hits for protocol keywords.
- If evidence commands are not run or outputs show violations, verdict must not be `PASS`.

---

## SECURITY_AGENTS.md

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

---

## COMPILATION_AGENTS.md

# Compilation Guidelines

## Deterministic Compile Policy
- The protocol must return non-`PASS` when deterministic compile or resolution guarantees are violated.
- Treat each of the following as non-`PASS`:
  - unresolved imports or missing dependencies,
  - missing required file paths referenced by the protocol,
  - build/compile errors in selected scope,
  - UB (undefined behavior) in protocol sense: non-deterministic logic that can produce inconsistent outcomes for the same inputs.

## Compile Verification Strategy
- Prefer deterministic commands with stable output for the same source state.
- For application-level compilation, use the project build command.
- For protocol-level path resolution checks, verify required AGENTS files exist at referenced paths.

## Evidence Commands
- `npm run build`
- `node -e "const fs=require('fs'); const req=['agents_protocol/STRUCTURE_AGENTS.md','agents_protocol/DESIGN_AGENTS.md','agents_protocol/SECURITY_AGENTS.md','agents_protocol/DEBUG_AGENTS.md','agents_protocol/PUSH_AGENTS.md','agents_protocol/OPTIMIZATION_AGENTS.md','agents_protocol/COMPILATION_AGENTS.md']; const missing=req.filter((p)=>!fs.existsSync(p)); if(missing.length){console.error('Missing paths:', missing.join(', ')); process.exit(1);} console.log('All protocol paths resolved');"`
- `npm run lint`

## Pass Criteria
- `PASS` only if compile/build commands succeed, required AGENTS paths resolve, and no deterministic-compile UB condition is detected.
- If evidence commands are not run or any check fails, verdict must not be `PASS`.

---

## DEBUG_AGENTS.md

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

---

## PUSH_AGENTS.md

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

---

## OPTIMIZATION_AGENTS.md

# Optimization Guidelines

## Performance Mindset
- Optimize for measurable bottlenecks, not assumptions.
- Prefer simple and predictable solutions before advanced micro-optimizations.
- Keep behavior and correctness unchanged while optimizing.

## Algorithmic Complexity
- Consider time and space complexity for every non-trivial loop/path.
- Avoid accidental quadratic behavior on growing datasets (nested scans, repeated filtering in loops, repeated sorting).
- Precompute/reuse derived structures (`Map`, `Set`, indexes, memoized values) when repeated lookups are required.
- Push expensive operations out of hot paths and render loops.
- For frontend lists/charts, avoid recomputing large transformations unless inputs changed.

## React/Frontend Runtime
- Use memoization (`useMemo`, `useCallback`) only where it removes real repeated work.
- Keep component boundaries small enough to reduce unnecessary re-renders.
- Avoid passing unstable inline objects/functions into deep trees when it causes render churn.
- Batch state updates where possible and avoid update cascades.
- Prefer pagination/virtualization for large lists.

## Parallelism and Concurrency
- Parallelize independent I/O-bound work (multiple reads/requests) instead of serial waiting.
- Use bounded concurrency for bulk operations to avoid resource spikes.
- Avoid race conditions when updating shared state; ensure deterministic merge/update order.
- Use cancellation/abort signals for stale async work in UI flows.

## Network and API Efficiency
- Minimize request count: combine compatible calls, avoid duplicate fetches.
- Avoid over-fetching payloads; request only fields needed by the current feature.
- Reuse cached data where safe and invalidate cache intentionally.
- Add timeouts/retries only when appropriate, and avoid retry storms.
- Prefer server-side filtering/pagination over fetching full datasets and filtering on client.

## Database and Backend Paths
- Avoid N+1 query patterns; fetch related data in set-based queries.
- Add/select indexes for frequent filter/join/order keys.
- Keep transactional scope minimal and explicit.
- Avoid repeated schema checks/initialization inside hot request paths when not needed.

## Memory and Resource Use
- Avoid retaining large temporary arrays/objects longer than needed.
- Stream or chunk large workloads where possible.
- Clean up timers/listeners/subscriptions to prevent leaks.

## Verification Requirements
- Validate optimizations with evidence: benchmark numbers, profiling snapshots, or before/after timings.
- Re-run lint/tests after optimization changes.
- Document meaningful tradeoffs (readability vs speed, memory vs CPU, latency vs throughput).

## Evidence Commands
- `AGENTS.md [<files>] asymptotics`
- `npm run lint`
- `npm run test:run`
- `npm run build`
- Optional metric capture (when applicable):
  - `time npm run test:run`
  - `time npm run build`

## Pass Criteria
- `PASS` only if optimization claims are backed by concrete evidence (asymptotic analysis and/or measurable before-after metrics) and quality gates pass.
- If evidence commands are not run, metrics are missing for performance claims, or quality gates fail, verdict must not be `PASS`.
