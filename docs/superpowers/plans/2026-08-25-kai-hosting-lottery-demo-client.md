# KAI Hosting, Settlement Lottery, and Local Demo Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make KAI inventory administration, monthly hosting income, settlement lottery, and the isolated three-role demo easy to operate in the desktop compute center.

**Architecture:** Extend the existing compute-center API package with server-authoritative schemas, then add focused components inside existing administrator, hosting, and top-level navigation surfaces. Every async workflow is pinned to the authenticated account snapshot, and local demo controls require both a loopback API origin and server capability.

**Tech Stack:** TypeScript, React, TanStack Query, Zod, Vitest, Testing Library, Electron, pnpm, Biome, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-08-25-kai-hosting-prediction-lottery-client-design.md`

## Global Constraints

- Do not modify website `frontend/src/**`, `frontend/public/**`, KAI Logo, or unrelated visual behavior.
- Preserve the desktop green-white style and existing compute-center navigation shell.
- IDs and card-hour/money values remain strings; never coerce them through JavaScript `number`.
- Server state owns inventory, financial totals, settlement status, eligibility, prize outcome, and reward credit.
- Async callbacks discard results after account changes; query keys include the authenticated identity.
- Demo controls require a loopback API origin and an affirmative server capability response.
- Existing desktop shortcut path and icon remain unchanged.

---

### Task 1: Add Exact Client Contracts

**Files:**
- Modify: `src/renderer/packages/computeCenter.ts`
- Test: `src/renderer/packages/computeCenter.hostingLottery.test.ts`

**Interfaces:**
- Produces: `PlatformLeaseDetails`, `PlatformLeasePeriod`, `PlatformLeaseIncomeEvent`, `LotteryEligibility`, `LotteryDraw`, `PlatformSkuAdminInput`, and `LocalDemoCapability` schemas/types.
- Produces API functions: `getPlatformLeaseDetails`, `listAdminPlatformSkus`, `upsertAdminPlatformSku`, `listLotteryEligibilities`, `drawLotteryEligibility`, `getLocalDemoCapability`, and `switchLocalDemoRole`.

- [ ] **Step 1: Write decoder and request RED tests**

Use 19-digit IDs and decimal strings. Assert exact URL/method/body, enum rejection, no numeric coercion, authenticated identity capture, and stale-account response rejection.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/packages/computeCenter.hostingLottery.test.ts`

- [ ] **Step 3: Implement Zod schemas and API functions**

Follow existing `computeCenter.ts` request helpers and `optionalAccountIdentity` patterns. Keep all financial fields as Zod strings matching decimal syntax and all IDs as digit strings.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 1 test; expected PASS.

Commit: `feat(compute): add hosting lottery client contracts`

---

### Task 2: Add Platform Server Inventory Administration

**Files:**
- Create: `src/renderer/components/compute/PlatformInventoryAdminPanel.tsx`
- Create: `src/renderer/components/compute/PlatformInventoryAdminPanel.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`
- Test: `src/renderer/routes/compute-center.admin.test.tsx`

**Interfaces:**
- Consumes: `listAdminPlatformSkus` and `upsertAdminPlatformSku`.
- Produces: an admin subtab labeled `平台服务器库存` with create/edit form and visible audit feedback.

- [ ] **Step 1: Write component RED tests**

Assert admin-only visibility, loading/error/empty states, SKU cards, monthly card-hour display, total/allocated/available inventory, active state, form validation, idempotent update, account switch cancellation, and success feedback.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/components/compute/PlatformInventoryAdminPanel.test.tsx src/renderer/routes/compute-center.admin.test.tsx`

- [ ] **Step 3: Implement compact admin workspace**

Reuse existing button/input/card primitives and add the subtab inside `AdminPanel`. Invalidate identity-scoped admin and public SKU queries after mutation; display server validation verbatim through existing error utilities.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 2 tests; expected PASS.

Commit: `feat(compute): add platform inventory admin ui`

---

### Task 3: Show Hosting Cost, Income, and Order Logs

**Files:**
- Modify: `src/renderer/components/compute/PlatformHostingPanel.tsx`
- Modify: `src/renderer/components/compute/PlatformHostingPanel.test.tsx`

**Interfaces:**
- Consumes: `getPlatformLeaseDetails` for each expanded lease.
- Produces: cost/current period, pending income, settled gross, fee, net income, lifecycle/renewal state, and expandable per-order log rows.

- [ ] **Step 1: Write financial visibility RED tests**

Assert exact monthly cost, period dates/status, pending/settled/fee/net strings, order/product IDs, settlement time, empty logs, drain/release copy, renewal confirmation, and no stale A-account rows after switching to B.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/components/compute/PlatformHostingPanel.test.tsx`

- [ ] **Step 3: Implement summaries and disclosure rows**

Keep the existing SKU checkout. Add lease summary cards and lazy-load an expandable `订单收益日志` table. Render server strings directly and preserve the closable auto-renew window.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 3 test; expected PASS.

Commit: `feat(compute): show hosting income logs`

---

### Task 4: Add Persistent Lottery Center and Settlement Modal

**Files:**
- Create: `src/renderer/components/compute/SettlementLotteryPanel.tsx`
- Create: `src/renderer/components/compute/SettlementLotteryPanel.test.tsx`
- Create: `src/renderer/components/compute/SettlementLotteryModal.tsx`
- Create: `src/renderer/components/compute/SettlementLotteryModal.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`
- Test: `src/renderer/routes/compute-center.lottery.test.tsx`

**Interfaces:**
- Consumes: eligibility list/draw APIs.
- Produces: top tab `抽奖中心`, pending badge, dismissible new-eligibility modal, and immutable result/history view.

- [ ] **Step 1: Write lottery RED tests**

Cover GPU order and hosting-period source labels, pending badge, modal close without API consumption, draw once, repeated click/request returning same result, five visual segments labeled 0.5/1/2/3/5%, server outcome landing, zero-base explanation, exact reward display, and `奖励卡时不可回购成人民币` disclosure.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/components/compute/SettlementLotteryPanel.test.tsx src/renderer/components/compute/SettlementLotteryModal.test.tsx src/renderer/routes/compute-center.lottery.test.tsx`

- [ ] **Step 3: Implement server-owned draw UI**

Animate only after the response chooses a segment; never generate a random outcome locally. Keep a closed pending item in the shared center, invalidate identity-scoped wallet/lottery/ledger queries on success, and ignore late responses for another account.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 4 tests; expected PASS.

Commit: `feat(compute): add settlement lottery ui`

---

### Task 5: Add the Guarded Three-Role Local Demo

**Files:**
- Create: `src/renderer/components/compute/LocalDemoRoleSwitcher.tsx`
- Create: `src/renderer/components/compute/LocalDemoRoleSwitcher.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`
- Test: `src/renderer/routes/compute-center.demo.test.tsx`

**Interfaces:**
- Consumes: `getLocalDemoCapability` and `switchLocalDemoRole`.
- Produces: local-only roles `管理员`, `托管租户`, and `GPU 买家`, each replacing the full authenticated session.

- [ ] **Step 1: Write guard/session RED tests**

Assert controls are absent for HTTPS/remote origins, absent when capability is false/unavailable, visible only with loopback plus capability, session tokens are installed atomically, identity-scoped queries clear, and late previous-role callbacks cannot update the new role.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/components/compute/LocalDemoRoleSwitcher.test.tsx src/renderer/routes/compute-center.demo.test.tsx`

- [ ] **Step 3: Implement local role switching**

Use URL parsing that accepts only `localhost`, `127.0.0.1`, or `[::1]`. Require server confirmation before rendering, call the role-session route, replace auth tokens/account identity together, and reset compute queries/workflows.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 5 tests; expected PASS.

Commit: `feat(compute): add guarded local demo roles`

---

### Task 6: Client Business Verification and Launcher Sync

**Files:**
- Modify: `openspec/changes/complete-kai-hosting-prediction-lottery-client/tasks.md`
- Create: `docs/verification/2026-08-25-kai-hosting-lottery-client.md`
- Modify only if required by existing packaging: current launcher script/shortcut target discovered during baseline.

**Interfaces:**
- Consumes Tasks 1-5 and the platform local demo flow.
- Produces packaged desktop evidence while preserving the shortcut path/icon.

- [ ] **Step 1: Run verification**

Run focused tests, full Vitest with baseline classification, `pnpm run check`, changed-file Biome, production build, strict OpenSpec, secret scan, protected website/KAI hashes, and route-generated artifact check.

- [ ] **Step 2: Run the visible full flow**

Use the local role control to execute admin SKU entry -> tenant rent/host -> buyer purchase -> settlement -> income log -> buyer draw -> period completion -> tenant draw. Capture screenshots and reconcile displayed decimal strings with backend rows.

- [ ] **Step 3: Build and smoke the desktop launcher**

Build the Windows artifact, synchronize the existing desktop shortcut only if its target artifact changed, launch through the shortcut, and verify all four navigation locations without changing website assets or KAI Logo.

- [ ] **Step 4: Record evidence and commit**

Commit: `docs(verification): record hosting lottery client evidence`
