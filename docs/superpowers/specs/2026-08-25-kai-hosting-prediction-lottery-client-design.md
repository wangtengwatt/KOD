# KAI hosting operations, settlement lottery, and market inference client design

## Context

The desktop client already exposes card-hour hosting and the colleague-authored read-only market panel, but administrators cannot manage KAI inventory from the UI, hosting users cannot reconcile monthly cost against per-order income, and settled buyers have no persistent lottery experience. The Kai inference service must augment, not replace, the real market feed. Production website source and KAI branding remain protected.

## Goals

- Add a desktop-only administrator workflow for platform server SKUs and inventory.
- Make monthly KAI server rent, automatic listing, downstream orders, settlement income, renewal, and exit understandable from one hosting view.
- Give eligible buyers one persistent draw per settled GPU order and hosting tenants one draw per completed paid monthly term.
- Show Kai AI prediction, risk analysis, freshness, failure state, and next-trade verification inside realtime market.
- Provide a local-only three-role demo workflow that remains available after automated tests.
- Keep account-owned queries, asynchronous callbacks, identifiers, and monetary values precision-safe.

## Non-goals and protected assets

- Do not modify `kod-ai-portal/frontend/src/**`, `kod-ai-portal/frontend/public/**`, production website layout, green-white styling, or the KAI Logo.
- Do not replace colleague market quotes, simulate production trades, or execute trades from an AI response.
- Do not put the inference key, demo tokens, or credentials in renderer code, Git, OpenSpec, logs, or packaged assets.
- Do not create demo users, inventory, orders, or balances in production.

## Navigation and presentation

- Administrator: `算力中心` -> `进入算力管理后台` -> `平台服务器库存`.
- Hosting user: `算力中心` -> `卡时托管`; each lease shows monthly cost, settled and pending income, fee, net income, term, renewal, and an expandable order-income log.
- All eligible users: top compute-center tab `抽奖中心`; a newly eligible draw also opens a dismissible modal. Dismissing never consumes eligibility.
- Market users: `算力中心` -> `算力市场` -> `实时行情` -> `Kai AI 行情研判`.
- Local development: a `本地演示角色` switch appears only when the API confirms guarded demo mode and the API origin is loopback.

## Client contracts

All server IDs remain strings and all card-hour amounts cross the wire as decimal strings. Every authenticated query key includes the stable account identity. Account changes clear checkout, draw, admin form, and inference request ownership before another callback may update UI state.

The hosting panel reads platform SKUs, leases, lease periods, income summary, and order-income events. The administrator inventory form never computes available inventory locally; it displays the server result after an idempotent upsert. The lottery UI reads server-owned eligibility and draw results and never chooses a segment locally.

The market inference card polls the same-origin KOD endpoint. The backend owns the 60-second cadence, trade fingerprint, upstream calls, and last-success cache. The client displays real quote data independently even when inference is unavailable.

## Lottery behavior

The approved prize rates are 0.5%, 1%, 2%, 3%, and 5%, each with 20% probability. GPU-order reward base is the order's snapshotted redeemable-funded card hours. Hosting reward base is the paid monthly rent for the completed term. Rewards round down to three decimals, cap at 10.000 card hours, and credit only the non-redeemable reward bucket. A zero redeemable-funded order may have a persisted eligibility but yields 0.000; the UI explains the reason rather than inventing value.

## Local demo behavior

The launcher may opt into `KOD_DEMO_DATA=1` only against a loopback API running the local profile. The API returns explicit demo capability and three short-lived role sessions: administrator, hosting tenant, and GPU buyer. Demo SKUs, balances, leases, reservations, income events, and draws carry a DEMO marker and are seeded idempotently. Role switching is never rendered for a non-loopback API.

## Testing and delivery

- Component and API tests cover inventory validation, account changes, monthly rent, auto-listing status, income reconciliation, dismissible draws, exactly-once draw display, inference caching, stale success, and local role guards.
- A local end-to-end run exercises administrator -> hosting tenant -> buyer -> settlement -> both lottery sources with database reconciliation.
- Production verification is read-only and asserts zero demo rows.
- Build the Windows client and preserve the existing desktop shortcut target and KAI icon.
- Stop for user direction on every merge or cherry-pick conflict.

## Rollback

Disable inference and demo feature flags, restore the prior desktop build/branch, and retain server ledger/audit rows. UI rollback never deletes lease, settlement, eligibility, or draw history.
