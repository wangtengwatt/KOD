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

Task 2 contract-alignment fix: explicit server allocation, backend SKU normalization, and Java-int limits implemented in edfdfb3; focused 24/24, related 49/49, type/Biome/OpenSpec/build clean.

Task 2: fix round 1/5 (4 addressed, 0 open; backend f34969f..5ea9838; client edffdd7..edfdfb3)

Task 2: complete (client d1b30f5..edfdfb3, backend contract 5ea9838, independent re-review clean)

Task 3 TDD: RED 3/3 new financial/log/account-switch cases; GREEN focused 22/22 and related suites clean.

Task 3 verification: TypeScript, changed Biome, strict OpenSpec, production build, diff/protected/secret scans clean; full 1,707 pass / 54 skip with the same 6 unrelated baseline failures.

Task 3: implementation complete (feature range ff3f1c0..4c16444); independent re-review pending.

Task 4 Ruling: the missing standalone `task-4-brief.md` was a coordination-record omission, not an implementation gate; the approved client plan Task 4, `settlement-lottery-client` OpenSpec, approved design, and parent acceptance message were the authoritative boundary.

Task 4 TDD: RED confirmed missing modal/panel/route behavior; GREEN focused 10/10 and related lottery/hosting/inventory/routes 65/65.

Task 4 verification: TypeScript, changed Biome, strict OpenSpec, production build, diff/protected/secret scans clean; full 1,717 pass / 54 skip with the same 6 unrelated baseline failures.

Task 4: implementation complete (feature range 4922497..5fb5026); independent re-review pending.

Task 3 review fix round 1: platform lease IDs and financial values are strict strings, raw lease prices retain full service precision, and failed detail requests have a retry-success regression; focused 39/39 and related 79/79 pass.

Task 3 review fix round 1 verification: TypeScript, changed Biome, strict OpenSpec, and production build pass; full 1,729 pass / 54 skip with the same 6 unrelated baseline failures; exact feature range 10cdd53..e0003a4.

Task 4 review fix round 1: draw requests now have a 15-second bounded deadline and AbortSignal cancellation, retain their idempotency request ID, restore a safe close path after timeout, abort on account change, announce and focus the authoritative result, change the qualification badge to claimed, and explain zero bases by source contribution.

Task 4 review fix round 1 verification: focused 19/19 and related 63/63 pass; TypeScript, changed Biome, strict OpenSpec, production build, diff/protected/secret/local-random scans pass; full 1,731 pass / 54 skip with the same 6 unrelated baseline failures; exact feature range 39a6243..de9926f.
