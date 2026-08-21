# Verification

Verified on 2026-08-21 (Asia/Shanghai) in Windows PowerShell, branch `feature/reward-referral-hosting-client`, client range `f97c615..HEAD`, with Node `v22.23.2` and Corepack pnpm `10.33.0`. The paired backend framework was checked at `D:\watt\kod-ai-portal-video-proxy`, backend range `f37e8cb..HEAD`, on Java 21. No real upstream video credential was supplied or required.

## Video security and closed-loop evidence

- `corepack pnpm exec vitest run src/renderer/api/videoGeneration.test.ts src/renderer/stores/videoGenerationActions.test.ts` passed: 2 files, 7 tests. The API tests prove requests use only the authenticated KOD origin and generation parameters. The action tests prove a logged-out client stops before availability, a backend `available: false` reason is surfaced before local task creation or submission, and an available backend follows submit, status polling, authenticated content download, and local result storage without an upstream URL or key. A mutation run that temporarily bypassed the availability guard failed the unavailable test because the action incorrectly resolved; restoring the guard returned 7/7 passing.
- The video creator route catches the action error into its visible form alert. Therefore the backend's unavailable reason is the UI reason; there is no silent fallback path.
- The paired backend production framework remains `VideoGenerationController` -> `VideoGenerationService` -> `VideoUpstreamGateway`. Its API key is server configuration only. `VideoGenerationServiceTest.missingServerKeyReportsUnavailableAndNeverContactsAnUpstream` covers fail-closed behavior with `verifyNoInteractions(gateway)`.
- The host has no global `mvn`, and the repository's POSIX `mvnw` is not directly executable by PowerShell. Running the seven concrete backend video test classes through the wrapper main class succeeded: `HttpVideoUpstreamGatewayTest,VideoGenerationBillingServiceTest,VideoGenerationControllerTest,VideoGenerationPropertiesTest,VideoGenerationRepositoryTest,VideoGenerationSchemaInitializerTest,VideoGenerationServiceTest`; 19 tests, 0 failures, 0 errors, 0 skipped, `BUILD SUCCESS`. This covers both missing server key and configured proxy behavior without a real key.

## Client feature verification

- The final combined feature/video command covered 11 files and passed 113 tests. Excluding the two video files (7 tests), the feature set now covers 9 files and 106 tests, including both direct-account-switch cache regressions.
- `corepack pnpm run check` passed with exit code 0 and no TypeScript diagnostics.
- `corepack pnpm run build` passed after 5,352 main modules, 82 preload modules, and 15,029 renderer modules were transformed. Existing Rollup circular-chunk, dynamic/static import, large-chunk, eval, and stale Browserslist warnings remain non-fatal.
- The first build attempt found a branch regression: the two new compute-center tests were placed directly in `src/renderer/routes`, so TanStack Router generated production route imports for them and failed because test modules do not export `Route`. Moving both tests into the router-ignored `src/renderer/routes/-test` directory preserved 3/3 route tests and made the subsequent full build pass.
- `corepack pnpm exec biome check ...` over the final Task 5 target set passed: 11 files checked, no fixes applied.
- `npx --yes @fission-ai/openspec validate complete-reward-referral-hosting-client --strict` passed: `Change 'complete-reward-referral-hosting-client' is valid`.

## Full-suite baseline classification

`corepack pnpm run test` was run again after the second independent-review repairs, without a concurrent build. The final result was stable: 154 test files, 147 passed, 5 failed, 2 skipped; 1,518 tests, 1,458 passed, 6 failed, 54 skipped. All six failures are baseline, not regressions from `f97c615..HEAD`: none of the failing tests, their production files, test configuration, `package.json`, or `pnpm-lock.yaml` changed in this branch, and `openspec/changes/stabilize-existing-test-baseline` already records these Windows/stale-expectation categories. The previously observed transient `store-node.test.ts` `EBUSY` did not recur.

| Failure | Classification |
| --- | --- |
| `src/shared/defaults.test.ts` expects `en`, receives the approved KOD default `zh-Hans` | Existing stale default-language expectation |
| `src/renderer/stores/migration.test.ts` expects `initData` on first run | Existing migration mock/expectation mismatch |
| `src/main/skills/__tests__/discovery.test.ts` expects POSIX `/skills/...`, receives Windows `\\skills\\...` | Existing Windows path assumption |
| `src/renderer/stores/session/tools-builder.test.ts` expects `parse_link` | Existing web-search tool/mock expectation mismatch |
| Two `src/shared/providers/definitions/models/chatboxai.test.ts` cases expect the removed upstream fallback | Existing stale relay fallback expectations; production intentionally requires configured KOD relay login |

