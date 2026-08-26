# Kai Market Inference Client Decimal Integrity Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Preserve backend precision-38/scale-18 price and quantity strings plus precision-56/scale-18 exact signed error strings in the desktop client.

**Architecture:** Keep the existing inference transport, owner lifecycle, and card. Widen only the inference Zod fixed-point schemas and prove that decoding and presentation never coerce through JavaScript numbers.

**Tech Stack:** TypeScript, Zod, React, Mantine, TanStack Query, Vitest, Testing Library, Biome, OpenSpec.

**Spec:** `openspec/changes/harden-kai-market-inference-contract-integrity-client/`

## Global Constraints

- Inference price and quantity are strings with precision at most 38 and scale at most 18; signed `priceError` is a string with precision at most 56 and scale at most 18.
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
- Produces: strict Zod-decoded strings with precision 38 / scale 18 for price/quantity and precision 56 / scale 18 for signed error, with unchanged field names.

- [x] **Step 1:** Add valid boundary fixtures at precision 38 / scale 18 for market values and precision 56 / scale 18 for exact signed error, plus invalid number/exponent/precision/scale/sign/zero fixtures.
- [x] **Step 2:** Run the focused contract tests and record failures from the old narrower limits.
- [x] **Step 3:** Keep the price/quantity schema at 38/18 and widen only the signed-error schema to 56/18 while retaining sign and zero refinements.
- [x] **Step 4:** Re-run focused tests and confirm all strings are returned exactly as supplied.
- [x] **Step 5:** Commit only the schema and tests.

### Task 2: Prove exact presentation

**Files:**
- Test: `src/renderer/components/compute-market/KaiMarketInferenceCard.test.tsx`
- Modify only if required by RED: `src/renderer/components/compute-market/KaiMarketInferenceCard.tsx`

**Interfaces:**
- Consumes: strict inference view strings from Task 1.
- Produces: unchanged visual card text containing exact price, quantity, and error strings.

- [x] **Step 1:** Add a card fixture containing long valid prediction and verification decimal strings.
- [x] **Step 2:** Run the component test and verify the current direct rendering passes.
- [x] **Step 3:** Leave production UI unchanged because the card already renders the exact strings without coercion.
- [x] **Step 4:** Re-run the component and related market tests.
- [x] **Step 5:** Commit the regression test with the decoder correction.

### Task 2A: Enforce fixed-scale integer capacity

**Files:**
- Modify: `src/renderer/packages/compute-market/kaiInference.ts`
- Test: `src/renderer/packages/compute-market/kaiInference.test.ts`
- Test: `src/renderer/components/compute-market/KaiMarketInferenceCard.test.tsx`

- [x] **Step 1:** Add RED fixtures for 39-digit integers with and without tail zeroes and legal 38-integer-digit values with trailing fractional zeroes.
- [x] **Step 2:** Compute normalized precision and integer digits without converting through JavaScript `number`.
- [x] **Step 3:** Apply the shared 38-integer-digit cap to price, quantity, actual values, and signed error while retaining the error precision-56 cap.
- [ ] **Step 4:** Re-run focused, related, check, Biome, build, full, OpenSpec, protected-scope, and independent-review gates.

### Task 3: Verify the client branch

**Files:**
- Modify: `openspec/changes/harden-kai-market-inference-contract-integrity-client/tasks.md`
- Create: `openspec/changes/harden-kai-market-inference-contract-integrity-client/verification.md`

**Interfaces:**
- Consumes: Task 1 and optional Task 2 commits.
- Produces: verified client commit ready for non-force integration.

- [x] **Step 1:** Run focused and related Vitest, `pnpm run check`, changed-file Biome, and `pnpm run build`.
- [x] **Step 2:** Run full Vitest and classify only failures reproduced at the exact baseline as pre-existing.
- [x] **Step 3:** Run strict OpenSpec, diff, protected website/KAI Logo, quote-feed, endpoint/key, and secret scans.
- [ ] **Step 4:** Obtain an independent read-only review and fix every Critical/Important finding.
- [ ] **Step 5:** Commit verification artifacts without deploying, pushing, or changing the desktop launcher.
