# Repository Guidelines Index

## CLI Entrypoint
- CLI receives and parses only `<text-after-AGENTS.md>`.
- Any incoming user text must be treated as raw text for this index parser.
- If parsed intent is project mutation, this index must launch its `agents-cli` execution flow; otherwise it must return a direct user response without mutation execution.
- User-facing `AGENTS.md` prefix is not part of internal expanded commands.
- Protocol start requires `AGENTS.md init` via CLI and reading `AGENTS_INDEX.md` before executing further project-changing actions.
- CLI output contract:
1. `ok=false` + error + command suggestion.
2. `ok=true` + ordered `expandedCommands` + `executionTree`.
3. For successful `init`, output confirmation message: `AGENTS.md priority over project actions is set`.
- Agent executes `expandedCommands` sequentially.

## Command Surface (Classic Only)
- `[<targets>] check [<files>]`
- `[<targets>] fix [<files>]`
- `tree-dependency`
- `sizes [<files>]`
- `asymptotics [<files>]`
- `help`
- `add`
- `ask`
- `init`
- `quit`
- `~protocol`

## Important Simplification
- Flags are not part of canonical command surface in this file.
- CLI may accept flagged/raw user text, but expands to classic commands without flags.
- `{prompt}` is treated as instruction metadata and is not passed into `expandedCommands` command lines.

## Targets
- `STRUCTURE`, `DESIGN`, `SECURITY`, `DEBUG`, `PUSH`, `OPTIMIZATION`, `COMPILATION`, `ALL`
- `ALL` expands to all seven targets.

## Files
- `all` expands to deterministic repository file list (sorted, with internal directories excluded).

## Required Expansion
- `add` always expands to deterministic pipeline:
1. `add`
2. `[<expanded targets>] fix [<expanded files>]`
3. `[<expanded targets>] check [<expanded files>]`

## Required Execution Behavior
- Deterministic serial order by default.
- Parallel allowed only for independent evidence collection.
- For every valid command output:
1. execution tree
2. verdict per executed subcommand (`PASS|FAIL|SKIPPED`)
3. overall verdict
