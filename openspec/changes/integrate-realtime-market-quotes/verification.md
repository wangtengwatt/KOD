# Verification

Verified on 2026-08-24 (Asia/Shanghai) in Windows PowerShell on branch `suanlizhongxin_KOD`, using Node `v22.23.2` and Corepack pnpm `10.33.0`.

## Git preservation and integration

- Colleague commit: `b8c66432632bfa688cb34eccc8e8e4981e7160c3` (`feat(compute): use shared live simulation feed`).
- Protected local commit: `47daf9c9a596312a218258987e079e55d9140abe` (`fix(compute): restore card-hour account sync`).
- `git merge-base --is-ancestor b8c6643 47daf9c` passed. The colleague commit occurs exactly once in `HEAD` ancestry.
- `backup/pre-realtime-quotes-20260824` resolves to `47daf9c`, preserving the combined colleague-plus-local state before this OpenSpec work.
- No cherry-pick was repeated and no merge conflict occurred during this task.
- Target-commit and post-checkpoint scans found zero conflict markers, generated/binary build artifacts, logo/branding file changes, unrelated settings changes, or added real-secret patterns.

## Market feature evidence

- The final focused command passed 7/7 files and 156/156 tests:
  `corepack pnpm exec vitest run src/renderer/components/compute-market/MarketIntelligencePanel.test.tsx src/renderer/packages/compute-market/marketIntelligence.test.ts src/renderer/packages/compute-market/marketV2Contracts.test.ts src/renderer/packages/compute-market/simulatedMarket.test.ts src/renderer/utils/feature-flags.test.ts src/renderer/variables.test.ts src/renderer/routes/-test/compute-center.hosting.test.tsx`
- The focused files were:
  - `MarketIntelligencePanel.test.tsx`
  - `marketIntelligence.test.ts`
  - `marketV2Contracts.test.ts`
  - `simulatedMarket.test.ts`
  - `feature-flags.test.ts`
  - `variables.test.ts`
  - `compute-center.hosting.test.tsx`
- Detailed command `corepack pnpm exec vitest run src/renderer/components/compute-market/MarketIntelligencePanel.test.tsx src/renderer/packages/compute-market/simulatedMarket.test.ts` passed 2/2 files and 43/43 tests. It covers exact HTTPS allowlisting, rejected credential/query/fragment origins, `credentials: 'omit'`, rejected redirects, required-remote error behavior, no silent required-feed fallback, explicit simulator disclosure, and read-only adapter behavior.
- The route regression stubs the network unavailable, opens the default `实时行情` tab, verifies a request to `https://kod.kai.com/api/v1/contracts` with omitted credentials and rejected redirects, and verifies the required-feed error UI. Sensitivity was proved by temporarily disabling the V2 branch: the test failed at the missing required-feed alert; after restoring the branch and adding call-time `fetch` resolution, all 6 route tests passed. The temporary mutation was not retained.
- A read-only probe of `https://kod.kai.com/api/v1/contracts` returned HTTP 200, `application/json`, and 1,243 bytes.
- This is a server-owned **simulated market feed**. It is not direct live Vast.ai/Akamai rental inventory and is not an executable trading source.

## Protected local regression evidence

- Before the new route regression was added, the protected-local command passed 11/11 files and 108/108 tests:
  `corepack pnpm exec vitest run src/renderer/components/compute/AdminMarketplaceReview.test.tsx src/renderer/components/compute/PlatformHostingPanel.test.tsx src/renderer/packages/computeCenter.rewards.test.ts src/renderer/packages/computeMarketplace/projections.test.ts src/renderer/packages/computeReservationReview.test.ts src/renderer/packages/remote.auth.test.ts src/renderer/packages/remote.test.ts src/renderer/routes/-test/compute-center.hosting.test.tsx src/renderer/routes/-test/compute-center.referrals.test.tsx src/renderer/stores/authInfoStore.test.ts src/shared/request/request.test.ts`
