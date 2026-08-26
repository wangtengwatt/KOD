# Kai Market Inference Client Decimal Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve backend precision-38/scale-18 prediction and verification decimal strings exactly in the desktop client.

**Architecture:** Keep the existing inference transport, owner lifecycle, and card. Widen only the inference Zod fixed-point schemas and prove that decoding and presentation never coerce through JavaScript numbers.

**Tech Stack:** TypeScript, Zod, React, Mantine, TanStack Query, Vitest, Testing Library, Biome, OpenSpec.

**Spec:** `openspec/changes/harden-kai-market-inference-contract-integrity-client/`

## Global Constraints

- Inference decimals are strings with precision at most 38 and scale at most 18.
- Do not change quote feeds, quote calculations, `simulatedMarket`, upstream routing, or refresh ownership.
- Do not modify website/public assets, KAI Logo, brand colors, payment, video, rewards, hosting, lottery, or local demo.
- Do not add endpoints, credentials, or direct renderer access to inference upstreams.
- Stop on every merge or cherry-pick conflict.

---

### Task 1: Widen strict inference decimal contracts

**Files:**
- Modify: `src/renderer/packages/compute-market/kaiInference.ts`
- Test: `src/renderer/packages/compute-market/kaiInference.test.ts`

**Interfaces:**
- Consumes: backend string fields `prediction.nextEvent.price`, `prediction.nextEvent.quantity`, `verification.actualPrice`, `verification.actualQuantity`, and `verification.priceError`.
- Produces: strict Zod-decoded strings with precision 38 / scale 18 and unchanged field names.

- [ ] **Step 1:** Add valid boundary fixtures at precision 38 and scale 18 plus invalid number/exponent/precision/scale/sign/zero fixtures.
- [ ] **Step 2:** Run the focused contract tests and record failures from the old 18/8 and 26/8 limits.
- [ ] **Step 3:** Replace the old inference decimal constants and regular expressions with one 38/18 schema family while retaining sign and zero refinements.
- [ ] **Step 4:** Re-run focused tests and confirm all strings are returned exactly as supplied.
- [ ] **Step 5:** Commit only the schema and tests.

### Task 2: Prove exact presentation

**Files:**
- Test: `src/renderer/components/compute-market/KaiMarketInferenceCard.test.tsx`
- Modify only if required by RED: `src/renderer/components/compute-market/KaiMarketInferenceCard.tsx`

**Interfaces:**
- Consumes: strict inference view strings from Task 1.
- Produces: unchanged visual card text containing exact price, quantity, and error strings.

- [ ] **Step 1:** Add a card fixture containing long valid prediction and verification decimal strings.
- [ ] **Step 2:** Run the component test and verify whether the current direct rendering already passes.
- [ ] **Step 3:** If RED exposes coercion or overflow, remove only that coercion and add safe wrapping without changing surrounding layout or colors; otherwise leave production UI unchanged.
- [ ] **Step 4:** Re-run the component and related market tests.
- [ ] **Step 5:** Commit only any required presentation change and its test.

### Task 3: Verify the client branch

**Files:**
- Modify: `openspec/changes/harden-kai-market-inference-contract-integrity-client/tasks.md`
- Create: `openspec/changes/harden-kai-market-inference-contract-integrity-client/verification.md`

**Interfaces:**
- Consumes: Task 1 and optional Task 2 commits.
- Produces: verified client commit ready for non-force integration.

- [ ] **Step 1:** Run focused and related Vitest, `pnpm run check`, changed-file Biome, and `pnpm run build`.
- [ ] **Step 2:** Run full Vitest and classify only failures reproduced at the exact baseline as pre-existing.
- [ ] **Step 3:** Run strict OpenSpec, diff, protected website/KAI Logo, quote-feed, endpoint/key, and secret scans.
- [ ] **Step 4:** Obtain an independent read-only review and fix every Critical/Important finding.
- [ ] **Step 5:** Commit verification artifacts without deploying, pushing, or changing the desktop launcher.
