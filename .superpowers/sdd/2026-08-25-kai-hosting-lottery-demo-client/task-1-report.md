# Task 1 report — hosting, lottery, and local-demo client contracts

## Scope delivered

- Added strict Zod schemas and TypeScript types for platform-lease accounting, admin SKU input/records, lottery eligibility/draws, and local-demo capability/session contracts.
- Added authenticated API functions for lease details, administrator SKU list/upsert, lottery list/draw, and local-demo capability/role sessions.
- Preserved identifier and financial precision as strings at the new contract boundary, rejecting numeric IDs/decimals and invalid server enums.
- Added account snapshot verification to authenticated compute requests, so a late response for a previous account rejects before it can update a caller.

## TDD evidence

- RED: `pnpm exec vitest run src/renderer/packages/computeCenter.hostingLottery.test.ts` failed 4/4 because the planned APIs and schemas did not exist.
- GREEN: the same suite passed 4/4 after the minimal contract implementation.

## Verification

- `pnpm exec vitest run src/renderer/packages/computeCenter.hostingLottery.test.ts src/renderer/packages/computeCenter.rewards.test.ts src/renderer/packages/computeCenter.marketOrigin.test.ts` — 20/20 passed.
- `pnpm run check` — passed.
- `pnpm exec biome check src/renderer/packages/computeCenter.ts src/renderer/packages/computeCenter.hostingLottery.test.ts` — passed.
- `npx --yes @fission-ai/openspec validate complete-kai-hosting-prediction-lottery-client --strict` — passed.
- `git diff --check` — passed.
- Full `pnpm run test` baseline: 1684 passed, 54 skipped, 6 unrelated failures in defaults language expectation, migration initialization, Windows skill path separators, parse-link tool selection, and missing Kod relay configuration (two tests). No failure involved the changed compute contracts.

## Scope and dependencies

- Changed only `src/renderer/packages/computeCenter.ts`, its focused test, and this report; protected website frontend/assets and KAI branding were not touched.
- The local-demo routes are pinned to the approved platform plan: `GET /api/compute/local-demo/capability` and `POST /api/compute/local-demo/session/{role}`. The backend local-demo implementation was not present during this task, so integration must confirm its `enabled`, `roles`, and `{ token, refreshToken, accountId }` response shapes.

## Review round 1

- Added strict `LotteryHistory` decoding and authenticated `GET /api/compute/lottery/history`, preserving every ID and decimal as a string and accepting a nullable string reward-ledger ID.
- Aligned administrator SKU input boundaries with the reviewed backend contract: positive capacity/duration/price fields, duration/deadline maxima, blank CPU/network descriptions, and pre-request rejection.
- Added runtime Zod parsing for lottery eligibility status so an invalid status cannot issue a request.
- Route ruling: `/api/compute/local-demo/*` is authoritative. The platform design's API-placement section still says `/api/local-demo/*`; the reviewed implementation plan and this client intentionally retain the `/api/compute/local-demo/*` prefix.
- Review TDD: the expanded focused suite produced five expected failures before implementation, then passed 8/8 after the contract fixes.
