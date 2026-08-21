# Compute Hosted Marketplace Client Implementation Plan

> **For Codex:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task with test-first RED/GREEN evidence.

**Goal:** Make the shared KOD compute-center UI expose auditable reviews, buyer/seller chat and schedule negotiation, escrow timelines, one rental-order entry and persistent hosted-node management on desktop, Web, iOS and Android.

**Architecture:** Keep the existing compute-center route as a shell and add focused domain modules under `packages/computeMarketplace` plus presentational components under `components/compute/marketplace`. The client renders server-authoritative state and never infers settlement or booking success. Existing wallet, retailer/node selection, chat, image/video generation and token package flows remain untouched.

**Tech Stack:** React 18, TypeScript, Mantine, TanStack Query/Router, Vitest, Testing Library, Biome, Electron, Web and Capacitor shared renderer, Node 22, pnpm 10.33.0.

---

### Task 1: Add typed marketplace API boundary

**Files:**
- Create: `src/renderer/packages/computeMarketplace/types.ts`
- Create: `src/renderer/packages/computeMarketplace/api.ts`
- Create: `src/renderer/packages/computeMarketplace/projections.ts`
- Create: `src/renderer/packages/computeMarketplace/api.test.ts`
- Create: `src/renderer/packages/computeMarketplace/projections.test.ts`
- Modify: `src/renderer/packages/computeCenter.ts`

**Step 1: Write failing tests**

Cover exact endpoint/method/body/request-key contracts, cursor encoding, authorized image URL construction, review color mapping and escrow decimal formatting for active/completed/cancelled/disputed orders.

**Step 2: Run RED**

Run `vitest run src/renderer/packages/computeMarketplace`; expected failure is missing modules.

**Step 3: Implement minimal types/API**

Define `ReviewDetail`, `ReviewEvent`, `OrderMessage`, `ScheduleProposal`, `EscrowProjection`, `OrderFundsEvent`, `HostedNodeSummary`, and `DelistRequest`. Reuse the authenticated request helper from `computeCenter.ts`; do not copy token storage or retry logic.

**Step 4: Run GREEN and commit**

Run focused tests and TypeScript, commit `feat(compute): add marketplace client contracts`.

### Task 2: Build evidence-first admin review center

**Files:**
- Create: `src/renderer/components/compute/marketplace/ReviewStatusBadge.tsx`
- Create: `src/renderer/components/compute/marketplace/ProductReviewDetail.tsx`
- Create: `src/renderer/components/compute/marketplace/ReviewHistory.tsx`
- Create: `src/renderer/components/compute/marketplace/ProductReviewDetail.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`

**Step 1: Write failing component tests**

Render all product images, resource-proof image, supplier/spec/price/SLA/revision metadata, colored pending/approved/rejected/superseded states and completed review rows with reviewer/reason/time.

**Step 2: Run RED then implement**

Replace the product portion of legacy `ReviewList` with detail cards and add Pending/History tabs covering all five categories. Keep self-review failure in the existing centered feedback channel.

**Step 3: Verify and commit**

Run component/API tests, TypeScript and changed-file Biome; commit `feat(compute): show review evidence and history`.

### Task 3: Add participant conversation and local notification bridge

**Files:**
- Create: `src/renderer/components/compute/marketplace/OrderConversation.tsx`
- Create: `src/renderer/components/compute/marketplace/OrderConversation.test.tsx`
- Create: `src/renderer/packages/computeMarketplace/useOrderConversation.ts`
- Create: `src/renderer/packages/computeMarketplace/localNotification.ts`
- Create: `src/renderer/packages/computeMarketplace/localNotification.test.ts`
- Modify: `src/renderer/routes/compute-center.tsx`

**Step 1: Write failing tests**

Cover incremental polling, per-order unread badges, text/image send, image type/size feedback, server SYSTEM rendering, read cursor, closed-order read-only behavior, and notification payload containing only order reference/generic text.

**Step 2: Run RED then implement**

Use TanStack Query with `afterId` cursors and a bounded foreground/background polling interval. Use Web Notification when permission exists; mobile/desktop fall back to the shared in-app notification without importing native-only modules into the renderer. Never include message body or credentials.

