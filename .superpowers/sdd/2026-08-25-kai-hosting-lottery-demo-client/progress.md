# SDD ledger — plan: docs/superpowers/plans/2026-08-25-kai-hosting-lottery-demo-client.md

## Preflight interface scan

| Tasks | Shared interface/file | Finding |
|---|---|---|
| 1 / 2 / 3 / 4 / 5 | `computeCenter.ts` | Clean: Task 1 is the sole contract producer for all later UI. |
| 2 / 4 / 5 | `compute-center.tsx` | Clean: distinct admin, lottery, and local-demo surfaces within existing shell. |
| 3 / 4 | query invalidation | Clean: identity-scoped keys prevent cross-account callbacks. |
| 4 / 5 | session switch | Clean: pending modal/workflows are reset after complete session replacement. |
| 1 | schemas/API tests | Clean: exact strings and account ownership match server authority. |
| 2 | admin component | Clean: no website assets and existing style primitives only. |
| 3 | hosting panel | Clean: summary plus lazy order logs matches compact UX. |
| 4 | lottery UI | Clean: animation follows server outcome; dismissal does not consume. |
| 5 | demo UI | Clean: loopback and server capability are both required. |
| 6 | verification | Clean: launcher path/icon and protected site/logo are checked. |

Task 1 Ruling: `/api/compute/local-demo/*` is authoritative because both approved implementation plans use it and the feature belongs under the authenticated compute controller; the earlier design line `/api/local-demo/*` is superseded. Cost if wrong: backend and client will be consistently implemented but an external consumer expecting the older prefix would need a compatibility alias.

Task 1 Ruling: lottery history is `GET /api/compute/lottery/history`, matching the approved platform design's sibling `/eligibilities`, `/draw`, and `/history` endpoints. Cost if wrong: a different nested URL would require a backward-compatible alias before release.

Task 1 Review Round 2: administrator SKU `ramGb` and `storageGb` mirror the backend's `value < 0` rejection boundary. Zero is valid in both request and response contracts; negative values are rejected client-side before any request.

Task 1: fix round 1/5 (3 addressed, 1 open; commits 3d6d7f0..38ad96a)

Task 1: fix round 2/5 (1 addressed, 0 open; commits 38ad96a..9620225)

Task 1: complete (commits 9f28c3b..9620225, independent re-review clean)
