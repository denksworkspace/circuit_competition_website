# All Agents Bundle

This file aggregates all AGENTS documents in one place.

## Files Included
- `AGENTS_INDEX.md`
- `STRUCTURE_AGENTS.md`
- `DESIGN_AGENTS.md`
- `SECURITY_AGENTS.md`
- `DEBUG_AGENTS.md`
- `PUSH_AGENTS.md`
- `OPTIMIZATION_AGENTS.md`

---

## AGENTS_INDEX.md

# Repository Guidelines Index

This repository guidance is split into focused files:

- `STRUCTURE_AGENTS.md`: project structure and refactoring rules.
- `DESIGN_AGENTS.md`: coding style, naming conventions, and UI-facing review notes.
- `SECURITY_AGENTS.md`: secrets handling, risky-change confirmation, and security testing notes.
- `DEBUG_AGENTS.md`: local debug/build/test workflows and testing guidance.
- `PUSH_AGENTS.md`: commit and pull request requirements.
- `OPTIMIZATION_AGENTS.md`: runtime performance and scalability rules.
- `AGENTS.md`: single-file bundle with all AGENTS documents.

Read all files before making substantial changes.

## Command Interface

Use this command format:

`AGENTS.md [<targets>] <check|fix> [<files>]`

- `<targets>`: one or more of `STRUCTURE`, `DESIGN`, `SECURITY`, `DEBUG`, `PUSH`, `OPTIMIZATION`, or `ALL`.
- Shorthand mapping:
  - `STRUCTURE` -> `STRUCTURE_AGENTS.md`
  - `DESIGN` -> `DESIGN_AGENTS.md`
  - `SECURITY` -> `SECURITY_AGENTS.md`
  - `DEBUG` -> `DEBUG_AGENTS.md`
  - `PUSH` -> `PUSH_AGENTS.md`
  - `OPTIMIZATION` -> `OPTIMIZATION_AGENTS.md`
  - `ALL` -> all six files above
- `<check|fix>`:
  - `check`: verify compliance and report either violations or that everything is compliant.
  - `fix`: apply the selected rules to the selected files.
- `<files>`: file list to review/apply, or `all` for the whole repository.
- Expansion rule:
  - `AGENTS.md [ALL] check [X]` expands to `AGENTS.md [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION] check [X]`.
  - `AGENTS.md [ALL] fix [X]` expands to `AGENTS.md [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION] fix [X]`.
  - This means rules from `STRUCTURE_AGENTS.md`, `DESIGN_AGENTS.md`, `SECURITY_AGENTS.md`, `DEBUG_AGENTS.md`, `PUSH_AGENTS.md`, and `OPTIMIZATION_AGENTS.md` are all applied to the same `[X]`.
- If user input starts with `AGENTS.md` but has invalid syntax or unknown command, respond:
  - `No such command, but perhaps you meant: ...`
  - Include one or more closest valid command suggestions.
- After each valid `AGENTS.md` command, output an execution tree that shows:
  - which commands/subcommands were run,
  - in what order,
  - and which step produced the final user-visible result.
- After each valid `AGENTS.md` command, output explicit verdicts:
  - one verdict per executed AGENTS subcommand (e.g. `PASS`/`FAIL`/`SKIPPED` with short reason),
  - and one final overall verdict for the user command.
- Execution discipline rule:
  - Do not skip protocol-required AGENTS subcommands even if skipping seems faster or more optimal.
  - If a protocol says to run multiple AGENTS commands, execute each of them in order unless blocked by a hard error.
  - If blocked, report exactly which required command failed and why.

Example:

`AGENTS.md [DESIGN, DEBUG] check [all]`

Expansion example:

`AGENTS.md [ALL] check [file.jsx]` -> `AGENTS.md [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION] check [file.jsx]`

## Check Shortcut

Special command:

`AGENTS.md check`

Behavior:

- Run `AGENTS.md [ALL] check [all]`.

## Fix Shortcut

Special command:

`AGENTS.md fix`

Behavior:

- Run `AGENTS.md [ALL] fix [all]`.

## Future Simulation Check

Special command:

`AGENTS.md check -future [console commands]`

Behavior:

- Run `AGENTS.md [ALL] check -future [console commands]`.
- Evaluate protocol compliance as if the provided console commands will be executed in the future.
- Return verdicts against that simulated execution context.

