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

Directory ownership includes wallet identity, realtime view, and normalized GPU model, so route/model changes cancel or isolate late directory responses without overwriting another owner's cache. All inference transports compose caller cancellation with a 15-second hard deadline. Refresh POSTs are single-flight per wallet-and-contract owner, and cached quote timestamps establish a baseline rather than causing a refresh; only a newer successful quote update asks the backend to apply its own cadence and fingerprint policy.

### Demo behavior requires two independent guards

Demo controls require both a loopback API origin and a server capability response. A build-time flag alone cannot expose demo login or data controls.

## Risks / Trade-offs

- Dense hosting information can reduce usability; summaries remain compact and order rows expand on demand.
- Inference may be slow or unavailable; real quotes remain usable and the last successful inference is visibly stale.
- A dismissed draw can be forgotten; the persistent tab displays a pending badge and never auto-consumes it.
- Local demo controls are high-risk if misconfigured; the renderer rejects non-loopback origins even if a server claims demo mode.

## Migration and rollback

Ship backward-compatible API decoders before switching the UI to the new fields. Build and smoke the client against the local backend. Roll back to the previous desktop build without deleting server history. Preserve the existing shortcut path and icon.
