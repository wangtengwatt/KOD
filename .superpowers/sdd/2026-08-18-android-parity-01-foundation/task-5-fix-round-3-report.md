# Task 5 fix round 3 report: Simplified Chinese mobile account copy

## Status and root cause

Implemented on `work/android-parity-stage1` from baseline
`5b0c544bcdb5635d0e7a362a5c46b6d2fe325806`.

`/mobile-my` already selected `zh-Hans` and called `t()` for its account copy, but seven route keys were absent from the
real Simplified Chinese resource. i18next therefore returned the English keys. The route test replaced `t()` with an
identity function, so its English selectors could not detect that resource defect.

## TDD evidence

### RED: real Simplified Chinese resource

Before changing either translation resource or production route behavior, the route test was changed to initialize a
real i18next instance with `src/renderer/i18n/locales/zh-Hans/translation.json`. The mocked `Page` boundary also renders
its supplied title so the user-visible `Mine` copy is covered.

Command (Node `v22.23.2`, Corepack `0.34.6`):

```text
corepack pnpm exec vitest run 'src/renderer/routes/-mobile-my.test.tsx' -t 'renders visible account copy from the real Simplified Chinese resource'
```

Result: exit `1`; one focused test failed and six were skipped. Testing Library found the visible heading named `Mine`
instead of the required `我的`; the captured DOM also showed `Not logged in to KOD`, the Android/desktop account sentence,
and `RMB Wallet` in English, while existing resource-backed `登录KOD` and `设置` remained Chinese.

An English resource contract was then added before resource changes:

```text
corepack pnpm exec vitest run 'src/renderer/routes/-mobile-my.test.tsx' -t 'keeps explicit English account copy for every newly localized key'
```

Result: exit `1`; one focused test failed and seven were skipped. The first missing explicit English value was `Mine`
(`expected "Mine", received undefined`).

### GREEN

The smallest implementation added the seven required `zh-Hans` values and explicit English values for the six missing
English keys; the pre-existing English `Log out` value was retained. `mobile-my.tsx` was not changed.

```text
corepack pnpm exec vitest run 'src/renderer/routes/-mobile-my.test.tsx'
```

Result: exit `0`; one test file passed, `8/8` tests passed.

## Verification

- `corepack pnpm run check`: exit `0` (`npx tsc --noEmit`).
- Both changed translation files parsed with `JSON.parse`: two parse checks passed.
- `corepack pnpm exec biome format` on both resources and the focused test: exit `0`, three files checked, no fixes
  applied.
- `git diff --check`: exit `0`.

## Files

- `src/renderer/routes/-mobile-my.test.tsx`
- `src/renderer/i18n/locales/zh-Hans/translation.json`
- `src/renderer/i18n/locales/en/translation.json`
- `.superpowers/sdd/2026-08-18-android-parity-01-foundation/task-5-fix-round-3-report.md`

## Commit and concerns

This report is included in the delivery commit, so embedding that commit's immutable self-hash would change the hash.
Resolve it with `git rev-parse HEAD`; the exact SHA is supplied in the controller handoff after commit creation.

No account/session/asset behavior, route structure, API calls, language persistence, fallback architecture, or other
locales changed. No APK was built, no emulator was started, and nothing was pushed. No remaining concern was identified.