**Step 3: Verify and commit**

Run focused tests and responsive component tests, commit `feat(compute): add order conversation alerts`.

### Task 4: Add structured schedule negotiation

**Files:**
- Create: `src/renderer/components/compute/marketplace/ScheduleNegotiation.tsx`
- Create: `src/renderer/components/compute/marketplace/ScheduleNegotiation.test.tsx`
- Modify: `src/renderer/components/compute/marketplace/OrderConversation.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`

**Step 1: Write failing tests**

Cover propose/counter/accept, disabled self-accept, deadline countdown, conflict response, write-lock while pending, and delivery controls unavailable until the server returns a locked accepted proposal.

**Step 2: Run RED then implement**

Add start/end date-time controls that submit structured API input. Show system events for proposals; after acceptance display locked start/end and refresh the reservation query. Remove seller-editable “商定开通时间” for workflow version 2 while preserving it for legacy orders.

**Step 3: Verify and commit**

Run focused tests and TypeScript, commit `feat(compute): add mutual schedule negotiation`.

### Task 5: Consolidate rental orders and expose escrow

**Files:**
- Create: `src/renderer/components/compute/marketplace/EscrowSummary.tsx`
- Create: `src/renderer/components/compute/marketplace/OrderFundsTimeline.tsx`
- Create: `src/renderer/components/compute/marketplace/RentalOrdersPanel.tsx`
- Create: `src/renderer/components/compute/marketplace/RentalOrdersPanel.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`

**Step 1: Write failing tests**

Assert top label is exactly `租赁订单`, buyer/supplier filters are in one page, nested asset rental tab is absent, and four escrow values/timeline explain active, completed, refunded and disputed states without guessing from the status.

**Step 2: Run RED then implement**

Move existing buyer and supplier cards into `RentalOrdersPanel`, keep legacy record wording, attach conversation/schedule/escrow sections, and remove the duplicate assets tab plus old top `我的订单` label.

**Step 3: Verify and commit**

Run focused tests and route smoke tests, commit `feat(compute): consolidate rental orders`.

### Task 6: Upgrade existing hosted-node panel

**Files:**
- Create: `src/renderer/components/compute/marketplace/HostedComputePanel.tsx`
- Create: `src/renderer/components/compute/marketplace/HostedComputePanel.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`

**Step 1: Write failing tests**

Cover nodes/products/schedule/active order summary, `运行中，可预约下一时段`, intake-stopped state, requested/minimum/blocker/estimated offline times, seller request/cancel, and admin emergency pause reason.

**Step 2: Run RED then implement**

Replace only the content of existing `我的托管节点` section. Do not add another device entry. Treat server `canAcceptOrders`, `nextAvailableAt` and delist projection as authoritative.

**Step 3: Verify and commit**

Run focused tests and TypeScript, commit `feat(compute): upgrade hosted node management`.

### Task 7: Cross-platform validation and launcher synchronization

**Files:**
- Modify: `openspec/changes/enhance-compute-hosted-marketplace/tasks.md`
- Inspect/modify only if required: `scripts/kod-dev-launcher.ps1`, desktop shortcut target under `C:/Users/Microsoft/Desktop`

**Step 1: Run quality gates**

Using bundled Node 22 and pnpm 10.33.0, run focused Vitest tests, full `pnpm run check`, changed-file `biome ci`, `openspec validate enhance-compute-hosted-marketplace --strict`, and `git diff --check`.

**Step 2: Build shared targets**

Build desktop renderer and Web, then run Android/iOS shared renderer sync/build steps available on Windows. Record that iOS native Xcode signing/runtime verification requires macOS; do not claim it passed locally.

**Step 3: Verify launcher**

Ensure the desktop launcher resolves the final repository/worktree, bundled Node 22 and installed pnpm dependencies; launch a bounded smoke session and confirm the renderer and backend health checks become available. Update the desktop shortcut only if its target is stale.

**Step 4: Final review and push**

Check that wallet/recharge, retailer/node switching, chat, image/video generation and token package files are unchanged except unavoidable shared imports. Mark OpenSpec tasks, commit `chore(compute): verify hosted marketplace client`, and push `HEAD:suanlizhongxin_KOD`.
