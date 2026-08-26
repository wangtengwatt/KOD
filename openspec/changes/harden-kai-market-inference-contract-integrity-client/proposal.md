## Why

The real colleague feed accepts exact decimal facts up to precision 38 and scale 18. The backend integrity repair will expose that same domain for predicted and verified events, but the desktop client currently rejects values beyond precision 18/scale 8 (and price error beyond precision 26/scale 8). Without a coordinated strict-string update, valid backend responses would fail closed in the renderer.

## What Changes

- Accept canonical predicted price/quantity, verified actual price/quantity, and signed price-error strings at precision 38 / scale 18.
- Continue rejecting JSON numbers, exponents, noncanonical zero, excess precision/scale, and malformed values.
- Render the exact server strings without converting through JavaScript `number` or locale formatting.
- Add boundary, failure, component, build, OpenSpec, and protected-scope regression evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `kai-market-inference-client`: authoritative precision-38/scale-18 decimal decoding and display.

## Impact

The change affects only the Kai inference client schema, its focused tests, and inference presentation tests if needed. Realtime quote sources and algorithms, `simulatedMarket`, website/public assets, KAI Logo, wallet, payment, video, rewards, hosting, local demo, upstream endpoints, and secrets remain protected.
