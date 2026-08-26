# Verification

## Scope and protection

- Branch: `feature/kai-hosting-prediction-lottery-client`.
- Change baseline: `6926e44`.
- Production change is limited to the strict KAI inference decimal decoder. Presentation required no production component change.
- Website/public assets, KAI Logo and branding, quote feeds/calculations, `simulatedMarket`, upstream routing, refresh ownership, payment, video, rewards, hosting, lottery, local demo, and desktop launcher are unchanged.

## TDD evidence

- RED: focused inference tests failed because the previous decoder accepted only precision 18 / scale 8 for market values and precision 26 / scale 8 for `priceError`.
- RED (corrected boundary): a canonical precision-56 / scale-18 signed error from exact subtraction was rejected by the prior precision-38 error schema.
- RED (fixed-scale capacity): the previous raw-character precision check rejected a legal 38-integer-digit value with a trailing fractional zero and did not express the shared 38-integer-digit storage cap.
- GREEN: price, quantity, actual price, and actual quantity remain precision-38 / scale-18 exact strings; signed `priceError` now accepts precision 56 / scale 18, rejects precision 57, and renders the original string unchanged.
- GREEN (fixed-scale capacity): every inference decimal is checked as an exact string using normalized precision, scale, and at most 38 integer digits; 38-digit values with trailing fractional zeroes remain valid while 39-digit values, including normalized tail-zero integers, fail closed without JavaScript `number` coercion.
- Presentation: the existing card rendered the exact long strings without numeric coercion, rounding, or locale formatting; only regression coverage was required.

## Commands and results

- Focused decoder and card: 31/31 passed.
- Related decoder/card/panel: 60/60 passed.
- `pnpm run check`: passed.
- Changed-file Biome: passed.
- `pnpm run build`: passed (main 5,352 modules; preload 82 modules; renderer 15,042 modules). Existing Rollup circular-chunk and size warnings remain unchanged.
- Full `pnpm test -- --run`: 1,802 passed, 54 skipped, 6 failed. The six failures are the already documented unrelated baseline set: default language, first-run migration initialization, Windows skill path separators, `parse_link` tool exposure, and two unconfigured Kod relay tests. None of their files are in this change.
- `openspec validate harden-kai-market-inference-contract-integrity-client --strict`: passed.
- `openspec validate complete-kai-hosting-prediction-lottery-client --strict`: passed.

## Release gates

- Protected-path, secret, upstream-endpoint, and diff scans passed with no scoped violations.
- The prior read-only review of `6926e44..de6a56a` returned Approve YES, Critical 0, Important 0, Minor 0. The precision-56 and fixed-scale integer-cap corrections still require one fresh cumulative read-only review before integration.
- Earlier implementation and tests remain isolated in local commits `9795b29` and `de6a56a`; the precision-56 correction is isolated in `2d7c0ad`; the fixed-scale correction will be isolated before the fresh cumulative review.
- No production deployment or production website mutation was performed.
