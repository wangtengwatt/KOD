## 1. Baseline and Contracts

- [x] 1.1 Record the client type-check and existing compute/media/wallet regression baseline on Node 22 and pnpm 10.33.0.
- [x] 1.2 Add failing API contract tests for review detail/history, messages, schedule proposals, escrow projections and delist requests.
- [x] 1.3 Add shared types, query keys and status/color projections without changing existing screen behavior.

## 2. Review Center

- [x] 2.1 Add failing component tests for product image gallery, linked qualification proof, immutable revision metadata and completed review history.
- [x] 2.2 Implement the review detail/history components with participant/admin authorization errors isolated from the rest of compute center.
- [x] 2.3 Verify all five review categories and self-review failure feedback.

## 3. Conversation and Scheduling

- [x] 3.1 Add failing tests for cursor polling, unread counts, text/image submission, closed-order read-only behavior and secret-safe notifications.
- [x] 3.2 Implement order conversation and platform-local notification integration.
- [ ] 3.3 Add failing tests for propose/counter/accept, conflict rejection, schedule deadline cancellation and delivery gating.
- [x] 3.4 Implement structured schedule controls and server-authoritative status rendering.

## 4. Escrow and Rental Orders

- [x] 4.1 Add failing projection tests for active escrow, cancelled/refunded, disputed and completed orders.
- [x] 4.2 Implement the four-amount escrow summary and funds event timeline.
- [x] 4.3 Rename top navigation to “租赁订单”, merge buyer/supplier filters and remove the nested duplicate rental tab.

## 5. Hosted Compute

- [ ] 5.1 Add failing tests for hosted node status, active/future capacity, stopped intake, blocking orders and estimated offline time.
- [x] 5.2 Upgrade “我的托管节点” into the compute hosting panel and add guarded delist request/cancel controls.
- [x] 5.3 Verify completed orders return products to available presentation without creating a new product.

## 6. Cross-platform Verification and Delivery

- [x] 6.1 Run focused client tests, full type-check and changed-file Biome CI.
- [x] 6.2 Build Windows desktop and Web shared renderer; sync Android and iOS renderer targets, recording native toolchain limits.
- [ ] 6.3 Verify notifications and image previews on desktop and responsive narrow layout without leaking sensitive content.
- [x] 6.4 Update and test the desktop launcher/shortcut against the final `suanlizhongxin_KOD` checkout with Node 22 and pnpm 10.33.0.
- [x] 6.5 Run `openspec validate enhance-compute-hosted-marketplace --strict`, inspect the final diff and push the verified client commits.
