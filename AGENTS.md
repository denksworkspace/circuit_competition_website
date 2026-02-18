## All Agents Bundle

`AGENTS.md` is the compact entrypoint. Canonical command semantics live in `AGENTS_INDEX.md`.

### Included Files
- `AGENTS_INDEX.md`
- `agents_protocol/STRUCTURE_AGENTS.md`
- `agents_protocol/DESIGN_AGENTS.md`
- `agents_protocol/SECURITY_AGENTS.md`
- `agents_protocol/DEBUG_AGENTS.md`
- `agents_protocol/PUSH_AGENTS.md`
- `agents_protocol/OPTIMIZATION_AGENTS.md`
- `agents_protocol/COMPILATION_AGENTS.md`

### Strict Execution Contract
- Protocol rules start only after submitting `AGENTS.md init` in CLI and reading `AGENTS_INDEX.md`, and stop after `AGENTS.md quit`.
- Local state file: `.agents/protocol_state.env` with `AGENTS_PROTOCOL_ACTIVE=0|1`.
- `AGENTS.md` reads this local value via shell output command (`echo` or OS equivalent) to decide whether protocol constraints are active.
- While protocol is active, `AGENTS.md` rules have higher priority than free-form user prompts about project mutations.
- While protocol is active, any incoming user text is treated as raw input for `AGENTS_INDEX.md` command interpretation.
- If interpreted intent is project mutation, `AGENTS_INDEX.md` must route execution through its `agents-cli` flow; if not, respond to the user without starting mutation pipeline.
- After successful `AGENTS.md init`, always output: `AGENTS.md priority over project actions is set`.
- Run only commands that start with `AGENTS.md`.
- For mutation commands (`add`, `fix`, state-changing commands), require exactly one flag: `-safe` or `-brute`.
- For `ask`, require exactly one flag: `-safe` or `-brute`.
- `-safe` is transactional: run `fix`, then `check`; keep changes only if all required verdicts are `PASS`.
- `add` always executes `fix`, then `check`.
- `add -safe` runs full protocol scope.
- `add -brute` runs reduced/default scope; when delegate is omitted, treat it as `-delegate [~a] [~f]`.
- `-strict` supports scope selectors: `-a` and `-f`.
- `-strict` defaults to `-a [ALL]` and `-f [all]` when selectors are omitted.
- `-strict -a [EXM1_AGENTS.md EXM2_AGENTS.md ...]` and `-strict -f [file1 file2 ...]` allow explicit scope narrowing.
- Always print an execution tree and verdicts for each executed subcommand plus one overall verdict.
- `PASS` is valid only when all required evidence commands for that subcommand were executed and matched expected results.
- Execute steps deterministically: serial order by default; parallel execution is allowed only for independent evidence collection.
- Do not run background jobs or fire-and-forget async tasks for protocol steps.
- Do not output console command lines unless the request uses `AGENTS.md ask`.

### Protocol Targets
- `STRUCTURE` -> `agents_protocol/STRUCTURE_AGENTS.md`
- `DESIGN` -> `agents_protocol/DESIGN_AGENTS.md`
- `SECURITY` -> `agents_protocol/SECURITY_AGENTS.md`
- `DEBUG` -> `agents_protocol/DEBUG_AGENTS.md`
- `PUSH` -> `agents_protocol/PUSH_AGENTS.md`
- `OPTIMIZATION` -> `agents_protocol/OPTIMIZATION_AGENTS.md`
- `COMPILATION` -> `agents_protocol/COMPILATION_AGENTS.md`
- `ALL` -> all seven protocol files above

### Reference
- Full syntax, shortcuts, expansions, and command-layer logic: `AGENTS_INDEX.md`.
