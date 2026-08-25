## Why

KOD users can start a platform-hosted lease, but the desktop client does not expose administrator inventory entry, lease-level income reconciliation, or a persistent post-settlement reward flow. The realtime market also lacks the requested Kai prediction and risk interpretation. A local-only demo must prove the entire workflow without introducing fake production inventory or financial history.

## What Changes

- Add `平台服务器库存` to the existing compute administrator panel.
- Expand `卡时托管` with monthly cost, settlement income, fees, net income, lease periods, order logs, renewal, and exit states.
- Add a dismissible settlement popup and persistent `抽奖中心` for GPU buyers and completed monthly hosting terms.
- Add `Kai AI 行情研判` to realtime market with 60-second server-owned refresh, last-success fallback, and next-trade verification.
- Add a loopback-only demo role switch for administrator, hosting tenant, and GPU buyer.
- Rebuild and verify the Windows client and existing desktop launcher without changing protected website UI or KAI branding.

## Capabilities

### New Capabilities

- `platform-hosting-operations-client`: administrator inventory and lease-level cost/income/order visibility.
- `settlement-lottery-client`: persistent, server-owned post-settlement draw experience.
- `kai-market-inference-client`: cached AI prediction, risk, freshness, and verification presentation.
- `local-demo-workflow-client`: loopback-only role switching and visible demonstration state.

### Modified Capabilities

None.

## Impact

The change affects the compute-center route, hosting and market components, account-scoped query keys, remote API schemas, local launcher environment, tests, Windows build, and launcher verification. Production website source/assets, KAI Logo, unrelated chat/settings behavior, real market quote calculation, and all secrets remain protected.
