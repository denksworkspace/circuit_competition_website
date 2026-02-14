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
