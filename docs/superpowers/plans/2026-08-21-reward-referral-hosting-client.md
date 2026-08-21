# KOD Reward, Referral, and Hosting Client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expose the backend reward, referral, and monthly hosting loops through a safe shared desktop/web/mobile renderer while preserving secure AI video generation.

**Architecture:** Extend typed API contracts first, then build focused components for reward balances, invitation drawer, and platform leases. Keep all asset eligibility server-derived and use React Query invalidation after mutations.

**Tech Stack:** TypeScript 5.8, React 18, Mantine, TanStack Query/Router, Zod 4, Vitest, Testing Library, Biome.

**Spec:** `docs/superpowers/specs/2026-08-21-kod-reward-video-referral-hosting-design.md`

## Global Constraints

- Show reward and redeemable card hours separately; never infer eligibility from total hours.
- Ad and accepted-referral notifications display exactly `10 卡时已到账` from server results.
- “邀请好友” is a first-level sidebar drawer; submitting an email does not claim that mail was sent.
- Pending is gray, accepted is green, failed/expired is red; default tracking range is 90 days.
- Monthly rent only shows redeemable balance and platform-controlled price.
- Rename old “算力托管” to “算力租赁”; reserve “卡时托管” for platform-server monthly rent.
- Do not modify real-time market-price UI or embed upstream video credentials.

---

### Task 1: Typed Reward and Hosting Contracts

**Files:**
- Modify: `src/renderer/packages/computeCenter.ts`
- Modify: `src/renderer/api/wallet.ts`
- Modify: `src/renderer/api/wallet.test.ts`
- Create: `src/renderer/packages/computeCenter.rewards.test.ts`

**Interfaces:**
- Produces: `CardHourBalances`, `EmailInvitation`, `PlatformServerSku`, `PlatformServerLease` and API functions for invitation and lease mutations.

- [ ] **Step 1: Write failing Zod/API tests**

```ts
it('keeps reward hours out of redeemable hours', () => {
  expect(CardHourAccountSchema.parse({
    spendable_card_hours: '100.000', redeemable_card_hours: '90.000', reward_card_hours: '10.000',
  })).toMatchObject({ spendableCardHours: 100, redeemableCardHours: 90, rewardCardHours: 10 })
})

it('parses pending and accepted email invitations', () => {
  expect(EmailInvitationSchema.parse({ email: 'friend@example.com', status: 'PENDING' }).status).toBe('PENDING')
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/renderer/api/wallet.test.ts src/renderer/packages/computeCenter.rewards.test.ts`
Expected: FAIL because the new fields and schemas do not exist.

- [ ] **Step 3: Implement minimal schemas and no-retry mutation methods**

Add `createEmailInvitation(email: string, requestId: string)`, `listEmailInvitations(days: number = 90)`, `listPlatformServerSkus()`, `rentPlatformServer(skuId: string, requestId: string)`, and `setLeaseAutoRenew(leaseId: string, enabled: boolean, requestId: string)`. Validate monetary/card-hour decimals before transforming.

- [ ] **Step 4: Run GREEN and commit**

Run the Step 2 command; expected PASS.

Commit: `git commit -m "feat(compute): add reward referral and lease contracts"`

### Task 2: Reward Balance and Advertisement Receipt

**Files:**
- Modify: `src/renderer/components/compute/CardHourBusiness.tsx`
- Modify: `src/renderer/components/wallet/RewardedVideoCard.tsx`
- Modify: `src/renderer/components/wallet/RewardedVideoCard.test.tsx`
- Modify: `src/renderer/hooks/useWallet.ts`

- [ ] **Step 1: Write failing component tests**

```tsx
it('shows a ten-card-hour receipt and separate reward balance', async () => {
  render(<RewardedVideoCard />)
  await completeAdvertisement()
  expect(await screen.findByText('10 卡时已到账')).toBeTruthy()
  expect(screen.getByText('奖励卡时')).toBeTruthy()
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/renderer/components/wallet/RewardedVideoCard.test.tsx`
Expected: FAIL on receipt text and bucket display.

- [ ] **Step 3: Implement server-driven campaign and balance UI**

Render the server video/poster/reward/daily eligibility. On claim success, show a modal/notification with the actual `10` result and invalidate account, ad status, and asset history queries. Label reward hours as usable but non-redeemable.

- [ ] **Step 4: Run GREEN and commit**

Run the Step 2 command plus `pnpm exec vitest run src/renderer/api/wallet.test.ts`; expected PASS.

Commit: `git commit -m "feat(wallet): show qualified card-hour rewards"`

### Task 3: Codex-Style Invitation Drawer

**Files:**
- Modify: `src/renderer/Sidebar.tsx`
- Create: `src/renderer/components/referrals/ReferralDrawer.tsx`
- Create: `src/renderer/components/referrals/ReferralDrawer.test.tsx`
- Modify: `src/renderer/components/compute/CardHourBusiness.tsx`
- Modify: `src/main/deeplinks.ts`
- Modify: `src/main/deeplinks.test.ts`

- [ ] **Step 1: Write failing navigation and UI tests**

