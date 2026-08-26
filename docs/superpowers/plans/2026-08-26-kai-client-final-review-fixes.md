# Kai Client Final Review Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Close the seven verified compute-client review gaps plus the non-trading inference-selector residual without changing protected market-feed behavior or assets.

**Architecture:** Keep the existing compute-center API, React Query, and component boundaries. Tighten public decoders at the network boundary, preserve account ownership before applying responses, and make refresh behavior explicit at the owning component. The backend remains authoritative for demo state, money, inventory, settlement, rewards, inference eligibility, and cadence.

**Tech Stack:** React 18, TypeScript, TanStack React Query, Zod 4, Mantine, Vitest, Testing Library, Biome, OpenSpec.

**Spec:** `openspec/changes/complete-kai-hosting-prediction-lottery-client/`

## Global Constraints

- Do not modify website/public files, KAI Logo or branding, realtime quote algorithms, or `simulatedMarket` data semantics.
- Do not add secrets, real upstream inference access, or direct inference transport outside the existing authenticated same-origin API.
- Keep IDs and DECIMAL(20,3) financial values as strict backend strings wherever this change owns the public contract.
- Every production behavior change requires a test that fails for the expected current behavior before implementation.
- Work only in `D:\watt\kod\.worktrees\kai-hosting-prediction-lottery-client`; do not push, cherry-pick, modify the root checkout, or update the desktop launcher.

---

### Task 1: Default-feed inference and eligible contract selection

**Files:**
- Modify: `src/renderer/components/compute-market/MarketIntelligencePanel.tsx`
- Test: `src/renderer/components/compute-market/MarketIntelligencePanel.test.tsx`

**Interfaces:**
- Consumes: the existing `MarketInferenceApi` authenticated directory/read/refresh methods.
- Produces: inference in an authenticated GPU view regardless of quote-feed presentation mode; only exact `status === 'trading'` contracts are selectable.

- [ ] Add a test that renders `simulationMode=true` with a wallet and expects directory/read calls and visible inference.
- [ ] Run the test and preserve the expected RED showing that `getContracts` was not called.
- [ ] Add a mixed-status directory test that proves a non-trading contract is absent from the selector and never reaches inference GET/POST.
- [ ] Run the test and preserve the expected RED showing the non-trading option is present/selectable.
- [ ] Remove only the simulation exclusion from inference authority and derive the selector from same-GPU exact-trading entries.
- [ ] Run the component test file and confirm GREEN without changing simulated quote rendering.

### Task 2: Strict local-demo scenario and usable sessions

**Files:**
- Modify: `src/renderer/packages/computeCenter.ts`
- Modify: `src/renderer/components/compute/LocalDemoRoleSwitcher.tsx`
- Test: `src/renderer/packages/computeCenter.hostingLottery.test.ts`
- Test: `src/renderer/components/compute/LocalDemoRoleSwitcher.test.tsx`

**Interfaces:**
- Consumes: loopback-only raw `GET /api/compute/local-demo/scenario` and `POST /api/compute/local-demo/scenario/run`.
- Produces: `LocalDemoScenarioSchema`, `getLocalDemoScenario`, and `runLocalDemoScenario`; capability-gated state/run UI.

- [ ] Add strict raw-transport tests using a literal backend-complete `ScenarioView` fixture, including nullable string IDs and decimal strings.
- [ ] Run them and preserve RED because the schema/functions do not exist.
- [ ] Add separate tests for an expired otherwise-valid `LocalDemoSession` and an extra `refreshToken` field; freeze time so each failure has one cause.
- [ ] Run and preserve RED showing the expired payload currently parses.
- [ ] Implement the exact scenario schema and owner-guarded loopback raw functions, plus `expiresAt > Date.now()` session validation.
- [ ] Run package tests and confirm GREEN.
- [ ] Add a component test that capability success loads authoritative scenario state and an idempotent run click displays `COMPLETED`, `reconciled`, rent, sale price, settled income, buyer/tenant rewards, inventory, and source IDs.
- [ ] Run and preserve RED because the state/run UI is absent.
- [ ] Implement a compact capability-only scenario panel with abort/owner generation guards and one run request in flight.
- [ ] Run component tests and confirm GREEN.

### Task 3: Role-switch ownership ordering

**Files:**
- Modify: `src/renderer/routes/compute-center.tsx`
- Test: `src/renderer/routes/-test/compute-center.demo.test.tsx`

**Interfaces:**
- Consumes: the strict `LocalDemoSession` delivered by the guarded switcher.
- Produces: old-owner cleanup completed before the new access-only session mounts.

