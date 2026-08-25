# Verification evidence

Verified on 2026-08-25 against client range `77d995b..bf57391` and the matching deployed portal/backend release `61902de`.

## Functional and regression evidence

- Focused wallet, market, referral, rewarded-ad, hosting, account-switch, and route suites: `120/120` passed.
- Full client suite from the integrated `suanlizhongxin_KOD` worktree: `158` test files passed, `5` failed, `2` skipped; `1680` tests passed, `6` failed, `54` skipped. The six failures are unchanged pre-existing baselines: default-language expectation, migration seed expectation, Windows discovery path separator, parse-link tool expectation, and two relay tests that require an external relay configuration.
- `pnpm run check`: passed.
- Changed-file Biome check: passed for all 13 changed implementation/test files.
- `pnpm run build`: passed (`5352` main modules, `82` preload modules, `15035` renderer modules).
- The feature implementation was developed with failing account-switch, cache, media, referral, and hosting regression tests before the fixes were applied.

## Scope and production protection

- `git diff --check`: passed; no conflict markers or added credentials were found in the implementation range.
- Client KAI Logo blob is unchanged from the approved baseline: `2eb5ab5058b75aca5887165a29ad78204f16f6c1`.
- The production website static tree SHA-256 was identical before and after deployment: `8a0b96189385f494a90a3fb58189ff75965008595ec2c407211c07faf6ea12cd`.
- No production website UI source, public assets, green/white styling, or KAI Logo was deployed or replaced.
- Colleague realtime-market integration remains the source of truth; the client changes only restore production-compatible routing/fallback behavior.

## Windows delivery

- Electron unpacked Windows application built at `D:\\watt\\kod\\release\\build\\win-unpacked\\Kod.exe`.
- `Kod.exe` SHA-256: `7A1D1F270939849133AFB7D0A19C798DD09156AEEC42870EC600668E2B029628`.
- NSIS installer generation is blocked by the current Windows account's symlink-creation privilege while extracting the signing tool; the unpacked application and the existing desktop development launcher remain usable.
- Existing shortcut `C:\\Users\\Microsoft\\Desktop\\KOD蒜粒-开发版.lnk` retains the approved icon and targets `D:\\watt\\.kod-local\\run-kod-full-stack.ps1` with working directory `D:\\watt\\kod`.
- Launcher smoke reached backend `UP`, database `UP`, Redis `UP`, and renderer HTTP `200` on `localhost:1212`. The verification processes were then stopped; no launcher target or icon rewrite was needed.

## Deployment and rollback

- Production backend image: `kod-backend:runtime-61902de`.
- Production frontend wrapper image: `kod-frontend:market-cors-91f6e2d`; it changes only Nginx proxy configuration and preserves the exact existing static tree.
- Previous backend/frontend images and the pre-deployment database backup are retained for rollback.
- Production validation is read-only: health, market endpoints, CORS preflight, media `HEAD`, and a 1 KiB `Range` request. No production reward, payment, referral, or lease write was used as verification.

## Operational prerequisite

The monthly hosting transaction is deployed, but the platform catalog is intentionally empty until an administrator supplies real KAI SKU inventory and the unified monthly card-hour price. No financial price or inventory was invented during deployment.