## Future Simulation Fix

Special command:

`AGENTS.md fix -future [console commands]`

Behavior:

- Run `AGENTS.md [ALL] fix -future [console commands]`.
- Apply protocol fixes as if the provided console commands will be executed in the future.
- Return fix verdicts against that simulated execution context.

## Safety Push Command

Special command:

`AGENTS.md safety-push`

Behavior:

- Generate the console commands needed to push current changes to GitHub.
- Run `AGENTS.md check -future [console commands]` for those generated push commands.
- If any verdict is not `PASS`, run `AGENTS.md fix -future [console commands]`.
- Output the final recommended push command sequence for the developer.

## Tree Dependency Shortcut

Special command:

`AGENTS.md tree-dependency`

Behavior:

- Analyze project-level code relationships (imports/usages across files).
- Print a visualized console-style dependency tree that shows how files/modules are connected.
- Output should be tree-formatted (ASCII-style), for example:
  - root
  - |-- src/App.jsx
  - |   |-- src/components/app/ChartSection.jsx
  - |   `-- src/services/apiClient.js
  - `-- api/points.js

## File Sizes Shortcut

Special command:

`AGENTS.md [<files>] sizes`

Behavior:

- Print line counts for files listed in square brackets.
- Supports multiple files, e.g. `AGENTS.md [src/App.jsx, src/App.css] sizes`.
- Supports `all`, e.g. `AGENTS.md [all] sizes` (line counts for all project files).

## Asymptotics Shortcut

Special command:

`AGENTS.md [<files>] asymptotics`

Behavior:

- Print asymptotic complexity estimates for code in the selected files.
- Analysis must account for dependency context (imports/calls used by those files), not isolated file text only.
- Supports multiple files, e.g. `AGENTS.md [src/App.jsx, src/utils/pointUtils.js] asymptotics`.
- Supports `all`, e.g. `AGENTS.md [all] asymptotics`.

## Help Command

Special command:

`AGENTS.md help`

Behavior:

- Print the full list of currently available AGENTS commands with short descriptions.

## Prompt-Aware Help Command

Special command:

`AGENTS.md help [<prompt>]`

Behavior:

- Analyze the provided prompt intent.
- Print commands that are most relevant to solve the prompt.
- Include a short reason per suggested command.
- Example:
  - `AGENTS.md help [Improve asymptotics while preserving quality]`
  - should include commands such as `AGENTS.md [<files>] asymptotics`, `AGENTS.md [OPTIMIZATION] check [<files>]`, and `AGENTS.md [OPTIMIZATION] fix [<files>]` when applicable.

## Add Command

Special command:

`AGENTS.md add [<prompt>]`

Behavior:

- Take the user prompt as requested change to implement.
- First run `AGENTS.md help [<prompt>]`.
- Then execute/apply the commands suggested by that help result.
- After applying changes, run `AGENTS.md check`.
- If `check` reports problems, run `AGENTS.md fix`.

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
  - `AGENTS.md [ALL] fix [<affected files>]`
  - then `AGENTS.md check`
  - if issues remain, run `AGENTS.md fix`
- Do not output a separate report for each internal remediation command. Output only for the command explicitly requested by the developer.

---

## DESIGN_AGENTS.md

# Design Guidelines

## Coding Style & Naming Conventions
- Use ES modules and modern React function components.
- Keep code and comments in English only.
- Match existing formatting (4-space indentation, semicolons, double quotes).
- Naming patterns:
  - components: `PascalCase` (`CustomTooltip.jsx`),
  - utilities/services/helpers: `camelCase` file names (`apiClient.js`, `pointUtils.js`),
  - tests: `*.test.js` / `*.test.jsx`.
- Use ESLint (`npm run lint`) before opening a PR.

## UI Review Notes
- Include screenshots for UI changes in PRs.

---

## SECURITY_AGENTS.md

# Security Guidelines

## Security & Configuration Tips
- Never commit real secrets (`.env*` except `.env.example`).
- Keep placeholders in `.env.example`; store real values in local/hosted env settings.
- If a requested change conflicts with `READMELLM.md` or appears risky/illogical, request explicit confirmation before implementation.

## Security Testing
- Add/update tests for security-related behavior.
- Prefer targeted security checks while developing, e.g.:
  - `npm test -- tests/security/secret-leak-scan.test.js`

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
