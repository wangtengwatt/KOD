# Task 4 Report: One Account Session Across Desktop and Android

## Outcome

Task 4 replaces page-local authentication state with one canonical `AccountSessionService`. Settings login, root initialization, the compute center, the Android **My** page, wallet requests, and the remaining authenticated remote helper now observe the same credentials, account identity, roles, and session revision.

The user-visible Android mismatch is covered directly: `/mobile-my` reads the canonical `AccountSnapshot`, loads assets through the same compute-account query used by the compute center, renders the same email and role labels, and invalidates/refetches those assets on logout or account switch. Loading and synchronization failures are explicit and retryable; they are no longer presented as authoritative zero balances or zero GPU counts.

No database, remote account, or external service data was changed. No push was performed.

## Canonical Session Design

`src/renderer/packages/session/AccountSessionService.ts` owns:

- login, delayed persisted-store hydration, account switching, and idempotent logout;
- the immutable `AccountSnapshot` (`userId`, normalized `email`, frozen `roles`, and `accessTokenExpiresAt`);
- authoritative identity/role refresh without allowing an old response to overwrite a switched account;
- one refresh for concurrent 401 responses;
- one authenticated retry after refresh, followed by atomic logout on a second 401;
- a monotonic account revision which rejects every late old-account success, failure, 401, refresh result, and retry result with a named session-changed error.

`src/renderer/packages/session/accountSession.ts` is the singleton adapter around the existing persisted `authInfoStore`. The old store remains the low-level credential persistence mechanism, but application login/logout mutations now go through the service. Logout synchronously clears React Query account/role/wallet/compute caches, then cleans old-account relay, provider, task, image, chat, and login-license state using the captured old account identity.

The legacy authenticated request helper is revision-aware as well. It cannot retry an account A request with account B credentials, cannot clear account B because account A's refresh failed late, cannot return a late account A 2xx response, and cannot continue its generic retry loop with credentials that were just logged out.

## Wallet Authentication Semantics

Wallet calls now use the canonical session executor:

- HTTP 401 triggers exactly one shared refresh and one retry.
- A second HTTP 401 logs the current session out atomically.
- HTTP 403 is **not** treated as token expiry. Its backend business/permission message is preserved, and it does not refresh or log the user out. This is required for balance, permission, and public-pool business restrictions.

## Shared Desktop and Android Account Data

- Root initialization refreshes the same canonical identity used everywhere else.
- The compute center uses `AccountSessionService.executeAuthenticated` and publishes identity/roles through the service.
- The compute-account React Query key is exported and reused by Android **My** rather than duplicating compute business state.
- Android **My** shows canonical email and `BUYER` / `SUPPLIER` / `ADMIN` roles plus shared人民币余额、可用/冻结卡时、累计/租金收益、运行中/待审核/待处理 GPU.
- Switching accounts performs logout cleanup before new credentials are persisted, so old roles and assets cannot flash under the new account.

## Build-Derived Service Origins

Service origins are selected and validated in build configuration, not by a renderer runtime resolver:

| Mode | Allowed KOD origin | Purpose |
| --- | --- | --- |
| `production` | `https://kod.kai.com` | Desktop/web/production Android |
| `localtest` | `http://10.0.2.2:8080` | Android emulator local backend |
| `desktop-local` | `http://localhost:8080` | Existing explicit Windows `pnpm dev:local` workflow |

The renderer graph no longer imports the resolver containing local literals. An executable esbuild contract bundles `src/renderer/variables.ts` with production defines and rejects `localhost`, `10.0.2.2`, or any cleartext `http://` literal.

`.env.production`, `.env.localtest`, Android sync scripts, Electron/Vite config, and the standalone web config are pinned to their matching mode. Production validation happens before the build is returned; a mismatched or unknown mode fails instead of silently falling back to a local host.

## TDD Evidence

All behavior changes were introduced from failing regressions before implementation:

- Canonical login/identity/logout and concurrent refresh tests failed against the former distributed page/store behavior, then passed with the service.
- Late concurrent 401 and stale refresh-token tests initially showed duplicate refreshes and old-account overwrite.
- Legacy switch-race tests initially showed a newly selected account being cleared by an old refresh failure and a second 401 leaving the UI logged in.
- Idempotent logout initially ran cache cleanup twice.
- Wallet tests initially failed 3/29: no shared 401 refresh, no second-401 logout, and incorrect 403 authentication handling.
- Android **My** tests initially failed 2/6 because loading/error states rendered fake zero assets.
- Snapshot immutability initially failed 1/13 after refresh returned a mutable account object.
- The production bundle contract initially failed 1/6 and printed both `http://10.0.2.2:8080` and `http://localhost:8080` in the production renderer graph.
- Independent review round 2 reproduced a late-success account leak. The added focused RED was 2 files / 24 tests with 4 failures: service initial late 2xx, service refreshed late 2xx, legacy initial late 2xx, and legacy retry-after-logout. Named revision guards made all paths green.

The original reviewer re-reviewed the final source and returned **PASS** with no remaining concrete finding.

## Verification

Fresh verification after the final race fix:

- Focused Task 4 suite: **12 files passed, 94 tests passed**.
- `pnpm run check`: **passed** (`tsc --noEmit`).
- Full Vitest: **145 files passed, 2 skipped; 1,378 tests passed, 54 skipped**.
- Targeted Biome check: exit 0; existing repository warnings remain non-blocking.
- `git diff --check`: passed before commit.

Product build commands did not use the ENOMEM test shim.

Before the final race-only source adjustment, unmodified full-host commands both passed:

- `pnpm run mobile:sync:android:localtest`: passed and emitted `com.kod.app.localtest`, the sole configured server URL `http://10.0.2.2:8080`, and no `localhost:8080` renderer asset.
- `pnpm run mobile:sync:android:production`: passed and emitted `com.kod.app`, `cleartext: false`, `allowMixedContent: false`, no `server.url`, and a production marker. Scans of both synchronized Android JS and renderer JS found zero `localhost:8080` files and zero `10.0.2.2:8080` files; `https://kod.kai.com` was present.

The required post-review full-host sync rerun was attempted without a shim. The default sandbox stopped before config load with the known host `uv_os_get_passwd ENOMEM` failure, while the unsandboxed request was rejected by the external subagent usage-limit gate (available again after 2026-08-20 12:11). Per the build-integrity ruling, no shim or indirect workaround was used. The working tree remains on the last successfully synchronized **production** marker/config; the root controller will rerun the unmodified localtest-to-production sync and final asset scan.

## Review Fixes Incorporated

The independent review additionally drove these fixes:

1. Old request refresh rejection cannot clear a newly switched account.
2. Logout is idempotent, so fallback handlers cannot purge anonymous/new-account data twice.
3. Legacy retry 401 logs out instead of leaving stale authenticated UI state.
4. Wallet uses shared 401 handling while preserving 403 business semantics.
5. Production renderer bundles cannot import local-origin constants.
6. Android asset load/error states cannot masquerade as real zero values.
7. Refreshed account snapshots remain deeply immutable.
8. Every asynchronous authenticated response is revision-checked before it can reach a consumer.
