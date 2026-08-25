## 1. Preserve and characterize the baseline

- [ ] 1.1 Create recoverable Git checkpoints, verify clean worktrees and commit ancestry, and scan the proposed range for secrets, branding changes, conflict markers, generated artifacts, and unrelated scope.
- [ ] 1.2 Record the pre-change client test baseline, Node/Electron setup limitation, exact official API contracts, account-switch behavior, market endpoint availability, ad media response headers, and recharge-history parse failure.

## 2. Restore official account data synchronization

- [ ] 2.1 Add failing authentication and API tests for durable account identity, transient refresh errors, stale A-to-B request replay, account-scoped caches, decimal-string balances, and string Snowflake identifiers.
- [ ] 2.2 Implement account-owned wallet, card-hour, order, invitation, and hosting query keys and reject stale asynchronous responses after an account change.
- [ ] 2.3 Add failing wallet UI tests, then synchronize official balance, card-hour buckets, recharge history, foreground/manual refresh, and explicit retry states without displaying another account's cached data.

## 3. Restore colleague realtime market integration

- [ ] 3.1 Verify `b8c6643` remains the client source of truth and add failing route/adapter tests for the production same-origin HTTP and WebSocket paths used by portal commit `82bcbee`.
- [ ] 3.2 Make only the minimal tested wiring or defect repair required for the colleague market panel to load, refresh, disclose provenance, and show deterministic unavailable states.

## 4. Restore rewarded advertisement playback

- [ ] 4.1 Add failing media tests for server asset metadata, Range responses, retries, actual playback duration, interrupted playback, account switches, verified progress, completion, daily eligibility, and exact 10-card-hour receipt.
- [ ] 4.2 Restore playback of the server-managed KOD promotional asset and refresh wallet/card-hour state only after an authenticated successful claim.

## 5. Consolidate referrals and complete hosting

- [ ] 5.1 Add failing tests for the single sidebar referral entry, email creation, copyable registration link, pending/accepted/failed colors, 10-card-hour receipt, and absence of the duplicate historical-commission entry.
- [ ] 5.2 Implement the unified referral drawer while preserving legacy commission data as backend-only read-only audit history.
- [ ] 5.3 Add failing tests for redeemable-only monthly rent, reward-hour exclusion, idempotent checkout, automatic node/listing creation, platform price, income, auto-renew, account switching, and drained expiry.
- [ ] 5.4 Complete the concise card-hour-hosting flow and expose lease, listing, income, next-renewal, disable-renewal, and exit states from server responses.

## 6. Verify and deliver

- [ ] 6.1 Run focused and relevant regression tests, TypeScript checking, changed-file Biome, production build, strict OpenSpec validation, whitespace, protected-scope, identity-precision, added-secret, KAI Logo hash, and deployed green-white website screenshot scans.
- [ ] 6.2 Run isolated write-capable end-to-end tests for recharge sync, referral reward, ad reward, and monthly hosting; run only approved read-only health and account rendering checks against production.
- [ ] 6.3 Deploy the verified website counterpart, package the Windows client, inspect and smoke-test the existing desktop shortcut target/log chain, and record rollback evidence.
- [ ] 6.4 Integrate and push the approved commits to GitLab branch `suanlizhongxin_KOD`; stop and ask the user for every merge or cherry-pick conflict before resolving it.
