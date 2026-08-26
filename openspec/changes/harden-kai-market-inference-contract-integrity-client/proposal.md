## Why

The real colleague feed accepts exact price and quantity facts up to precision 38 and scale 18. Exact subtraction across that domain can require a signed price error with precision 56 and scale 18. Without coordinated strict-string bounds, valid backend responses would fail closed in the renderer.

## What Changes

- Accept canonical predicted price/quantity and verified actual price/quantity at precision 38 / scale 18, and exact signed price-error strings at precision 56 / scale 18, with a shared maximum of 38 integer digits so every accepted value fits backend fixed-scale storage.
- Continue rejecting JSON numbers, exponents, noncanonical zero, excess precision/scale, and malformed values.
- Render the exact server strings without converting through JavaScript `number` or locale formatting.
- Add boundary, failure, component, build, OpenSpec, and protected-scope regression evidence.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `kai-market-inference-client`: authoritative precision-38/scale-18 market-value decoding plus precision-56/scale-18 signed-error decoding and display.

## Impact

The change affects only the Kai inference client schema, its focused tests, and inference presentation tests if needed. Realtime quote sources and algorithms, `simulatedMarket`, website/public assets, KAI Logo, wallet, payment, video, rewards, hosting, local demo, upstream endpoints, and secrets remain protected.
