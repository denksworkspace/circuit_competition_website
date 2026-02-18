# Compilation Guidelines

## Deterministic Compile Policy
- Non-`PASS` for unresolved imports, missing required paths, build errors, or protocol-level undefined behavior (non-deterministic outcomes for same inputs).
- Compile and path-resolution checks must be deterministic and repeatable.

## Evidence Commands
- `npm run build`
- `node -e "const fs=require('fs'); const req=['agents_protocol/STRUCTURE_AGENTS.md','agents_protocol/DESIGN_AGENTS.md','agents_protocol/SECURITY_AGENTS.md','agents_protocol/DEBUG_AGENTS.md','agents_protocol/PUSH_AGENTS.md','agents_protocol/OPTIMIZATION_AGENTS.md','agents_protocol/COMPILATION_AGENTS.md']; const missing=req.filter((p)=>!fs.existsSync(p)); if(missing.length){console.error('Missing paths:', missing.join(', ')); process.exit(1);} console.log('All protocol paths resolved');"`
- `npm run lint`

## Pass Criteria
- `PASS` only if build succeeds, required AGENTS paths resolve, and no deterministic-compile UB condition is detected.
- Missing evidence or any failure => non-`PASS`.
