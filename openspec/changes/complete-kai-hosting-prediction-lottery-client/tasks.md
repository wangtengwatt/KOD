## 1. Preserve baseline and contracts

- [ ] 1.1 Record clean Git/worktree state, relevant test baseline, protected website/KAI Logo hashes, exact server schemas, and the current launcher target.
- [ ] 1.2 Add failing precision, account-switch, stale-callback, and unavailable-state contract tests before implementation.

## 2. Add administrator inventory operations

- [ ] 2.1 Add failing API and component tests for SKU listing, validation, idempotent upsert, inventory allocation constraints, status, and audit feedback.
- [ ] 2.2 Implement `平台服务器库存` inside the existing compute administrator panel without changing website UI.

## 3. Complete hosting cost and income visibility

- [ ] 3.1 Add failing tests for monthly cost, periods, pending/settled income, fee, net income, order logs, renewal, drain, and release states.
- [ ] 3.2 Implement compact summaries and expandable per-order income logs in `卡时托管`.

## 4. Add persistent settlement lottery

- [ ] 4.1 Add failing tests for both eligibility sources, dismiss without consume, pending badge, server-owned outcome, exact decimal display, zero-base explanation, and exactly-once retries.
- [ ] 4.2 Implement the settlement modal and shared `抽奖中心` with reward-bucket disclosure.

## 5. Add Kai market inference presentation

- [ ] 5.1 Add failing tests for cached success, 60-second freshness, unchanged fingerprints, pipeline insufficiency, last-success fallback, next-trade verification, and account/route changes.
- [ ] 5.2 Implement `Kai AI 行情研判` inside realtime market without changing real quote behavior or enabling automatic trading.

## 6. Add local demo workflow

- [ ] 6.1 Add failing tests that require loopback plus server capability and reject demo controls for production/non-loopback origins.
- [ ] 6.2 Implement three-role local switching and idempotent visible demo state for administrator, hosting tenant, and GPU buyer.

## 7. Verify and deliver

- [ ] 7.1 Run focused and full tests, type checking, changed-file Biome, production build, strict OpenSpec, diff/scope, secret, branding, and generated-artifact checks.
- [ ] 7.2 Run the local full workflow and reconcile database rent, settlement, income, eligibility, draw, and reward ledger rows.
- [ ] 7.3 Verify production read-only behavior and zero demo rows, build Windows artifacts, smoke the existing desktop shortcut, then integrate and push `suanlizhongxin_KOD`; stop on every conflict.
