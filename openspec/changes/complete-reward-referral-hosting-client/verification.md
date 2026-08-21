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

## Third independent cross-branch review repair

A third fresh read-only review of client `f97c615..1bc0815` and backend `f37e8cb..3792456` did not reuse either earlier verdict. It reported no Critical findings and four Important findings. The repaired heads are client `099ed9b` and backend `1f51ac6`:

- rewarded-ad completion and claim now both enforce the persisted server `claimableAt`, so a campaign whose `minimumSeconds` exceeds its asset duration cannot be claimed early by a scripted client;
- lease renewal now takes the user account row before the SKU row, matching rent's account-before-SKU order and removing the same-user rent/renew lock inversion;
- a mounted rewarded-ad card closes and clears its active watch locally on an authenticated A-to-B change without sending A's watch identifier through B's credentials;
- an in-flight official video generation captures its owner identity and owner history partition, aborts on a real account change, and marks only A's record retryable. Normal token refresh for the same normalized email does not abort the task.

The final client account-switch regression set passed 23/23 tests, and the complete 11-file feature/video target set passed 116/116. `corepack pnpm run check` passed. The post-repair production build passed with 5,352 main, 82 preload, and 15,029 renderer modules. The final full client run contained 154 files: 147 passed, 5 failed, 2 skipped; 1,521 tests: 1,461 passed, 6 failed, 54 skipped. The six failures are exactly the classified baseline rows above; none of their tests, production files, configuration, or dependency lockfiles changed in the branch.

The five changed client files pass Biome check. The full 921-file Biome lint still reports exactly the same 13 baseline errors in the six unchanged files recorded above. The two repaired backend service classes pass 38/38 focused tests; the full backend suite passes 134/134, and the repackaged JAR is 121,126,198 bytes. Strict validation passes for both `complete-reward-referral-hosting-client` and paired backend `complete-reward-referral-hosting-platform`.

## Fourth independent cross-branch review repair

A fourth fresh read-only review covered client `f97c615..70843f4` and backend `f37e8cb..1f51ac6`, without inheriting an earlier verdict. It requested changes for one Critical and four Important findings. The repaired heads are client `a569797` and backend `324c60b`:

- both legacy and fixed-package GPU order entry points now reject a buyer's self-owned GPU product, closing the exploitable legacy self-deliver/auto-settle path that could consume reward escrow and credit the same account redeemable `GPU_RENTAL_INCOME`;
- a delayed rewarded-ad start response is discarded if its captured identity is no longer current, so an A watch cannot be installed into B after the switch;
- platform-hosting checkout records its owner identity, closes on a mounted account change, and rechecks identity before rent. Pending rent and renewal callbacks also ignore a different current identity;
- redeemable credits now explicitly lock the legacy account before mutating the qualified ledger, matching the legacy-to-qualified order used by rent, renewal, and debit flows;
- the hosting panel displays the server's available `withdrawableCardHours`, not the redeemable total that includes frozen order funds.

The repaired client component set passes 37/37 tests and the complete 11-file feature/video set passes 119/119. TypeScript check and production build pass; the build again transformed 5,352 main, 82 preload, and 15,029 renderer modules. The final full client run contains 154 files: 147 passed, 5 failed, 2 skipped; 1,524 tests: 1,464 passed, the same 6 classified baseline failures, and 54 skipped. Changed-file Biome is clean; full Biome remains the exact 13-error unchanged baseline.

The backend security/lock-order plus lease focused set passes 27/27 tests, the full backend suite passes 136/136, and the repackaged JAR is 121,126,358 bytes. The self-owned GPU regression uses a reward-only qualified balance and proves reward, redeemable, frozen, and reservation state remain unchanged. The lock-order regression verifies the legacy `FOR UPDATE` occurs before `creditRedeemable`.

## Fifth independent cross-branch review repair

A fifth fresh read-only review covered client `f97c615..58e957b` and backend `f37e8cb..324c60b`; it did not reuse the fourth verdict. It requested changes for one Critical and three Important findings. The repaired code heads are client `18090d7` and backend `0a470ec`:

- every card-hour action now captures its authenticated owner. Await continuations, insufficient-balance prompts, and confirmation retries recheck a render-synchronous identity ref; mounted account changes resolve and remove the old prompt and clear stale busy/message state. The regression delays A's 4601 response until after switching to B and proves B sees no A dialog and no B-credential retry;
- the reviewed internal legacy/qualified mutation primitives now enter through one sorted legacy-account lock helper before qualified mutations. The fifth repair covered market listing delivery, redemption settlement, exact/standard freeze, release, credit/debit/frozen flows, transfers, and compute-center lot expiry. The sixth review below identified and closed two remaining outer-transaction inversions in market expiry and cross-user purchase confirmation;
- rewarded-ad start completion compares its captured owner with a ref updated synchronously during render, closing the B-render-to-passive-effect window that could install A's watch;
- official video generation and retry atomically reserve a module startup token before the availability await. A second concurrent create cannot reach availability or local task creation, cancellation invalidates the token, and owner changes before record launch mark only the captured owner's record retryable.

