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

- Focused colleague feature command passed 6/6 files and 150/150 tests:
  - `MarketIntelligencePanel.test.tsx`
  - `marketIntelligence.test.ts`
  - `marketV2Contracts.test.ts`
  - `simulatedMarket.test.ts`
  - `feature-flags.test.ts`
  - `variables.test.ts`
- Detailed simulation adapter and panel run passed 2/2 files and 43/43 tests. It covers exact HTTPS allowlisting, rejected credential/query/fragment origins, `credentials: 'omit'`, rejected redirects, required-remote error behavior, no silent required-feed fallback, explicit simulator disclosure, and read-only adapter behavior.
- A read-only probe of `https://kod.kai.com/api/v1/contracts` returned HTTP 200, `application/json`, and 1,243 bytes.
- This is a server-owned **simulated market feed**. It is not direct live Vast.ai/Akamai rental inventory and is not an executable trading source.

## Protected local regression evidence

- The 11 test files changed by or coupled to protected local commit `47daf9c` passed 11/11 files and 108/108 tests.
- No production repair was required, so no TDD repair cycle or conflict decision was triggered.

## Type, lint, full-suite, and build evidence

- `corepack pnpm run check` passed with exit code 0 and no TypeScript diagnostics.
- Repository-root Biome is blocked before target diagnostics by ignored historical `.worktrees/*/biome.json` nested-root configurations. A subdirectory attempt is also blocked by existing non-UTF-8 macOS `._*` metadata files. An isolated stdin check reports formatting differences in the colleague file set; those files were not rewritten because this task preserves the colleague implementation and pure formatting changes were not authorized.
- Full `corepack pnpm run test`: 165 files total; 158 passed, 5 failed, 2 skipped. Tests: 1,674 passed, 6 failed, 54 skipped out of 1,734. All six failures exactly match the existing `stabilize-existing-test-baseline` and prior verification classification:
  - stale default-language expectation;
  - migration mock/expectation mismatch;
  - Windows skill-path separator assumption;
  - web-search `parse_link` expectation mismatch;
  - two stale ChatboxAI upstream-fallback expectations.
- `corepack pnpm run build` passed with exit code 0 after transforming 5,352 main, 82 preload, and 15,035 renderer modules. Existing eval, circular chunk, stale Browserslist, dynamic/static import, and large-chunk warnings remain non-fatal.
- `openspec validate integrate-realtime-market-quotes --strict` passed.
- `git diff --check 47daf9c` passed. Post-checkpoint counts are zero for conflict markers, protected logo changes, unexpected tracked product files, and added real-secret patterns.

## Desktop manual-test launcher

- Desktop shortcut: `C:\Users\Microsoft\Desktop\KOD蒜粒-开发版.lnk`.
- Target: `C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`.
- Arguments: `-NoProfile -ExecutionPolicy Bypass -File "D:\watt\.kod-local\run-kod-full-stack.ps1"`.
- Working directory: `D:\watt\kod`.
- Icon: `D:\watt\kod\assets\icon.ico,0`.
- The full-stack script delegates the client to `D:\watt\kod\start-kod-dev.ps1` and records status in `D:\watt\.kod-local\full-stack-launcher.log`; the client records status in `D:\watt\kod\.kod-dev-launcher.log`.
- Shortcut invocation at 15:05 updated the full-stack log, validated the backend, and found a healthy renderer on port 1212. The running Electron renderer reports `--app-path="D:\watt\kod"`.
- Limitation: the already-running development launcher held its per-project mutex, so the second shortcut invocation safely reported “another KOD launcher is checking or starting the project” instead of sending a focus notification. The existing client was not stopped because doing so could discard unsaved user state.
- `C:\Users\Microsoft\Desktop\KAI - 快捷方式.lnk` and `C:\Users\Microsoft\Downloads\KAI.svg` were not modified.
