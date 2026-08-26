## 1. Preserve baseline and contracts

- [x] 1.1 Record clean Git/worktree state, relevant test baseline, protected website/KAI Logo hashes, exact server schemas, and the current launcher target.
- [x] 1.2 Add failing precision, account-switch, stale-callback, and unavailable-state contract tests before implementation.

## 2. Add administrator inventory operations

- [x] 2.1 Add failing API and component tests for SKU listing, validation, idempotent upsert, inventory allocation constraints, status, and audit feedback.
- [x] 2.2 Implement `平台服务器库存` inside the existing compute administrator panel without changing website UI.

## 3. Complete hosting cost and income visibility

- [x] 3.1 Add failing tests for monthly cost, periods, pending/settled income, fee, net income, order logs, renewal, drain, and release states.
- [x] 3.2 Implement compact summaries and expandable per-order income logs in `卡时托管`.

## 4. Add persistent settlement lottery

- [x] 4.1 Add failing tests for both eligibility sources, dismiss without consume, pending badge, server-owned outcome, exact decimal display, zero-base explanation, and exactly-once retries.
- [x] 4.2 Implement the settlement modal and shared `抽奖中心` with reward-bucket disclosure.

## 5. Add Kai market inference presentation

- [x] 5.1 Add failing tests for strict authenticated contract discovery, real-contract selection, hard deadlines, owner-scoped cancellation and re-entry, single-flight refresh, GET-versus-POST authority, cached-timestamp baselines, initial and background directory failure/retry, cached success, server-owned refresh cadence, pipeline insufficiency, last-success fallback, next-trade verification, and account/route/contract changes.
- [x] 5.2 Implement `Kai AI 行情研判` and a compact `预测合约` selector inside realtime market with bounded transport and owner lifecycles, without changing real quote behavior or enabling automatic trading.

## 6. Add local demo workflow

- [x] 6.1 Add failing tests that require loopback plus server capability and reject demo controls for production/non-loopback origins.
- [x] 6.2 Implement three-role local switching and idempotent visible demo state for administrator, hosting tenant, and GPU buyer.

## 7. Verify and deliver

- [x] 7.1 Run focused and full tests, type checking, changed-file Biome, production build, strict OpenSpec, diff/scope, secret, branding, and generated-artifact checks.
- [x] 7.2 Run the local full workflow and reconcile database rent, settlement, income, eligibility, draw, and reward ledger rows.
- [ ] 7.3 Verify production read-only behavior and zero demo rows, build Windows artifacts, smoke the existing desktop shortcut, then integrate and push `suanlizhongxin_KOD`; stop on every conflict.
- [x] 7.4 Mirror the exact GitLab `suanlizhongxin_KOD` commit to the configured GitHub repository with a non-force fast-forward push, verify the remote object ID, and leave production undeployed.

## 8. Close final independent client review

- [x] 8.1 Add RED tests and preserve evidence for default-feed inference visibility, trading-only selection, strict local scenario/session contracts, pre-install role cleanup, expanded lease settlement polling, concurrent same-account 401 refresh, exact public SKU strings, and independent expired-session rejection.
- [x] 8.2 Implement the minimum client fixes without changing protected quote feeds, simulation semantics, website/public assets, KAI branding, or direct upstream access.
- [x] 8.3 Run focused and full tests, type checking, changed-file Biome, production build, strict OpenSpec validation, diff/scope/secret/protected scans, and an independent final review; deliver one isolated commit without launcher or root-checkout changes.
