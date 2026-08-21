# Verification record

Date: 2026-08-21

## Toolchain

- Node 22 bundled runtime
- pnpm 10.33.0 project package manager

## Focused evidence

- Marketplace API, projections, admin review, image upload and delivery-time suites pass.
- TypeScript `--noEmit` passes.
- Changed-file Biome CI passes.
- Desktop production build and Web build pass.
- Android Capacitor shared renderer build and sync pass.
- iOS shared renderer build passes; native Xcode signing/simulator verification is not available on this Windows host.

## Full-suite baseline

The full client suite completes with 1394 passing, 54 skipped and 6 existing failures. The failures are outside this change and cover Windows skill-path normalization, the pre-existing default-language expectation, migration initialization, a legacy web-search tool expectation and two legacy ChatboxAI model tests. Focused compute/media/wallet regression suites used by this change are green.