- [ ] Add a deferred-cancellation test that proves auth remains old until cleanup completes, then a real new-role account query succeeds and remains cached.
- [ ] Run and preserve RED showing the new session installs before cancellation completes or its query is removed.
- [ ] Rework installation to capture the old auth owner, await old compute/wallet cancellation, re-check generation/owner, remove old queries, then synchronously install the new session.
- [ ] Retain tests proving an external B session and caches win over late A cleanup or response.
- [ ] Run the route demo tests and confirm GREEN.

### Task 4: Expanded lease settlement refresh

**Files:**
- Modify: `src/renderer/components/compute/PlatformHostingPanel.tsx`
- Test: `src/renderer/components/compute/PlatformHostingPanel.test.tsx`

**Interfaces:**
- Consumes: existing `getPlatformLeaseDetails(leaseId)`.
- Produces: 10-second foreground polling only while one lease's details are expanded.

- [ ] Add a fake-timer test whose first detail is PENDING and second is SETTLED after 10 seconds; collapse and prove polling stops.
- [ ] Run and preserve RED because there is no interval.
- [ ] Add the expanded-only interval and disable background polling.
- [ ] Run the component test and confirm GREEN.

### Task 5: Concurrent 401 refresh ownership

**Files:**
- Modify: `src/renderer/packages/computeCenter.ts`
- Test: `src/renderer/packages/computeCenter.rewards.test.ts`

**Interfaces:**
- Consumes: `refreshKodSession(rejectedToken, capturedAccountId)`, which already converges same-account token rotation and rejects an account mismatch.
- Produces: safe GET replay after same-account concurrent refresh, with no A-to-B replay.

- [ ] Add a two-request deferred test: both old-token requests receive 401, one rotates the same account, and both retry successfully with the fresh token.
- [ ] Run and preserve RED showing the second request throws the account-switched guard before refresh coordination.
- [ ] Add an A-to-B test that changes the captured account before the 401 completes and proves no replay occurs.
- [ ] Reorder only the first safe 401 path: validate captured account ownership, delegate token rotation, then recurse; keep strict full-session guards for all other responses.
- [ ] Run package tests and confirm GREEN.

### Task 6: Exact public SKU strings

**Files:**
- Modify: `src/renderer/packages/computeCenter.ts`
- Modify: `src/renderer/components/compute/PlatformHostingPanel.tsx`
- Test: `src/renderer/packages/computeCenter.rewards.test.ts`
- Test: `src/renderer/components/compute/PlatformHostingPanel.test.tsx`
- Test: `src/renderer/routes/-test/compute-center.hosting.test.tsx`

**Interfaces:**
- Produces: public SKU `id`, `monthlyRent`, and `platformSalePrice` as original strict strings.

- [ ] Change tests to require a 19-digit string ID and literal `12345678901234567.890`, while rejecting numeric forms.
- [ ] Run and preserve RED showing public SKU coercion/range rejection.
- [ ] Replace the three compatibility decoders with `strictContractId` and `strictContractDecimal`.
- [ ] Render SKU financial strings directly and update typed fixtures; do not call `Number`, `parseFloat`, arithmetic, or numeric formatting on them.
- [ ] Run package, component, and route tests and confirm GREEN.

### Task 7: OpenSpec evidence, verification, review, and commit

**Files:**
- Modify: `openspec/changes/complete-kai-hosting-prediction-lottery-client/design.md`
- Modify: `openspec/changes/complete-kai-hosting-prediction-lottery-client/tasks.md`
- Modify: the three affected capability specs below that change
- Create: `openspec/changes/complete-kai-hosting-prediction-lottery-client/verification.md`

- [ ] Record every RED command and expected failure in `verification.md`, followed by the corresponding GREEN command/result.
- [ ] Run all focused and related compute tests.
- [ ] Run `pnpm run check`.
- [ ] Run Biome check only on changed source/test files.
- [ ] Run `pnpm run build`.
- [ ] Run full `pnpm test` and classify only the known six unrelated baseline failures if they remain identical.
- [ ] Run `pnpm exec openspec validate complete-kai-hosting-prediction-lottery-client --strict`.
- [ ] Inspect `git diff --check`, changed paths, protected paths, secret-like strings, upstream URLs, and `git status`.
- [ ] Request an independent code review and address any verified findings with another RED/GREEN cycle.
- [ ] Commit all scoped changes as `fix(compute): close final client review gaps` and verify the worktree is clean.