```tsx
it('creates an invitation and tracks colored states', async () => {
  render(<ReferralDrawer opened onClose={() => {}} />)
  await user.type(screen.getByPlaceholderText('添加电子邮箱'), 'friend@example.com')
  await user.click(screen.getByRole('button', { name: '添加邀请' }))
  expect(await screen.findByText('待处理')).toHaveStyle({ color: expect.any(String) })
  await user.click(screen.getByRole('button', { name: '跟踪邀请' }))
  expect(screen.getByText('过去 90 天')).toBeTruthy()
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/renderer/components/referrals/ReferralDrawer.test.tsx src/main/deeplinks.test.ts`
Expected: FAIL because the drawer does not exist.

- [ ] **Step 3: Implement sidebar entry and two-state drawer**

Add first-level “邀请好友”. Default view has email input, copy-link action, “添加邀请”, and “跟踪邀请”; tracking view lists 90-day records with gray `待处理`, green `已接受`, red failure/expiry, initials, timestamps, and reasons. Do not say an email was sent.

- [ ] **Step 4: Remove the old inline RMB commission card**

Keep legacy history accessible only if returned by the backend, but remove “首次充值返佣 5%” and RMB pending/paid marketing copy from the active invitation UI.

- [ ] **Step 5: Run GREEN and commit**

Run the Step 2 command; expected PASS.

Commit: `git commit -m "feat(referrals): add invitation drawer and tracking"`

### Task 4: Monthly Card-Hour Hosting UI

**Files:**
- Create: `src/renderer/components/compute/PlatformHostingPanel.tsx`
- Create: `src/renderer/components/compute/PlatformHostingPanel.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`
- Modify: `src/renderer/components/compute/HostedComputePanel.tsx`

- [ ] **Step 1: Write failing rent/renew/naming tests**

```tsx
it('uses platform price and defaults auto-renew on', async () => {
  render(<PlatformHostingPanel />)
  expect(await screen.findByText('卡时托管')).toBeTruthy()
  expect(screen.getByRole('switch', { name: '自动续租' })).toBeChecked()
  expect(screen.queryByRole('textbox', { name: '销售价格' })).toBeNull()
  expect(screen.getByText(/仅可回购卡时可支付月租/)).toBeTruthy()
})
```

- [ ] **Step 2: Run RED**

Run: `pnpm exec vitest run src/renderer/components/compute/PlatformHostingPanel.test.tsx`
Expected: FAIL because the panel does not exist.

- [ ] **Step 3: Implement SKU, checkout, lease, and renewal views**

Show GPU/region/capacity, monthly card-hour rent, available redeemable balance, platform sale price, remaining term, intake/lease status, and the small auto-renew switch. Explain that disabling affects only the next term and draining precedes release.

- [ ] **Step 4: Rename old user-facing terminology**

Change ordinary hosted-compute labels from “算力托管” to “算力租赁”; use “卡时托管” only for the new platform lease panel.

- [ ] **Step 5: Run GREEN and commit**

Run the Step 2 command and relevant compute-center tests; expected PASS.

Commit: `git commit -m "feat(compute): add monthly card-hour hosting UI"`

### Task 5: AI Video Regression and Full Client Verification

**Files:**
- Modify only for regressions: `src/renderer/api/videoGeneration.ts`, `src/renderer/stores/videoGenerationActions.ts`
- Update: `openspec/changes/complete-reward-referral-hosting-client/tasks.md`

- [ ] **Step 1: Run video contract/action tests**

Run: `pnpm exec vitest run src/renderer/api/videoGeneration.test.ts src/renderer/stores/videoGenerationActions.test.ts`
Expected: PASS; no direct upstream URL/key path.

- [ ] **Step 2: Run all targeted feature tests**

Run: `pnpm exec vitest run src/renderer/api/wallet.test.ts src/renderer/components/wallet/RewardedVideoCard.test.tsx src/renderer/components/referrals/ReferralDrawer.test.tsx src/renderer/components/compute/PlatformHostingPanel.test.tsx src/main/deeplinks.test.ts`
Expected: PASS.

- [ ] **Step 3: Run full verification**

Run: `pnpm run test && pnpm run check && pnpm exec biome check src/renderer/api/wallet.ts src/renderer/packages/computeCenter.ts src/renderer/components/wallet/RewardedVideoCard.tsx src/renderer/components/referrals src/renderer/components/compute/PlatformHostingPanel.tsx src/renderer/Sidebar.tsx`
Expected: zero test failures, type errors, or Biome errors.

- [ ] **Step 4: Validate OpenSpec and protected scope**

Run: `npx --yes @fission-ai/openspec validate complete-reward-referral-hosting-client --strict`
Expected: valid.

Run: `git diff --name-only HEAD~4..HEAD | rg "MarketPrice|实时行情|prices"`
Expected: no output.

- [ ] **Step 5: Record verification and commit**

Create `openspec/changes/complete-reward-referral-hosting-client/verification.md` with exact outputs and commit with `docs(openspec): verify reward referral and hosting client`.
