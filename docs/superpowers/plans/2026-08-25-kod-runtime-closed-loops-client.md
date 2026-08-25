# KOD Runtime Closed Loops Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore account-scoped wallet/recharge sync, realtime market display, rewarded-ad playback, referral UX, and the platform-hosting purchase flow in the Windows client.

**Architecture:** Keep the website as the source of truth and normalize its wire responses at the client API boundary. Use stable account identity in every TanStack Query key, consume the colleague's production market adapter through the public read-only proxy, and reuse the existing reward/referral/hosting components while removing the legacy duplicate referral view.

**Tech Stack:** React, TypeScript, Zod, TanStack Query, Vitest, Testing Library, Electron, pnpm.

**Spec:** `docs/superpowers/specs/2026-08-25-kod-runtime-closed-loops-recovery-design.md`

## Global Constraints

- The deployed website frontend, its green/white design, and every KAI logo asset are protected and must not be changed.
- Advertisement and referral rewards are spendable platform card-hours but never redeemable or valid for hosting rent.
- Platform hosting rent consumes redeemable card-hours only; hosted sales credit redeemable card-hours.
- Production tests are read-only; state-changing E2E uses isolated backend data.
- Every behavior change follows RED, GREEN, focused regression, then full verification.

---

### Task 1: Stable account-scoped wallet and recharge sync

**Files:**
- Modify: `src/renderer/api/wallet.ts`
- Modify: `src/renderer/api/wallet.test.ts`
- Modify: `src/renderer/hooks/useWallet.ts`
- Modify: `src/renderer/hooks/useWallet.test.ts`
- Modify: wallet-identity callers under `src/renderer/components`

**Interfaces:**
- Consumes: `authInfoStore.accountId`, website `page_size` responses, decimal-string Snowflake IDs.
- Produces: `getWalletIdentity(accountId, loginEmail, accessToken, refreshToken): string | null` and normalized `{items,total,page,pageSize}` history.

- [ ] Add tests proving `page_size` is accepted, unsafe numeric IDs are rejected, decimal-string IDs are preserved, and account A/B never share query keys.
- [ ] Run `pnpm vitest run src/renderer/api/wallet.test.ts src/renderer/hooks/useWallet.test.ts` and confirm the new assertions fail for the intended missing normalization/identity behavior.
- [ ] Normalize `page_size` at the Zod wire boundary and prefer `accountId` when building wallet identity; update all callers without changing visible copy/layout.
- [ ] Re-run the focused tests and the wallet/settings component regression suite.
- [ ] Commit as `fix(wallet): restore account scoped synchronization`.

### Task 2: Production realtime market transport

**Files:**
- Modify: `src/renderer/packages/compute-market/simulatedMarket.ts`
- Modify: `src/renderer/packages/compute-market/simulatedMarket.test.ts`

**Interfaces:**
- Consumes: public `/api/v1/contracts` and `/api/v1/dashboard/{id}` endpoints supplied by colleague commit `82bcbeec...`.
- Produces: the existing `ComputeMarketApi` model without fallback/mock quotes.

- [ ] Add a live-shaped fixture test and a slow-response test proving a valid dashboard taking longer than 1.5 seconds is not classified as unavailable.
- [ ] Run the focused Vitest file and verify the timeout test fails.
- [ ] Align request timeout with the server proxy budget while retaining cancellation and schema validation.
- [ ] Re-run the market adapter and market panel tests.
- [ ] Commit as `fix(market): align client with production feed`.

### Task 3: Rewarded-ad media recovery

**Files:**
- Modify: `src/renderer/api/wallet.test.ts`
- Modify: `src/renderer/components/wallet/RewardedVideoCard.test.tsx`
- Modify only if tests require: `src/renderer/components/wallet/RewardedVideoCard.tsx`

**Interfaces:**
- Consumes: authenticated same-origin backend media URL with MP4 Range support.
- Produces: playable media while preserving the existing progress-token, complete, claim, abandon, and account-switch defenses.

- [ ] Add tests that the API accepts the new relative media route and the component retries a recoverable media load without clearing earned progress incorrectly.
- [ ] Run the focused API/component tests and observe the intended failure.
- [ ] Make the smallest URL/playback adjustment required by the backend media contract; do not bundle or rewrite the source advertisement file.
- [ ] Re-run all rewarded-ad tests.
- [ ] Commit as `fix(wallet): restore rewarded advertisement playback`.

### Task 4: One referral feature

**Files:**
- Modify: `src/renderer/routes/compute-center.tsx`
- Modify: `src/renderer/routes/compute-center.test.tsx`
- Verify: `src/renderer/components/referrals/ReferralDrawer.tsx`

**Interfaces:**
- Consumes: the existing sidebar drawer and backend email-invite/reward APIs.
- Produces: exactly one user-facing “邀请好友” entry, with email sending, link copy, pending/accepted status, and 10 non-redeemable card-hour notification.

- [ ] Add a route test proving “历史邀请佣金” is absent while “邀请好友” remains available through the drawer.
- [ ] Run the test and verify it fails on the legacy tab.
- [ ] Remove only the duplicate legacy query/tab/table from the user route; keep historical backend records intact.
- [ ] Re-run compute-center and referral drawer tests.
- [ ] Commit as `fix(referral): consolidate invitation rewards`.

### Task 5: Simple closed-loop platform hosting UX

**Files:**
- Modify: `src/renderer/components/compute/PlatformHostingPanel.tsx`
- Modify: `src/renderer/components/compute/PlatformHostingPanel.test.tsx`
- Modify if contract changes: `src/renderer/api/computeCenter.ts`

**Interfaces:**
- Consumes: active KAI SKUs, redeemable balance, rent/lease/listing/renewal endpoints.
- Produces: one-screen monthly rent confirmation, automatic node/listing state, unified sale price, earnings, auto-renew switch, and drain-to-exit action.

- [ ] Add a closed-loop component test: choose SKU, confirm redeemable-only monthly rent, see hosted/listed status, disable auto-renew, and see draining/exited state.
- [ ] Run the focused test and verify missing behavior fails.
- [ ] Implement only missing state/copy/action wiring; preserve the green/white design language and existing component hierarchy.
- [ ] Re-run hosting, compute-center, wallet, and identity-switch regressions.
- [ ] Commit as `feat(compute): complete platform hosting journey`.

### Task 6: Client verification and launcher handoff

**Files:**
- Modify only generated release metadata required by the existing release process.
- Update the existing desktop shortcut target after the verified build.

**Interfaces:**
- Consumes: all preceding client commits and verified backend endpoints.
- Produces: a signed/packaged runnable Windows client and synchronized desktop shortcut.

- [ ] Run focused feature suites, `pnpm run check`, changed-file Biome, production build, and the full Vitest suite; classify only pre-existing baseline failures.
- [ ] Run strict OpenSpec validation and protected-scope diff scans.
- [ ] Build/package the Windows client and smoke-launch it against the local verified backend.
- [ ] Update the existing desktop shortcut to the verified artifact and inspect its resolved target.
- [ ] Commit release evidence and prepare the `suanlizhongxin_KOD` integration push.