- A fresh combined run of those 11 files plus the two detailed market files passed 13/13 files and 152/152 tests after the new route regression increased the protected-local subset to 109 tests.
- No production repair was required, so no TDD repair cycle or conflict decision was triggered.

## Type, lint, full-suite, and build evidence

- `corepack pnpm run check` passed with exit code 0 and no TypeScript diagnostics.
- Repository-root `corepack pnpm exec biome check .` is blocked before target diagnostics by ignored historical `.worktrees/*/biome.json` nested-root configurations. The targeted attempt `corepack pnpm exec biome check src/renderer/components/compute-market src/renderer/packages/compute-market src/renderer/utils/feature-flags.ts src/renderer/variables.ts src/renderer/routes/compute-center.tsx` is also blocked by existing non-UTF-8 macOS `._*` metadata files. `corepack pnpm exec biome check --stdin-file-path <path>` run per colleague file reports formatting differences; those files were not rewritten because this task preserves the colleague implementation and pure formatting changes were not authorized.
- Full command `corepack pnpm run test`: 165 files total; 158 passed, 5 failed, 2 skipped. Tests: 1,675 passed, 6 failed, 54 skipped out of 1,735. The extra passing test is the new route regression. All six failures exactly match the baseline documented in `openspec/changes/complete-reward-referral-hosting-client/verification.md` and the existing `stabilize-existing-test-baseline` classification:
  - stale default-language expectation;
  - migration mock/expectation mismatch;
  - Windows skill-path separator assumption;
  - web-search `parse_link` expectation mismatch;
  - two stale ChatboxAI upstream-fallback expectations.
- `corepack pnpm run build` passed with exit code 0 after transforming 5,352 main, 82 preload, and 15,035 renderer modules. Existing eval, circular chunk, stale Browserslist, dynamic/static import, and large-chunk warnings remain non-fatal.
- `openspec validate integrate-realtime-market-quotes --strict` passed.
- `git diff --check` passed and `git status --short` is clean after commit.
- Conflict and scope commands were `git grep -n -E '^(<<<<<<<|=======|>>>>>>>)'`, `git diff --name-only 47daf9c -- assets src/renderer/assets`, and `git diff --name-only 47daf9c -- package.json pnpm-lock.yaml src/renderer/routes/settings`; each produced no matches or paths.
- The added-line secret scan used `git diff --unified=0 47daf9c | Select-String -Pattern '^\+.*(api[_-]?key|secret|token|password)\s*[:=]\s*["''][^"'']+["'']' -CaseSensitive:$false`; it produced no matches. These scans intentionally inspect the approved post-checkpoint range rather than unrelated repository history.

## Desktop manual-test launcher

- Desktop shortcut: `C:\Users\Microsoft\Desktop\KOD蒜粒-开发版.lnk`.
- Target: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`.
- Arguments: `-NoProfile -ExecutionPolicy Bypass -File "D:\watt\.kod-local\run-kod-full-stack.ps1"`.
- Working directory: `D:\watt\kod`.
- Icon: `D:\watt\kod\assets\icon.ico,0`.
- The full-stack script delegates the client to `D:\watt\kod\start-kod-dev.ps1` and records status in `D:\watt\.kod-local\full-stack-launcher.log`; the client records status in `D:\watt\kod\.kod-dev-launcher.log`.
- Shortcut invocation at 15:05 updated the full-stack log, validated the backend, and found a healthy renderer on port 1212. The running Electron renderer reports `--app-path="D:\watt\kod"`.
- This was a validation against the already-running verified client, not a fresh cold-start test.
- Limitation: the already-running development launcher held its per-project mutex, so the second shortcut invocation safely reported “another KOD launcher is checking or starting the project” instead of sending a focus notification. The existing client was not stopped because doing so could discard unsaved user state.
- `C:\Users\Microsoft\Desktop\KAI - 快捷方式.lnk` and `C:\Users\Microsoft\Downloads\KAI.svg` were not modified.
