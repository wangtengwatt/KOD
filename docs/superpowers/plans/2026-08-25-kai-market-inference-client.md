# KAI Market Inference Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Present cached KAI next-market-event analysis inside realtime market while preserving actual quote behavior and useful stale results during outages.

**Architecture:** Decode the backend’s server-authoritative inference view, then render a compact `Kai AI 行情研判` section inside the existing realtime panel. The client observes backend status and never calls the upstream service, computes fingerprints, invents order book data, or triggers trading.

**Tech Stack:** TypeScript, React, Zod, TanStack Query, Vitest, Testing Library, pnpm, Biome, OpenSpec.

**Spec:** `docs/superpowers/specs/2026-08-25-kai-hosting-prediction-lottery-client-design.md`

## Global Constraints

- Do not put the inference endpoint or key in renderer, preload, source maps, docs, tests, or logs.
- Do not modify the colleague realtime quote semantics or replace actual prices.
- Refresh display state at the existing market cadence; backend alone enforces 60 seconds and changed fingerprints.
- Preserve last success and show the exact failure copy `预测服务暂不可用`.
- Show pipeline analysis only when the backend confirms a real order book was present.
- Do not add automatic trading, order suggestions, or wallet/order mutations.
- Protect website assets, green-white desktop style, and KAI Logo.

---

### Task 1: Add the Inference Wire Contract

**Files:**
- Create: `src/renderer/packages/compute-market/kaiInference.ts`
- Create: `src/renderer/packages/compute-market/kaiInference.test.ts`

**Interfaces:**
- Produces: `KaiMarketInferenceView` Zod schema and `getKaiMarketInference(contractId, identity)` / `refreshKaiMarketInference(contractId, identity)`.
- View contains status, fingerprint, last success, prediction text/parsed next event, optional pipeline, and optional verification; IDs/decimals are strings.

- [ ] **Step 1: Write wire RED tests**

Assert exact endpoints, encoded contract ID, cached/unavailable/insufficient-order-book states, 19-digit string IDs, decimal strings, rejected malformed upstream-shaped data, and stale-account response cancellation.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/packages/compute-market/kaiInference.test.ts`

- [ ] **Step 3: Implement schemas and authenticated functions**

Use the shared authenticated fetch wrapper. Decode only the backend view; do not expose a generic upstream proxy or accept arbitrary prompts.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 1 test; expected PASS.

Commit: `feat(market): add kai inference client contract`

---

### Task 2: Build the KAI AI Market Analysis Card

**Files:**
- Create: `src/renderer/components/compute-market/KaiMarketInferenceCard.tsx`
- Create: `src/renderer/components/compute-market/KaiMarketInferenceCard.test.tsx`

**Interfaces:**
- Consumes: `KaiMarketInferenceView` and a refresh callback.
- Produces: accessible visual states for current success, stale success/unavailable, pipeline unavailable, next-event verification, and first-load error.

- [ ] **Step 1: Write presentation RED tests**

Assert heading `Kai AI 行情研判`, model answer, generated timestamp, changed-source indicator, real-order-book pipeline label, last-success retention with `预测服务暂不可用`, verification outcome, manual retry, and no action/trade button.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/components/compute-market/KaiMarketInferenceCard.test.tsx`

- [ ] **Step 3: Implement compact green-white card**

Use existing market typography/cards/badges. Distinguish model text from verified real events, label stale timestamps, and display pipeline insufficiency without fabricating bid/ask.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 2 test; expected PASS.

Commit: `feat(market): show kai market analysis`

---

### Task 3: Integrate With Realtime Market Lifecycle

**Files:**
- Modify: `src/renderer/components/compute-market/MarketIntelligencePanel.tsx`
- Modify: `src/renderer/components/compute-market/MarketIntelligencePanel.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`
- Test: `src/renderer/routes/compute-center.market.test.tsx`

**Interfaces:**
- Consumes: existing selected contract/model and market refresh lifecycle plus Task 1 API/Task 2 card.
- Produces: inference displayed under `算力市场 -> 实时行情`, with identity/route/contract-safe query keys.

- [ ] **Step 1: Write integration RED tests**

Assert inference query follows selected real contract, market refresh triggers backend refresh request without local 60-second logic, unchanged backend state does not flicker, actual quote failures remain independent, last prediction survives inference errors, and account/route/contract changes discard stale callbacks.

- [ ] **Step 2: Verify RED**

Run: `pnpm exec vitest run src/renderer/components/compute-market/MarketIntelligencePanel.test.tsx src/renderer/routes/compute-center.market.test.tsx`

- [ ] **Step 3: Integrate without changing quote calculations**

Add identity-scoped queries and render `KaiMarketInferenceCard` after the existing actual market content. Manual retry calls only the backend refresh endpoint. Do not modify `simulatedMarket.ts` pricing transformations.

- [ ] **Step 4: Verify GREEN and commit**

Run Task 3 tests; expected PASS.

Commit: `feat(market): integrate kai inference panel`

---

### Task 4: Client Inference Verification and Delivery

**Files:**
- Modify: `openspec/changes/complete-kai-hosting-prediction-lottery-client/tasks.md`
- Create: `docs/verification/2026-08-25-kai-market-inference-client.md`

**Interfaces:**
- Consumes Tasks 1-3 and backend cached inference API.
- Produces verification evidence and user navigation instructions.

- [ ] **Step 1: Run verification**

Run the three focused test files, full relevant compute tests, `pnpm run check`, changed-file Biome, production build, strict OpenSpec, secret/endpoint scans, realtime quote diff scan, and protected website/KAI hash comparison.

- [ ] **Step 2: Smoke success and outage states**

Open `算力中心 -> 算力市场 -> 实时行情`, confirm a changed real trade eventually creates one backend prediction, verify unchanged data does not create another, then disable inference upstream and confirm actual quotes plus prior prediction remain with `预测服务暂不可用`.

- [ ] **Step 3: Record evidence and commit**

Commit: `docs(verification): record kai inference client evidence`
