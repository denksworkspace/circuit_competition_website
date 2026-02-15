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