`corepack pnpm run lint` also remains nonzero on the untouched repository baseline: 921 files checked, 13 errors and 1,009 warnings. Re-running with `--diagnostic-level=error --max-diagnostics=none` placed all 13 errors in unchanged files (`TopPSlider.tsx`, `SessionList.tsx`, `RemoteDialogWindow.tsx`, `ios_web_preview_init.ts`, `static/index.css`, and `chatboxai.ts`). The 11-file task-targeted Biome check is clean.

A final post-commit full-suite run executed concurrently with the production build reproduced the six classified failures and also hit one Windows `EBUSY` while `store-node.test.ts` wrote its newly-created temporary `config.json` (154 files: 146 passed, 6 failed, 2 skipped; 1,456 tests passed, 7 failed, 54 skipped). Neither that test, `store-node.ts`, nor dependency/config files differ from `f97c615`. Two immediate isolated reruns of `store-node.test.ts` both passed 1/1, so this additional failure is a transient Windows file-lock baseline rather than a branch regression. The concurrent production build itself passed with the same 5,352/82/15,029 transformed-module counts and non-fatal baseline warnings described above.

## Independent cross-branch review repair

The required read-only review covered client `f97c615..9cc3b8b` and backend `f37e8cb..efb43df`. It found one Critical and four Important gaps. Each was reproduced with a failing regression test before repair:

- account changes now synchronously cancel and remove both `wallet` and `compute` roots, while referral, account, ledger, notification, and platform-lease keys include the normalized account identity;
- rewarded-ad progress now queues the highest observed media second and drains signed one-second receipts sequentially, including while the first request is delayed;
- tracked email invitations render and copy their backend-provided registration links against the authenticated KOD origin; the generic profile action is explicitly a registration link rather than the legacy `kod://` invite deep link;
- ambiguous rent recovery now requires both `requestId` and `skuId`, matching the backend semantic-idempotency enforcement;
- paired-backend self-owned API activation and legacy self-usage billing are rejected so reward card hours cannot be laundered into redeemable supplier income.

The client repair set passes 43/43 focused component/hook tests. The paired backend repair set passes 32/32 focused service tests, and its final full Maven run passes 131/131 tests.

## Second independent cross-branch review repair

A fresh read-only review of the post-repair client and backend ranges reported no Critical findings and three new Important findings. Each was reproduced with a failing regression before production changes:

- a mounted compute-center page did not rerender during a direct authenticated A-to-B change because it subscribed only to the boolean token state; all account-scoped compute-center, card-hour, order-workspace, hosted-node, and administrator queries now use the normalized identity in their query keys, and the mounted route test proves A's rendered email is replaced by B's result under `['compute', 'second@example.com', 'account']`;
- queued rewarded-ad seconds were sent immediately after a delayed receipt even though the backend accepts at most one progress second per one-second interval; the client now paces queued receipts by 1,000 ms, and the regression mock rejects any interval below 950 ms while proving seconds 1, 2, and 3 complete in order;
- concurrent lease calls with the same `(userId, requestId)` but different SKUs could race on separate SKU locks and leak a unique-constraint exception; rent now locks the user's account row before the first idempotency lookup, and a concurrent cross-SKU test proves exactly one lease/debit and one controlled `BizException` loser.

The final affected client regression run passed 37/37 tests, the combined feature/video run passed 113/113, TypeScript check passed, and the production build again transformed 5,352 main, 82 preload, and 15,029 renderer modules. The paired backend full suite now passes 132/132 tests, and the repackaged JAR is 121,126,123 bytes. Both strict OpenSpec validations passed.

## Protected scope, credentials, and diff hygiene

- Client `f97c615` versus the working branch has zero changed lines matching `ComputeMarketPrice`, `MarketPrice`, `/market-prices`, `prices`, or `实时行情` inside the two touched compute-center files. Backend `f37e8cb..HEAD` has zero changed realtime-price files.
- Client production-source scan found zero matches for `api.tokenstar.world`, `KOD_VIDEO_API_KEY`, video-key build variables, or bearer-style upstream keys. The backend branch changed no video production or `application.yml` files; only its existing video service regression test was extended.
- Added-line credential scans in both ranges found zero private-key blocks, AWS keys, long `sk-` keys, GitHub tokens, Google API keys, or Slack tokens.
- `git diff --check f97c615` passed for the client, and `git diff --check f37e8cb..HEAD` passed for the paired backend.

## Limitation

No live upstream submit/status/download was performed because no real upstream API key was provided, and the client is intentionally unable to accept one. Configured-path coverage uses the existing backend gateway tests and client boundary mocks; deployment smoke with a real server-side key remains an operational deployment check.
