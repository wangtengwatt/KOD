## Context

The 2026-08-19 full-suite verification completed with 1295 passing tests, 54 skipped tests, and nine failures across six files. The Windows launcher core tests and TypeScript check pass, so these failures are recorded rather than silently changed during launcher work.

## Decisions

- Diagnose each failure against the intended current product behavior before editing production code.
- Prefer correcting stale or platform-specific tests when the implementation matches an approved KOD requirement.
- Use a separate implementation and review cycle for any production behavior change.
