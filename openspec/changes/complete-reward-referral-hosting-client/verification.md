# Verification

Verified on 2026-08-21 (Asia/Shanghai) in Windows PowerShell, branch `feature/reward-referral-hosting-client`, client range `f97c615..HEAD`, with Node `v22.23.2` and Corepack pnpm `10.33.0`. The paired backend framework was checked at `D:\watt\kod-ai-portal-video-proxy`, backend range `f37e8cb..HEAD`, on Java 21. No real upstream video credential was supplied or required.

## Video security and closed-loop evidence

- `corepack pnpm exec vitest run src/renderer/api/videoGeneration.test.ts src/renderer/stores/videoGenerationActions.test.ts` passed: 2 files, 7 tests. The API tests prove requests use only the authenticated KOD origin and generation parameters. The action tests prove a logged-out client stops before availability, a backend `available: false` reason is surfaced before local task creation or submission, and an available backend follows submit, status polling, authenticated content download, and local result storage without an upstream URL or key. A mutation run that temporarily bypassed the availability guard failed the unavailable test because the action incorrectly resolved; restoring the guard returned 7/7 passing.
- The video creator route catches the action error into its visible form alert. Therefore the backend's unavailable reason is the UI reason; there is no silent fallback path.
- The paired backend production framework remains `VideoGenerationController` -> `VideoGenerationService` -> `VideoUpstreamGateway`. Its API key is server configuration only. `VideoGenerationServiceTest.missingServerKeyReportsUnavailableAndNeverContactsAnUpstream` covers fail-closed behavior with `verifyNoInteractions(gateway)`.
- The host has no global `mvn`, and the repository's POSIX `mvnw` is not directly executable by PowerShell. Running the seven concrete backend video test classes through the wrapper main class succeeded: `HttpVideoUpstreamGatewayTest,VideoGenerationBillingServiceTest,VideoGenerationControllerTest,VideoGenerationPropertiesTest,VideoGenerationRepositoryTest,VideoGenerationSchemaInitializerTest,VideoGenerationServiceTest`; 19 tests, 0 failures, 0 errors, 0 skipped, `BUILD SUCCESS`. This covers both missing server key and configured proxy behavior without a real key.

## Client feature verification

- `corepack pnpm exec vitest run src/renderer/api/wallet.test.ts src/renderer/packages/computeCenter.rewards.test.ts src/renderer/components/wallet/RewardedVideoCard.test.tsx src/renderer/components/referrals/ReferralDrawer.test.tsx src/renderer/components/compute/PlatformHostingPanel.test.tsx src/renderer/routes/-test/compute-center.hosting.test.tsx src/renderer/routes/-test/compute-center.referrals.test.tsx src/main/deeplinks.test.ts` passed: 8 files, 99 tests.
- `corepack pnpm run check` passed with exit code 0 and no TypeScript diagnostics.
- `corepack pnpm run build` passed after 5,352 main modules, 82 preload modules, and 15,029 renderer modules were transformed. Existing Rollup circular-chunk, dynamic/static import, large-chunk, eval, and stale Browserslist warnings remain non-fatal.
- The first build attempt found a branch regression: the two new compute-center tests were placed directly in `src/renderer/routes`, so TanStack Router generated production route imports for them and failed because test modules do not export `Route`. Moving both tests into the router-ignored `src/renderer/routes/-test` directory preserved 3/3 route tests and made the subsequent full build pass.
- `corepack pnpm exec biome check ...` over the Task 5 target set plus the video action and moved route tests passed: 10 files checked, no fixes applied.
- `npx --yes @fission-ai/openspec validate complete-reward-referral-hosting-client --strict` passed: `Change 'complete-reward-referral-hosting-client' is valid`.

## Full-suite baseline classification

`corepack pnpm run test` was run twice, including after the route-test build fix. The final result was stable: 154 test files, 147 passed, 5 failed, 2 skipped; 1,514 tests, 1,454 passed, 6 failed, 54 skipped. All six failures are baseline, not regressions from `f97c615..HEAD`: none of the failing tests, their production files, test configuration, `package.json`, or `pnpm-lock.yaml` changed in this branch, and `openspec/changes/stabilize-existing-test-baseline` already records these Windows/stale-expectation categories.

| Failure | Classification |
| --- | --- |
| `src/shared/defaults.test.ts` expects `en`, receives the approved KOD default `zh-Hans` | Existing stale default-language expectation |
| `src/renderer/stores/migration.test.ts` expects `initData` on first run | Existing migration mock/expectation mismatch |
| `src/main/skills/__tests__/discovery.test.ts` expects POSIX `/skills/...`, receives Windows `\\skills\\...` | Existing Windows path assumption |
| `src/renderer/stores/session/tools-builder.test.ts` expects `parse_link` | Existing web-search tool/mock expectation mismatch |
| Two `src/shared/providers/definitions/models/chatboxai.test.ts` cases expect the removed upstream fallback | Existing stale relay fallback expectations; production intentionally requires configured KOD relay login |

`corepack pnpm run lint` also remains nonzero on the untouched repository baseline: 921 files checked, 13 errors and 1,009 warnings. Re-running with `--diagnostic-level=error --max-diagnostics=none` placed all 13 errors in unchanged files (`TopPSlider.tsx`, `SessionList.tsx`, `RemoteDialogWindow.tsx`, `ios_web_preview_init.ts`, `static/index.css`, and `chatboxai.ts`). The 10-file task-targeted Biome check is clean.

## Protected scope, credentials, and diff hygiene

- Client `f97c615` versus the working branch has zero changed lines matching `ComputeMarketPrice`, `MarketPrice`, `/market-prices`, `prices`, or `实时行情` inside the two touched compute-center files. Backend `f37e8cb..HEAD` has zero changed realtime-price files.
- Client production-source scan found zero matches for `api.tokenstar.world`, `KOD_VIDEO_API_KEY`, video-key build variables, or bearer-style upstream keys. The backend branch changed no video production or `application.yml` files; only its existing video service regression test was extended.
- Added-line credential scans in both ranges found zero private-key blocks, AWS keys, long `sk-` keys, GitHub tokens, Google API keys, or Slack tokens.
- `git diff --check f97c615` passed for the client, and `git diff --check f37e8cb..HEAD` passed for the paired backend.

## Limitation

No live upstream submit/status/download was performed because no real upstream API key was provided, and the client is intentionally unable to accept one. Configured-path coverage uses the existing backend gateway tests and client boundary mocks; deployment smoke with a real server-side key remains an operational deployment check.
