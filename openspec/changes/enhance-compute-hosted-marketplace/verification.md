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
- iOS shared renderer build passes; Capacitor sync and native Xcode signing/simulator verification are unavailable because this checkout has no iOS native platform and the host is Windows.
- PowerShell parsing passes for the backend, full-stack and client launchers. The desktop shortcut now targets the full-stack launcher, which validates the backend before starting the final `suanlizhongxin_KOD` checkout with `USE_LOCAL_API=true`.
- The launcher was configuration-tested without starting the real backend because the approved production-database smoke policy is read-only and backend schema initialization is a write operation.

## Full-suite baseline

The full client suite completes with 1403 passing, 54 skipped and 6 existing failures. The failures are outside this change and cover Windows skill-path normalization, the pre-existing default-language expectation, migration initialization, a legacy web-search tool expectation and two legacy ChatboxAI model tests. Focused compute/media/wallet regression suites used by this change are green.

## Delivery

The verified client implementation and launcher update were pushed without force to `origin/suanlizhongxin_KOD`.
