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

## Protocol Dependency Tree

Stored protocol dependency graph for command orchestration and `*_AGENTS.md` execution order:

```text
protocol-root
|-- independent-blocks
|   |-- STRUCTURE -> agents_protocol/STRUCTURE_AGENTS.md
|   |-- DESIGN -> agents_protocol/DESIGN_AGENTS.md
|   |-- SECURITY -> agents_protocol/SECURITY_AGENTS.md
|   |-- DEBUG -> agents_protocol/DEBUG_AGENTS.md
|   |-- PUSH -> agents_protocol/PUSH_AGENTS.md
|   |-- OPTIMIZATION -> agents_protocol/OPTIMIZATION_AGENTS.md
|   `-- COMPILATION -> agents_protocol/COMPILATION_AGENTS.md
|-- aggregate
|   `-- ALL -> [STRUCTURE, DESIGN, SECURITY, DEBUG, PUSH, OPTIMIZATION, COMPILATION]
`-- command-layer
    |-- check/fix tree-dependency -> [STRUCTURE, COMPILATION]
    |-- check/fix sizes -> [STRUCTURE, COMPILATION]
    |-- check/fix asymptotics -> [OPTIMIZATION, COMPILATION]
    `-- check/fix ~protocol -> independent-blocks (bottom-up) + command-layer checks from AGENTS_INDEX.md, then aggregate verdict
```

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
