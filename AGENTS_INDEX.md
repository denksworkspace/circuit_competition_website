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
