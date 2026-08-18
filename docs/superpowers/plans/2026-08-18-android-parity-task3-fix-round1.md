# Android Parity Task 3 Fix Round 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Do not delegate this review round.

**Goal:** Close every Task 3 review gap by making mobile shell behavior testable, coupling Android environment/transport/variant, and restoring the complete native platform adapter surface.

**Architecture:** Renderer startup owns a small mobile-runtime initializer that activates safe-area variables for both iOS and Android. Android uses one strict `KOD_ANDROID_ENV=production|localtest` value to generate Capacitor identity and transport; Gradle validates the synchronized config against the requested variant and supplies variant-specific manifest/network/startup resources. Native agent and file capabilities remain Capacitor platform adapters with permissions granted only through Android settings/user actions.

**Tech Stack:** React 18, TypeScript, Vitest/jsdom, Capacitor 7, Android Gradle plugin, Java/JUnit 4.

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

## Global Constraints

- Preserve canonical renderer stores/APIs and Windows behavior.
- Production is `com.kod.app`, HTTPS, cleartext disabled.
- Local test is `com.kod.app.localtest`, visibly marked, with only explicit local HTTP transport.
- Release builds reject synchronized local-test configuration; debug builds reject synchronized production configuration.
- Android permissions remain default-off and user-triggered.
- Product sync/build commands never preload the ENOMEM shim.

---

### Task 1: Renderer regression contracts

**Files:**
- Modify: `src/renderer/components/mobile/MobileBottomNavigation.test.tsx`
- Modify: `src/renderer/routes/-mobile-route-contract.test.tsx`
- Create: `src/renderer/setup/mobile_runtime.test.ts`
- Create: `src/renderer/routes/mobile-my.test.tsx`

**Interfaces:**
- Consumes: current routes, platform adapter, auth/settings hooks.
- Produces: active-state, mobile-only mount, safe-area initialization, exact composer adjacency, and account workflow regression coverage.

- [ ] Add tests asserting one active destination for each top-level route and no navigation on desktop.
- [ ] Add an AST contract requiring root's mobile conditional and immediate selector-expression/InputBox sibling adjacency.
- [ ] Add runtime tests that Android and iOS load safe-area setup while desktop does not.
- [ ] Add interaction tests for logged-out login, account switch token replacement, confirmed/cancelled logout.
- [ ] Run the focused tests and record the expected RED failures.

### Task 2: Android environment and native contracts

**Files:**
- Create: `scripts/android-environment-contract.test.ts`
- Create: `android/app/src/test/java/com/kod/app/AndroidNativeContractTest.java`
- Modify: `package.json`

**Interfaces:**
- Consumes: `KOD_ANDROID_ENV`, synchronized `capacitor.config.json`, Gradle variants, Android manifest/resources.
- Produces: executable identity/transport contract plus native registration/service/resource coverage.

- [ ] Test Capacitor config for literal production/local-test outcomes and invalid-environment rejection.
- [ ] Test that Gradle exposes variant guards and startup environment fields, and that the manifest/resources/native entry point expose required behavior.
- [ ] Run the focused tests/JUnit contract and record RED.

### Task 3: Renderer implementation

**Files:**
- Create: `src/renderer/setup/mobile_runtime.ts`
- Modify: `src/renderer/index.tsx`
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `src/renderer/components/mobile/MobileBottomNavigation.tsx`
- Modify: `src/renderer/setup/mobile_safe_area.ts`

**Interfaces:**
- Produces: `initializeMobileRuntime(target, platform, loader?)` and idempotent `initializeMobileSafeArea()`.

- [ ] Initialize safe-area behavior for Android and iOS through the mobile runtime gate.
- [ ] Mount `MobileBottomNavigation` conditionally in root so desktop never invokes its hooks.
- [ ] Keep mobile navigation active-state behavior exact and run renderer focused tests GREEN.

### Task 4: Environment coupling and startup visibility

**Files:**
- Modify: `capacitor.config.ts`
- Modify: `package.json`
- Modify: `android/app/build.gradle`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/xml/network_security_config.xml`
- Create: `android/app/src/debug/res/xml/network_security_config.xml`
- Create: `android/app/src/main/java/com/kod/app/StartupEnvironmentBanner.java`

**Interfaces:**
- Produces: strict production/local-test config, pre-build mismatch rejection, variant network policy, permission-free auto-dismiss startup banner.

- [ ] Add explicit production and local-test sync scripts around the same renderer/cap sync pipeline.
- [ ] Set config identity/name/scheme/cleartext/mixed-content from the strict enum.
- [ ] Add Gradle JSON verification tasks and wire them to debug/release pre-build tasks.
- [ ] Supply variant BuildConfig environment labels and manifest/network policy.
- [ ] Show and auto-dismiss the resolved environment banner from native startup.

### Task 5: Restore native platform adapters

**Files:**
- Modify: `android/app/src/main/java/com/kod/app/MainActivity.java`
- Create: `android/app/src/main/java/com/kod/app/agent/*.java`
- Create: `android/app/src/test/java/com/kod/app/agent/*.java`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Create: `android/app/src/main/res/xml/kod_accessibility_service.xml`
- Create: `android/app/src/main/res/drawable-nodpi/suanbao_mascot.png`
- Create: `android/app/src/main/res/drawable-nodpi/suanbao_thinking.png`
- Move/modify: `android/app/src/androidTest/java/com/kod/app/ExampleInstrumentedTest.java`

**Interfaces:**
- Produces: registered `AndroidAgentPlugin`/`KodFilePlugin`, accessibility and overlay services, deep links, and BuildConfig-driven instrumentation identity assertions.

- [ ] Copy the completed native adapter implementation and unit tests from the read-only source tree without renderer business code.
- [ ] Merge minimum permissions, services, deep links, accessibility metadata, and assets.
- [ ] Update instrumentation identity assertions for both variants.
- [ ] Run native focused tests and compile both variants as feasible.

### Task 6: Verification, report, and commits

**Files:**
- Modify: `.superpowers/sdd/2026-08-18-android-parity-01-foundation/task-3-report.md`
- Modify: `.superpowers/sdd/2026-08-18-android-parity-01-foundation/progress.md` only if the integration contract belongs in the ledger.

- [ ] Run focused Vitest and Android unit contracts.
- [ ] Run `pnpm run check` and the full suite with the approved test/check-only shim if required.
- [ ] Run unshimmed production sync, validate release guard/build, scan production endpoint config.
- [ ] Run unshimmed local-test sync, validate debug guard/build and APK identity/label.
- [ ] Re-run the opposite-variant guards to prove each mismatch is rejected.
- [ ] Update report with RED/GREEN/build evidence and explicit prod/local integration order.
- [ ] Commit follow-up changes without amending `13f54a4`, then confirm clean tracked status.
