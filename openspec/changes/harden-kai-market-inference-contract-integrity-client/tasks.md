## 1. Capture RED contract evidence

- [x] 1.1 Record the clean branch, protected paths, current inference tests, and exact backend precision-38/scale-18 contract.
- [x] 1.2 Add RED schema tests for maximum valid price/quantity/error strings and invalid numeric, exponent, precision, scale, sign, zero, and canonical-form boundaries.

## 2. Align strict client decoding

- [x] 2.1 Replace the inference decimal limits with precision 38 / scale 18 while preserving field-specific sign and zero rules.
- [x] 2.2 Add component coverage proving exact long strings render without `Number`, rounding, or locale conversion.
- [x] 2.3 Expand only signed `priceError` to precision 56 / scale 18 and prove its exact maximum-domain decoding and rendering while price and quantity remain bounded at precision 38.

## 3. Verify and hand off

- [x] 3.1 Run focused and related Vitest, TypeScript check, changed-file Biome, production build, and full Vitest with baseline classification.
- [x] 3.2 Run strict OpenSpec, diff/scope/protected/secret scans, and independent review.
- [x] 3.3 Deliver an isolated local commit for non-force integration; do not modify production website assets or deploy production.
- [ ] 3.4 Obtain a fresh cumulative read-only review for the precision-56 correction and fix every Critical/Important finding before integration.
