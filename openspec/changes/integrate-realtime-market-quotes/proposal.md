## Why

The colleague-authored compute-market change is now present in the local branch, but it still needs a protected integration audit, executable verification, and a desktop launcher that starts this repository rather than the older `kod-web` checkout. The change must preserve all pre-existing local work and branding while making the shared market feed available for manual client testing.

## What Changes

- Adopt commit `b8c66432632bfa688cb34eccc8e8e4981e7160c3` as the source of truth for the new compute-market panel and its shared server feed.
- Preserve the rebased local commit `47daf9c9a596312a218258987e079e55d9140abe` and all unrelated behavior.
- Verify the new panel, contracts, feature flags, remote-feed adapter, and production build without changing KAI/KOD branding.
- If verification exposes a defect, fix it minimally on top of the colleague implementation with a failing regression test first.
- Update the existing KOD development desktop launcher so it starts the verified `D:\watt\kod` client.
- Record the recoverable Git checkpoint and exact verification evidence.

## Capabilities

### New Capabilities

- `compute-market-live-simulation`: The compute center exposes the colleague-authored market-intelligence panel backed by the shared, server-owned simulated market feed, with explicit provenance, safe endpoint restrictions, and failure behavior.

### Modified Capabilities

None.

## Impact

- Compute-center renderer route and the new `src/renderer/components/compute-market` and `src/renderer/packages/compute-market` modules.
- Build-time feature flags and allowlisted market-feed configuration in Electron and web builds.
- Existing local compute-center changes remain layered above the colleague commit.
- Local developer delivery files under `D:\watt\.kod-local` and the existing `KOD蒜粒-开发版.lnk` launcher are updated only after successful verification.
- No production branding, logo, unrelated settings, or backend code is in scope.
