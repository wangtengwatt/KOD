## Context

See `docs/superpowers/specs/2026-08-25-kai-hosting-prediction-lottery-client-design.md`. The backend is the authority for inventory, balances, lease lifecycle, settlements, lottery outcomes, inference cadence, and demo capability. The renderer must not derive financial success or random outcomes from local state.

## Decisions

### Existing compute-center navigation remains the shell

Administrator inventory is added to the existing administrator workspace, hosting cost and income remain in `卡时托管`, lottery is a shared top-level compute tab, and inference is embedded in `实时行情`. No separate website or application is introduced.

### Account ownership precedes UI updates

Every authenticated request captures the current account identity. Checkouts, role switches, draw modals, lease mutations, and awaited invalidations discard stale callbacks after an account change.

### The server owns money, probability, and inference cadence

The client displays decimal strings and source IDs returned by the server. It does not calculate available inventory, income, draw segments, eligibility, reward credit, trade fingerprints, or upstream inference requests.

### Inference contract discovery is same-origin and server-authoritative

The client discovers prediction targets only through authenticated `GET /api/compute/market/inference/contracts`. It decodes the strict string-only directory, filters by the currently selected GPU model, preserves server order, defaults to the first `trading` contract, and lets the user select another matching contract. A model name is never substituted for an opaque contract identifier. Missing, failed, or mismatched directory data disables inference only; authoritative realtime quotes remain usable.

Directory ownership includes wallet identity, realtime view, and normalized GPU model, so route/model changes cancel or isolate late directory responses without overwriting another owner's cache. A background directory error revokes inference request authority while retaining cached directory and inference data for read-only display; a successful directory retry establishes a fresh lifecycle. All inference transports compose caller cancellation with a 15-second hard deadline. Refresh POSTs are single-flight per wallet-and-contract lifecycle and cancel older same-key GETs before applying the POST result. Owner lifecycle generations prevent A→B→A navigation from reviving A's earlier pending state or accepting its late result. Cached quote timestamps establish a baseline rather than causing a refresh; only a newer successful quote update asks the backend to apply its own cadence and fingerprint policy.

### Demo behavior requires two independent guards

Demo controls require both a loopback API origin and a server capability response. A build-time flag alone cannot expose demo login or data controls.

The guarded panel reads and runs the server-owned scenario through the loopback raw endpoints only after capability succeeds. Its compact status view strictly decodes the backend scenario record and displays source IDs, decimal strings, inventory, stage, and reconciliation without synthesizing progress or financial values. A returned demo session is usable only when its strict expiry is later than the renderer's current time.

### Review closure preserves the default shared market feed

The default simulation presentation is the existing shared server feed, not an authorization boundary for inference. Authenticated GPU views may therefore load the same-origin inference directory and inference snapshot while that presentation is active. The client retains every strictly decoded directory record in the query result, but exposes only exact `trading` records as selectable targets because the backend rejects every other status.

### Query cleanup precedes demo-session installation

A role switch cancels and removes the previous owner's compute and wallet queries before installing the returned access-only session. Generation and captured-owner checks run after awaited cleanup, so an external account change wins and broad cleanup never runs against a newly mounted demo role.

### Refresh and precision boundaries remain server-owned

Expanded lease details poll every ten seconds only while visible so pending settlement state can converge. Concurrent safe authenticated reads may converge on a same-account token refresh, but an account-ID change remains a hard replay boundary. Public platform SKU identifiers and DECIMAL(20,3) values remain exact backend strings through decoding and rendering.

## Risks / Trade-offs

- Dense hosting information can reduce usability; summaries remain compact and order rows expand on demand.
- Inference may be slow or unavailable; real quotes remain usable and the last successful inference is visibly stale.
- A dismissed draw can be forgotten; the persistent tab displays a pending badge and never auto-consumes it.
- Local demo controls are high-risk if misconfigured; the renderer rejects non-loopback origins even if a server claims demo mode.

## Migration and rollback

Ship backward-compatible API decoders before switching the UI to the new fields. Build and smoke the client against the local backend. Roll back to the previous desktop build without deleting server history. Preserve the existing shortcut path and icon.
