## 1. Capture RED contract evidence

- [ ] 1.1 Record the clean branch, protected paths, current inference tests, and exact backend precision-38/scale-18 contract.
- [ ] 1.2 Add RED schema tests for maximum valid price/quantity/error strings and invalid numeric, exponent, precision, scale, sign, zero, and canonical-form boundaries.

## 2. Align strict client decoding

- [ ] 2.1 Replace the inference decimal limits with precision 38 / scale 18 while preserving field-specific sign and zero rules.
- [ ] 2.2 Add component coverage proving exact long strings render without `Number`, rounding, or locale conversion.

## 3. Verify and hand off

- [ ] 3.1 Run focused and related Vitest, TypeScript check, changed-file Biome, production build, and full Vitest with baseline classification.
- [ ] 3.2 Run strict OpenSpec, diff/scope/protected/secret scans, and independent review.
- [ ] 3.3 Deliver an isolated local commit for non-force integration; do not modify production website assets or deploy production.