The final 11-file client feature/video command passes 121/121 tests. `corepack pnpm run check` passes. The production build passes after transforming 5,352 main, 82 preload, and 15,029 renderer modules, with only the documented non-fatal baseline warnings. The final full client run contains 154 files: 147 passed, 5 failed, 2 skipped; 1,526 tests: 1,466 passed, the same 6 classified baseline failures, and 54 skipped. No failing test, its production file, test configuration, `package.json`, or `pnpm-lock.yaml` changed in the fifth repair.

Changed-client-file Biome is clean. Full Biome checks 921 files and still reports exactly the documented 13 baseline errors in the same six unchanged files. The paired backend focused qualified-market suite passes 7/7, its final full suite passes 138/138, and the repackaged JAR is 121,126,776 bytes. Both strict OpenSpec validations pass. Client production video-sensitive matches, protected realtime-price added lines, client/backend added-secret matches, backend realtime-price files, and backend video-production files are all zero; both range diff checks pass.

## Sixth independent cross-branch review repair

A sixth fresh read-only review covered client `f97c615..19eb515` and backend `f37e8cb..0a470ec`; it did not reuse the fifth verdict. It reported no Critical findings and four Important findings. The repaired code heads are client `548f8a8` and backend `c73dc39`:

- pending video availability now belongs to an authenticated startup owner and has its own abort controller. A real account change aborts and releases A's startup reservation synchronously, so B can start its own availability check instead of remaining indefinitely busy; token rotation for the same normalized email is unchanged;
- every rewarded-ad server continuation is bound to a render-synchronous identity epoch and watch owner. A B render invalidates A before passive cleanup, progress/complete/claim/abandon stop before using B credentials, delayed A receipts cannot overwrite B's token/progress refs, and only the matching request may clear the in-flight slot;
- the market-expiry scheduler now reads unlocked candidates, locks the owner's legacy and qualified ledgers first, then re-locks and revalidates the exact lot before conversion. This removes the prior lot -> legacy/qualified inversion;
- card-hour purchase confirmation prelocks all buyer and seller `sys_user` rows in sorted order, then all legacy rows in sorted order, then all qualified rows in sorted order before buyer debit or seller delivery. Opposing cross-user trades therefore share one participant lock order instead of each holding its own buyer wallet first.

Both client regressions were demonstrated red before repair: the pending-startup test returned A's stale unavailable result and left B rejected as busy, while the render/effect race sent one stale progress request. After repair, the two directly affected files pass 27/27 tests and the complete 11-file feature/video command passes 123/123. `corepack pnpm run check` and the four-file changed Biome check pass. The production build passes after transforming 5,352 main, 82 preload, and 15,029 renderer modules, with only the documented baseline warnings.

The final full client run contains 154 files: 147 passed, 5 failed, 2 skipped; 1,528 tests: 1,468 passed, the same 6 classified baseline failures, and 54 skipped. None of the six failing tests, their production files, test configuration, `package.json`, or `pnpm-lock.yaml` changed in the sixth repair. Full Biome lint checks 921 files and remains the exact 13-error baseline in the same six unchanged files.

The backend participant-lock regression was red at test compilation before `lockWalletParticipants` existed. The market-expiry regression verifies owner ledger locking precedes the exact lot `FOR UPDATE` and conversion credit. The focused qualified-market suite passes 8/8; the final backend suite passes 139/139 with no failures, errors, or skips; packaging passes and produces a 121,127,047-byte JAR.

Strict OpenSpec validation passes for both client and paired backend changes. Final scans report zero client production video-sensitive added lines, zero protected realtime-price added lines, zero client/backend added-secret matches, zero changed backend realtime-price files, and zero changed backend video-production files. `git diff --check f97c615` and `git diff --check f37e8cb HEAD` both pass.

## Protected scope, credentials, and diff hygiene

- Client `f97c615` versus the working branch has zero changed lines matching `ComputeMarketPrice`, `MarketPrice`, `/market-prices`, `prices`, or `实时行情` inside the two touched compute-center files. Backend `f37e8cb..HEAD` has zero changed realtime-price files.
- Client production-source scan found zero matches for `api.tokenstar.world`, `KOD_VIDEO_API_KEY`, video-key build variables, or bearer-style upstream keys. The backend branch changed no video production or `application.yml` files; only its existing video service regression test was extended.
- Added-line credential scans in both ranges found zero private-key blocks, AWS keys, long `sk-` keys, GitHub tokens, Google API keys, or Slack tokens.
- `git diff --check f97c615` passed for the client, and `git diff --check f37e8cb..HEAD` passed for the paired backend.

## Limitation

No live upstream submit/status/download was performed because no real upstream API key was provided, and the client is intentionally unable to accept one. Configured-path coverage uses the existing backend gateway tests and client boundary mocks; deployment smoke with a real server-side key remains an operational deployment check.
