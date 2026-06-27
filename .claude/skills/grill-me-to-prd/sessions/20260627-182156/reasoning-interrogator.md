# Interrogator reasoning

## Settled decisions
- (All prior rounds settled — notifications, Advanced tab placement, settings list, apply semantics, data model, validation bounds, restart badge, stopped-server state, concurrency model.)
- Round 5 confirmations: clamp-on-blur silent to nearest bound (never raw); restart badge via process-loaded snapshot diff, clears on next start; broadcast disabled when stopped, toggle stays editable; concurrency = Difficulty/Game Rules model, no hard lock guard, optional soft "not current host" hint.

## Current focus
Final open thread — testing expectations given no test runner (only `npm run typecheck`): testability-by-design (pure helpers) + a pragmatic manual verification checklist.

## Open threads
- Confirm: extract pure helpers (clamp / buildNotifyMessage / shouldCountdown / diffFromLoadedSnapshot) for future unit-testability + manual checklist + typecheck as the v1 bar.
- Decide: add a real test runner (Vitest) now, or defer (keep code test-ready only)?

(Once this resolves, all threads closed → DONE next round.)
