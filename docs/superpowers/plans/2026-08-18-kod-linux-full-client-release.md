# KOD Linux Full Client Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship KOD Linux 0.1.0 with the complete existing desktop feature set as native x64/arm64 AppImage and `.deb` packages, publish a verified GitHub Release, and expose working downloads and update feeds on `https://kod.kai.com/download`.

**Architecture:** `D:\watt\kod` remains the single product-source repository: Electron main/preload/renderer/shared code is reused, while Linux differences live in focused main-process services and typed platform contracts. Native Ubuntu x64 and ARM64 CI jobs build the packages, a release-verification layer proves package/update metadata integrity, and `D:\watt\kod-ai-portal` consumes a generated release manifest while Nginx serves the updater feed and redirects binary requests to GitHub. Production is promoted only after the GitHub Release exists, with the current frontend image retained under a rollback tag.

**Tech Stack:** Node.js 22.12.0, pnpm 10.33.0, TypeScript 5.8, Electron 35, Electron Vite 4, electron-builder 26.8, electron-updater 6.8, React 18 and Zustand 5 (desktop), Vitest 4, Playwright 1.55.0, Rsbuild 2 and React 19 (portal), Nginx, Docker Compose, GitHub Actions.

**Spec:** `docs/superpowers/specs/2026-08-18-linux-full-client-release-design.md`

## Global Constraints

- The canonical client source is `D:\watt\kod`, branch `suanlizhongxin_KOD`; do not create a Linux business-code fork or wrap the website in a WebView.
- Release version is exactly `0.1.0`; the Git tag is exactly `linux-v0.1.0`.
- Public release assets are exactly `KOD-0.1.0-x64.AppImage`, `KOD-0.1.0-x64.deb`, `KOD-0.1.0-arm64.AppImage`, `KOD-0.1.0-arm64.deb`, `SHA256SUMS`, `latest-linux.yml`, and `latest-linux-arm64.yml`.
- Certified systems are Ubuntu 22.04, Ubuntu 24.04, and Debian 12 on X11 and Wayland; other distributions are best-effort through AppImage.
- Build x64 on native `ubuntu-22.04` and arm64 on native `ubuntu-22.04-arm`; never use Windows cross-packaging for final artifacts.
- AppImage uses electron-builder toolset runtime `1.0.2` so FUSE2 is not a launch prerequisite.
- `.deb` declares `bubblewrap`, `socat`, `ripgrep`, and the Linux desktop/keyring libraries; AppImage performs a read-only preflight and never runs `sudo`.
- Passwords, account tokens, provider API keys, provider OAuth credentials, credential-bearing proxy URLs, MCP environment values, and MCP HTTP headers never persist as plaintext or `basic_text` ciphertext.
- If Secret Service/KWallet is unavailable, insecure, or locked, the current session continues in memory, but secrets are not remembered and the UI gives the matching install/unlock recovery action.
- The local task tool continues to use Anthropic Sandbox Runtime with `bubblewrap`; a failed preflight never falls back to unsandboxed execution.
- AppImage updates automatically through electron-updater; `.deb` updates only notify and open the official download page.
- The update base URL is `https://kod.kai.com/api/auto_upgrade/`; new Linux code must not contact Chatbox update domains.
- Production automation and smoke tests never mutate real wallet, recharge, order, withdrawal, identity-verification, or GPU-delivery data.
- Every binary includes the existing `LICENSE` and `NOTICE`; release notes link to the complete source at the exact release tag and add no GPLv3-incompatible restriction.
- Release order is fixed: verify client -> publish GitHub Release -> update and verify portal -> deploy frontend only -> verify public endpoints -> retain rollback evidence.
- Do not stage, rewrite, or remove unrelated existing work in either repository. Commit only the files listed for the current task.
- Never print or read production `.env`, private keys, signing materials, tokens, or stored credentials during build or deployment.
- Every PowerShell block in this plan runs under PowerShell 7.4+ (`pwsh`), never Windows PowerShell 5.1. Each release/deployment session first asserts `$PSVersionTable.PSVersion -ge [version]'7.4'`, then sets `$ErrorActionPreference = 'Stop'` and `$PSNativeCommandUseErrorActionPreference = $true`; Bash sessions use `set -euo pipefail`, except commands whose nonzero status is explicitly captured and checked.
- Before Task 1, if `pwsh` is absent, install the official package with `winget install --id Microsoft.PowerShell --exact`, open a new `pwsh`, and keep implementation/release blocks in that shell; Task 11 rechecks rather than assuming the prerequisite persisted.
- Every task uses failing tests first, finishes with focused plus relevant regression tests, and creates an intentional commit before the next task begins.

---

## File Structure

### Canonical client repository: `D:\watt\kod`

- `src/shared/linux-release-contract.ts` — immutable 0.1.0 tag, filenames, feed URL, architectures, and package formats.
- `src/shared/linux-system.ts` — typed Linux capability status, error codes, recovery actions, updater payloads, and secure-storage status.
- `src/shared/sensitive-settings.ts` — pure split/merge logic that removes secret fields from ordinary settings persistence.
- `src/main/secure-store.ts` — `safeStorage`-backed encrypted key/value store with memory-only fallback.
- `src/main/settings-persistence.ts` — secure settings migration, active-file sanitization, and backup sanitization.
- `src/main/log-redaction.ts` — recursive value/text redaction for tokens, credential URLs, identity data, and private paths.
- `src/main/linux/system-dependencies.ts` — executable and user-namespace preflight for AppImage and sandbox use.
- `src/main/linux/desktop-integration.ts` — per-user AppImage XDG desktop entry, icon, MIME protocol, and database refresh.
- `src/main/linux/auto-launch.ts` — XDG autostart implementation used by `autoLauncher.ts` on Linux.
- `src/main/mcp/command-preflight.ts` — login-shell/PATH executable resolution and structured stdio launch failures.
- `src/main/update-policy.ts` — package-mode detection, KOD feed selection, download policy, and install action.
- `src/renderer/stores/authSecureStorage.ts` — Zustand async persistence that keeps tokens in secure IPC storage and email in local storage.
- `src/renderer/components/linux/LinuxPreflightAlert.tsx` — actionable Linux capability warning without blocking unrelated modules.
- `src/renderer/i18n/linuxErrors.ts` — stable error-code-to-translation-key mapping.
- `scripts/linux/verify-feature-matrix.ts` — schema/evidence gate for all approved desktop feature domains.
- `scripts/linux/generate-release-metadata.ts` — checksum, size, updater YAML, and portal-manifest generator.
- `scripts/linux/verify-release.ts` — artifact, architecture, metadata, license, checksum, and updater-feed verifier.
- `scripts/linux/verify-public-release.ts` — production manifest/header/redirect verifier tied to the locally downloaded seven assets.
- `scripts/linux/release-current-arch.ts` — native-host-only local build/normalize/partial-verification runner.
- `scripts/linux/test-deb-container.sh` — distro install/start check for Ubuntu 22.04/24.04 and Debian 12.
- `scripts/linux/run-gui-smoke.sh` — Xvfb and headless-Weston launcher with deterministic cleanup.
- `scripts/linux/verify-native-evidence.ts` — hash-bound native package/display/distro evidence validator used before aggregation.
- `src/main/smoke-test-policy.ts` — test-mode-only network/mutation guard and deterministic tray injection boundary.
- `test/e2e/linux-smoke.spec.ts` — packaged Electron smoke tests for route, preload, window, deep link, MCP, sandbox, and updater behavior.
- `test/e2e/fixtures/update/fixture-server.ts` — loopback GenericProvider feed with real byte/hash download verification and no production mutation.
- `docs/linux/feature-matrix.json` — machine-readable shared/Linux implementation mapping and evidence references.
- `docs/linux/acceptance/0.1.0.json` — recorded architecture/display/distro/manual acceptance evidence.
- `docs/linux/release-report-0.1.0.md` — final package, release, portal, production, and rollback record.
- `release-notes/linux-v0.1.0.md` — GitHub Release notes with requirements, install/update/checksum/license/source instructions.
- `electron-builder-linux.yml` — isolated Linux packaging and GitHub publish configuration.
- `.github/actions/setup-kod/action.yml` — shared exact Node/pnpm/install setup repeated in every isolated release job.
- `.github/workflows/linux-release.yml` — quality, native build, smoke, verification, and non-draft release workflow.

### Official portal repository: `D:\watt\kod-ai-portal`

- `frontend/src/releases/linuxRelease.ts` — strict manifest parser and architecture/format selector.
- `frontend/src/releases/linuxRelease.test.ts` — manifest validation tests.
- `frontend/src/components/download/LinuxDownloadCard.tsx` — accessible primary and alternate Linux downloads.
- `frontend/src/components/download/LinuxDownloadCard.test.tsx` — loading/error/link/keyboard coverage.
- `frontend/src/routes/download.test.tsx` — Linux-region integration without constraining other platform cards.
- `frontend/src/hooks/useLinuxRelease.ts` — React Query loader for `/download/linux/latest.json`.
- `frontend/src/test/setup.ts` and `frontend/vitest.config.ts` — frontend component-test environment.
- `frontend/scripts/verify-linux-release.mjs` — checked-in manifest/feed/link consistency gate.
- `frontend/public/download/linux/latest.json` — generated public manifest with four GitHub asset links, sizes, and SHA-256 values.
- `frontend/public/api/auto_upgrade/latest-linux.yml` — x64 AppImage updater metadata copied from the verified release.
- `frontend/public/api/auto_upgrade/latest-linux-arm64.yml` — arm64 AppImage updater metadata copied from the verified release.
- `frontend/nginx.conf` — exact no-cache feeds, allowlisted asset redirect, health endpoint, and unchanged generic API proxy.
- `docker-compose.yml` — frontend container healthcheck only; backend dependencies and lifecycle remain unchanged.
- `.github/workflows/frontend.yml` — frontend test/build/manifest/Nginx/Compose gate.
- `document/KOD-Linux-0.1.0-发布与回滚.md` — operator runbook and actual deployment/rollback evidence.

---

### Task 1: Freeze the Linux release contract and feature-evidence schema

**Files:**
- Create: `src/shared/linux-release-contract.ts`
- Create: `src/shared/linux-release-contract.test.ts`
- Create: `scripts/linux/verify-feature-matrix.ts`
- Create: `scripts/linux/verify-feature-matrix.test.ts`
- Create: `docs/linux/feature-matrix.json`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `linuxReleaseContract`, `LinuxArch`, `LinuxPackageFormat`, `LinuxArtifactName`, and `assertLinuxReleaseVersion(version, tag)`.
- Produces `validateLinuxFeatureMatrix(value, { release, repoRoot, acceptance }): MatrixValidationResult`, where release mode cross-links every manual ID to recorded passing evidence.
- Produces `pnpm linux:matrix:check` for development and `pnpm linux:matrix:release` for the strict release gate.

- [ ] **Step 1: Extend Vitest discovery and write the failing contract test**

Add `scripts/**/*.{test,spec}.{ts,tsx}` to `vitest.config.ts`, then create:

```ts
import { describe, expect, it } from 'vitest'
import { assertLinuxReleaseVersion, linuxReleaseContract } from './linux-release-contract'

describe('linuxReleaseContract', () => {
  it('locks the approved version, tag, feed, and public assets', () => {
    expect(linuxReleaseContract.version).toBe('0.1.0')
    expect(linuxReleaseContract.tag).toBe('linux-v0.1.0')
    expect(linuxReleaseContract.feedBaseUrl).toBe('https://kod.kai.com/api/auto_upgrade/')
    expect(linuxReleaseContract.assets).toEqual([
      'KOD-0.1.0-x64.AppImage',
      'KOD-0.1.0-x64.deb',
      'KOD-0.1.0-arm64.AppImage',
      'KOD-0.1.0-arm64.deb',
      'SHA256SUMS',
      'latest-linux.yml',
      'latest-linux-arm64.yml',
    ])
  })

  it('rejects a package/tag mismatch', () => {
    expect(() => assertLinuxReleaseVersion('0.1.1', 'linux-v0.1.0')).toThrow('Linux release mismatch')
  })
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `pnpm exec vitest run src/shared/linux-release-contract.test.ts`

Expected: FAIL because `linux-release-contract.ts` does not exist.

- [ ] **Step 3: Implement the immutable release contract**

```ts
export const linuxArchitectures = ['x64', 'arm64'] as const
export type LinuxArch = (typeof linuxArchitectures)[number]
export const linuxPackageFormats = ['AppImage', 'deb'] as const
export type LinuxPackageFormat = (typeof linuxPackageFormats)[number]

export const linuxReleaseContract = {
  version: '0.1.0',
  tag: 'linux-v0.1.0',
  repository: 'wangtengwatt/KOD',
  downloadPageUrl: 'https://kod.kai.com/download',
  feedBaseUrl: 'https://kod.kai.com/api/auto_upgrade/',
  assets: [
    'KOD-0.1.0-x64.AppImage',
    'KOD-0.1.0-x64.deb',
    'KOD-0.1.0-arm64.AppImage',
    'KOD-0.1.0-arm64.deb',
    'SHA256SUMS',
    'latest-linux.yml',
    'latest-linux-arm64.yml',
  ],
} as const

export type LinuxArtifactName = (typeof linuxReleaseContract.assets)[number]

export function assertLinuxReleaseVersion(version: string, tag: string): void {
  if (version !== linuxReleaseContract.version || tag !== linuxReleaseContract.tag) {
    throw new Error(`Linux release mismatch: version=${version}, tag=${tag}`)
  }
}
```

- [ ] **Step 4: Write matrix-validator tests before the validator**

```ts
import { describe, expect, it } from 'vitest'
import { validateLinuxFeatureMatrix } from './verify-feature-matrix'

const valid = {
  schemaVersion: 1,
  release: '0.1.0',
  features: [{
    id: 'chat.conversation',
    implementation: { kind: 'shared', files: ['src/renderer/routes/index.tsx'] },
    automatedEvidence: ['src/renderer/stores/chatStore.test.ts'],
    manualCheckId: 'chat-basic',
    status: 'verified',
  }],
}

describe('validateLinuxFeatureMatrix', () => {
  it('rejects a release entry without implementation or evidence', () => {
    const broken = structuredClone(valid)
    broken.features[0].automatedEvidence = []
    broken.features[0].manualCheckId = ''
    expect(validateLinuxFeatureMatrix(broken, { release: true, repoRoot: process.cwd() }).errors)
      .toContain('chat.conversation has no evidence')
  })

  it('rejects planned and duplicate entries in release mode', () => {
    const broken = structuredClone(valid)
    broken.features.push({ ...broken.features[0], status: 'planned' })
    expect(validateLinuxFeatureMatrix(broken, { release: true, repoRoot: process.cwd() }).ok).toBe(false)
  })

  it('rejects manual evidence that failed, targets another tree, or misses the required platform matrix', () => {
    expect(validateLinuxFeatureMatrix(valid, {
      release: true,
      repoRoot: fixtureRepo,
      acceptance: acceptanceFixture({ result: 'failed', testedCommit: 'deadbeef', displays: ['x11'] }),
    }).ok).toBe(false)
  })
})
```

- [ ] **Step 5: Implement the validator and checked-in matrix**

The JSON must contain these exact feature IDs, each with `implementation.kind` (`shared` or `linux-adapter`), at least one real source file, at least one automated evidence path or manual check ID, and initial `status: "planned"`:

| Feature ID | Required coverage |
|---|---|
| `identity.login-registration` | login, registration, verification code |
| `identity.account-switch-logout` | saved accounts, switch, logout, role entry |
| `chat.conversation-history` | create/send/regenerate/history/branch |
| `chat.models` | provider, model selection, relay/KAI models |
| `chat.attachments-search` | file/image attachments and web search |
| `data.import-export` | conversation/settings import and export |
| `media.image-generation` | image creation and local history |
| `media.video-generation` | video creation and local history |
| `knowledge.library-rag` | knowledge library and session RAG |
| `copilots.library` | featured, personal, search, edit |
| `tools.mcp` | stdio plus HTTP/SSE MCP |
| `tools.skills` | discovery, install, update, delete, execute |
| `tasks.local-sandbox` | isolated read/write/search/exec/kill/reset |
| `compute.models-relay-nodes` | KAI model, relay station, node selection |
| `compute.wallet-recharge-card-hours` | wallet, recharge, transaction history |
| `compute.market-orders` | buyer/seller market and order flow |
| `compute.notifications-admin` | notifications and authorized operations entry |
| `data.cross-device-sync` | account-scoped sync and reconciliation |
| `settings.proxy-shortcuts` | settings, proxy, shortcuts |
| `desktop.files-browser` | dialogs, save/export, external browser |
| `desktop.window-tray` | X11/Wayland controls and tray degradation |
| `desktop.autostart-deeplink` | XDG autostart and `kod://` cold/warm launch |
| `desktop.update-logs` | package-aware updater and redacted logs |

`validateLinuxFeatureMatrix` must reject unknown keys, duplicate IDs, missing implementation files, `planned` status in release mode, empty evidence, and any case-insensitive unfinished-content marker (`place` + `holder`, `later`, or `not-supported`). In release mode it also loads `docs/linux/acceptance/0.1.0.json`: every `manualCheckId` must resolve to a `passed` record; the record's `testedCommit` must be an ancestor of `HEAD`; and `git diff --quiet <testedCommit>..HEAD -- <that feature's implementation and automated-evidence paths>` must prove no covered code changed after the check. Package/display features additionally require passing records for both architectures, all three certified distributions, and both X11 and Wayland. Unknown evidence IDs, duplicate records, failed/skipped results, missing commands/timestamps, or a changed covered path block release.

- [ ] **Step 6: Add commands and run the development gate**

Add:

```json
"linux:matrix:check": "tsx scripts/linux/verify-feature-matrix.ts docs/linux/feature-matrix.json",
"linux:matrix:release": "tsx scripts/linux/verify-feature-matrix.ts docs/linux/feature-matrix.json --release"
```

Run:

```powershell
pnpm exec vitest run src/shared/linux-release-contract.test.ts scripts/linux/verify-feature-matrix.test.ts
pnpm linux:matrix:check
pnpm check
```

Expected: all commands PASS; the strict `--release` command is intentionally deferred until Task 10 records evidence and changes every status to `verified`.

- [ ] **Step 7: Commit Task 1**

```powershell
git add package.json vitest.config.ts src/shared/linux-release-contract.ts src/shared/linux-release-contract.test.ts scripts/linux/verify-feature-matrix.ts scripts/linux/verify-feature-matrix.test.ts docs/linux/feature-matrix.json
git commit -m "chore(linux): lock release contract and feature matrix"
```

---

### Task 2: Move settings secrets into safeStorage and sanitize legacy backups

**Files:**
- Create: `src/shared/sensitive-settings.ts`
- Create: `src/shared/sensitive-settings.test.ts`
- Create: `src/main/secure-store.ts`
- Create: `src/main/secure-store.test.ts`
- Create: `src/main/settings-persistence.ts`
- Create: `src/main/settings-persistence.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/store-node.ts`

**Interfaces:**
- Produces `splitSensitiveSettings(settings): { publicSettings; secrets }` and `mergeSensitiveSettings(publicSettings, secrets)`.
- Produces `SecureStore.status()`, `getJson<T>(key)`, `setJson(key, value)`, and `delete(key)`.
- Produces `initializeSettingsPersistenceAfterAppReady(): Promise<void>` plus synchronous cached `getSettings()` and `SettingsPersistence.get()`, `set(value)`, `delete()`, and `sanitizeLegacyBackups()`.
- Consumes the ordinary `electron-store` instance but persists secret envelopes only as `base64` ciphertext from an approved safeStorage backend.

- [ ] **Step 1: Write failing secret split/merge tests**

```ts
import { describe, expect, it } from 'vitest'
import { mergeSensitiveSettings, splitSensitiveSettings } from './sensitive-settings'

describe('sensitive settings', () => {
  it('removes every credential-bearing field and round-trips it', () => {
    const settings = {
      providers: { openai: { apiKey: 'sk-secret', oauth: { accessToken: 'at', refreshToken: 'rt' } } },
      customProviders: [{ id: 'custom', isCustom: true, defaultSettings: { secretKey: 'aws-secret' } }],
      licenseKey: 'license-secret',
      memorizedManualLicenseKey: 'manual-secret',
      extension: {
        webSearch: { tavilyApiKey: 'search-secret' },
        documentParser: { type: 'mineru', mineru: { apiToken: 'mineru-secret' } },
      },
      proxy: 'http://user:pass@127.0.0.1:8080',
       mcp: { servers: [
        { id: 'stdio', transport: { type: 'stdio', command: 'node', args: ['--read-token=arg-secret', '--api-key', 'split-secret'], env: { TOKEN: 'mcp-secret' } } },
        { id: 'http', transport: { type: 'http', url: 'https://user:url-secret@mcp.example/sse?token=query-secret', headers: { Authorization: 'Bearer secret' } } },
      ] },
      theme: 0,
    }
    const split = splitSensitiveSettings(settings)
    const persisted = JSON.stringify(split.publicSettings)
    for (const secret of ['sk-secret', 'at', 'rt', 'aws-secret', 'license-secret', 'manual-secret', 'search-secret', 'mineru-secret', 'pass', 'mcp-secret', 'arg-secret', 'split-secret', 'url-secret', 'query-secret', 'Bearer secret']) {
      expect(persisted).not.toContain(secret)
    }
    expect(mergeSensitiveSettings(split.publicSettings, split.secrets)).toEqual(settings)
  })
})
```

- [ ] **Step 2: Run the split/merge test and verify red**

Run: `pnpm exec vitest run src/shared/sensitive-settings.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement deterministic JSON-pointer extraction**

Use a versioned `SensitiveSettingsPayload` containing JSON-pointer/value pairs. Extract provider `apiKey`, `oauth`, `accessKey`, `secretKey`, and `sessionToken`; custom-provider default credentials; `licenseKey`, `licenseInstances`, `licenseDetail`, and `memorizedManualLicenseKey`; `extension.webSearch.tavilyApiKey`, `bochaApiKey`, and `queritApiKey`; `extension.documentParser.mineru.apiToken`; a proxy string only when URL userinfo exists; every MCP stdio `env`; every MCP HTTP `headers`; and an MCP HTTP/SSE URL when it has userinfo or sensitive query keys. Parse stdio argument arrays as a sequence: encrypt a whole `--token=value`/`--api-key=value`/credential-bearing-URL element, and for `--token value`, `--api-key value`, `--password value`, `Authorization value`, or URL-taking credential flags encrypt the following value element while retaining the nonsecret flag. Reject a credential flag with no value rather than persisting an ambiguous transport. Include both the real `--read-token=...` registry shape and the split `['--api-key', 'secret']` shape in round-trip tests. Leave typed pointer markers so merge restores the exact array. Delete empty parent objects from `publicSettings`, sort pointers lexicographically, deep-clone inputs, and reject `__proto__`, `prototype`, and `constructor` path segments during merge.

- [ ] **Step 4: Write failing secure-store tests**

```ts
it('persists only encrypted ciphertext when the backend is approved', async () => {
  const disk = new Map<string, unknown>()
  const secure = new SecureStore(fakeBackend('gnome_libsecret'), mapStore(disk))
  await secure.setJson('settings-secrets-v1', { apiKey: 'sk-secret' })
  expect(JSON.stringify([...disk.values()])).not.toContain('sk-secret')
  await expect(secure.getJson('settings-secrets-v1')).resolves.toEqual({ apiKey: 'sk-secret' })
})

it.each(['basic_text', 'unavailable'] as const)('uses memory only for %s', async (backend) => {
  const disk = new Map<string, unknown>()
  const secure = new SecureStore(fakeBackend(backend), mapStore(disk))
  await secure.setJson('auth-tokens-v1', { accessToken: 'secret' })
  expect(disk.size).toBe(0)
  await expect(secure.getJson('auth-tokens-v1')).resolves.toEqual({ accessToken: 'secret' })
})

it('distinguishes a locked approved keyring from a missing backend', async () => {
  const disk = new Map<string, unknown>()
  const secure = new SecureStore(fakeBackend('kwallet', { encryptionAvailable: false }), mapStore(disk))
  expect(await secure.status()).toMatchObject({
    persistence: 'memory-only', reasonCode: 'LINUX_KEYRING_LOCKED',
  })
  expect(disk.size).toBe(0)
})
```

- [ ] **Step 5: Implement SecureStore with explicit backend status**

Use this public contract:

```ts
export type SafeStorageBackend =
  | 'gnome_libsecret' | 'kwallet' | 'kwallet5' | 'kwallet6'
  | 'windows_dpapi' | 'macos_keychain'
  | 'basic_text' | 'unknown' | 'unavailable'

export interface SecureStorageStatus {
  available: boolean
  backend: SafeStorageBackend
  persistence: 'encrypted' | 'memory-only'
  reasonCode?: 'LINUX_KEYRING_UNAVAILABLE' | 'LINUX_KEYRING_INSECURE_BACKEND' | 'LINUX_KEYRING_LOCKED'
}

export interface EncryptedEnvelope {
  version: 1
  algorithm: 'electron-safeStorage'
  ciphertext: string
}
```

On Linux, approved backends are `gnome_libsecret`, `kwallet`, `kwallet5`, and `kwallet6`. An approved backend that reports encryption unavailable maps to `LINUX_KEYRING_LOCKED`; `basic_text` maps to `LINUX_KEYRING_INSECURE_BACKEND`; `unknown`, backend exceptions, and missing encryption map to `LINUX_KEYRING_UNAVAILABLE`. On Windows, `safeStorage.isEncryptionAvailable()` after ready maps to `windows_dpapi`; on macOS it maps to `macos_keychain`; neither platform is classified from the Linux-only backend string. Add explicit Windows/macOS persistence tests and preserve their current encrypted behavior. Every genuinely unavailable case uses a process-local `Map` and never calls the persistent adapter.

- [ ] **Step 6: Write migration and backup-sanitization tests**

Use temporary fixture JSON files. Prove that initialization after an initial pre-ready `unknown` probe re-evaluates to an approved backend; first read returns complete legacy settings in the synchronous cache; migration writes the encrypted vault to a temporary key, reads/decrypts and deep-compares it, atomically commits that vault, and only then atomically rewrites `config.json` without extracted secrets. A write/read verification failure must leave the original plaintext file untouched and block window creation. Also atomically sanitize every filename accepted by `configBackupFilenamePattern`, refuse any backup path that resolves outside `app.getPath('userData')`, and prove Windows DPAPI/macOS Keychain never take the memory-only Linux path.

- [ ] **Step 7: Implement SettingsPersistence and wire existing IPC**

Replace direct `settings` handling in `getStoreValue`, `setStoreValue`, `delStoreValue`, `getAllStoreKeys`, `getAllStoreValues`, and `setAllStoreValues` with `SettingsPersistence`. Leave `configs`, `configVersion`, and every other nonsensitive file-store key unchanged. Single-key `getStoreValue('settings')` returns merged settings from an initialized in-memory cache so existing synchronous consumers keep their contract; any pre-initialization read throws `SETTINGS_PERSISTENCE_NOT_READY` instead of returning incomplete data. `getAllStoreValues()` returns the complete ordinary store with only `settings` replaced by `publicSettings`; it and `getAllStoreKeys()` exclude internal vault/saved-login keys and ciphertext. `setAllStoreValues()` accepts a legacy complete import, preserves its nonsensitive keys, immediately splits any credential fields inside settings, and sends them to encrypted storage or current-process memory according to status. Tests round-trip `configs`/`configVersion` while proving exports contain no secret or internal secure-store key.

In `main.ts`, await `app.whenReady()`, call `initializeSettingsPersistenceAfterAppReady()`, and only after it succeeds dynamically import/start knowledge-base code, Sentry/adapters, backup, tray, updater, and window creation. Remove all `store-node.ts` import-time backup/migration side effects and audit the static import graph so nothing can synchronously call `getSettings()` before initialization. Only after migration and `sanitizeLegacyBackups()` finish may `autoBackup()` start. Catch/log only the structured error code, not file contents; initialization failure shows a safe startup error and creates no renderer.

- [ ] **Step 8: Run security and storage regressions**

```powershell
pnpm exec vitest run src/shared/sensitive-settings.test.ts src/main/secure-store.test.ts src/main/settings-persistence.test.ts src/renderer/stores/settingsStore.persist.test.ts src/renderer/stores/migration.test.ts
pnpm check
pnpm lint
```

Expected: PASS, and a fixture scan confirms no secret literal exists in the public config, sanitized backup files, or a JSON export produced by `getAllStoreValues()`.

- [ ] **Step 9: Commit Task 2**

```powershell
git add src/shared/sensitive-settings.ts src/shared/sensitive-settings.test.ts src/main/secure-store.ts src/main/secure-store.test.ts src/main/settings-persistence.ts src/main/settings-persistence.test.ts src/main/main.ts src/main/store-node.ts
git commit -m "feat(linux): protect persisted settings secrets"
```

---

### Task 3: Persist account tokens securely and show keyring recovery guidance

**Files:**
- Create: `src/shared/linux-system.ts`
- Create: `src/renderer/stores/authSecureStorage.ts`
- Create: `src/renderer/stores/authSecureStorage.test.ts`
- Create: `src/renderer/components/system/SecureStorageWarning.tsx`
- Create: `src/renderer/components/system/SecureStorageWarning.test.tsx`
- Create: `src/renderer/i18n/linuxErrors.ts`
- Create: `src/renderer/i18n/linuxErrors.test.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/electron-types.ts`
- Modify: `src/renderer/platform/interfaces.ts`
- Modify: `src/renderer/platform/desktop_platform.ts`
- Modify: `src/renderer/platform/test_platform.ts`
- Modify: `src/renderer/stores/authInfoStore.ts`
- Modify: `src/renderer/stores/authInfoStore.test.ts`
- Modify: `src/renderer/index.tsx`
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `src/renderer/routes/settings/provider/chatbox-ai/-components/EmailCodeLoginModal.tsx`
- Modify: `src/renderer/i18n/locales/en/translation.json`
- Modify: `src/renderer/i18n/locales/zh-Hans/translation.json`

**Interfaces:**
- Produces typed IPC methods `secureStorageStatus()`, `getSecureSecret(key)`, `setSecureSecret(key, value)`, and `deleteSecureSecret(key)` under optional `Platform.desktopSecurity`; `DesktopPlatform` implements it and `TestPlatform` can inject it.
- Produces `createAuthSecureStorage(platform, localStorage)`, `migrateLegacyAuthInfo(input)`, and `initAuthInfoStore(): Promise<void>`.
- Produces stable recovery mappings for `LINUX_KEYRING_UNAVAILABLE`, `LINUX_KEYRING_INSECURE_BACKEND`, and `LINUX_KEYRING_LOCKED`.

All main/preload/renderer Linux failures use one shared contract:

```ts
export type LinuxSystemErrorCode =
  | 'SETTINGS_PERSISTENCE_NOT_READY'
  | 'LINUX_DEPENDENCY_MISSING'
  | 'LINUX_USER_NAMESPACE_DISABLED'
  | 'LINUX_PERMISSION_DENIED'
  | 'LINUX_KEYRING_UNAVAILABLE'
  | 'LINUX_KEYRING_INSECURE_BACKEND'
  | 'LINUX_KEYRING_LOCKED'
  | 'LINUX_SECURE_STORAGE_KEY_REJECTED'
  | 'LINUX_PREFLIGHT_FAILED'
  | 'LINUX_DISPLAY_UNSUPPORTED'
  | 'LINUX_UPDATE_MANIFEST_INVALID'
  | 'LINUX_ARCH_MISMATCH'
  | 'LINUX_XDG_PATH_REJECTED'
  | 'MCP_COMMAND_NOT_FOUND'
  | 'MCP_SHELL_ENVIRONMENT_FAILED'
  | 'SMOKE_MUTATION_BLOCKED'
  | 'NETWORK_FAILURE'

export interface LinuxSystemError {
  code: LinuxSystemErrorCode
  messageKey: string
  recoveryKey: string
  details?: Record<string, string | number | boolean>
}
```

- [ ] **Step 1: Add failing typed IPC and auth-storage tests**

```ts
it('stores email locally and tokens only through secure IPC', async () => {
  const local = memoryStorage()
  const secure = memorySecurePlatform({ available: true, backend: 'gnome_libsecret', persistence: 'encrypted' })
  const storage = createAuthSecureStorage(secure, local)
  await storage.setItem('kod-auth-info-v1', JSON.stringify({
    state: { loginEmail: 'user@example.com', accessToken: 'access', refreshToken: 'refresh' },
    version: 1,
  }))
  expect(local.dump()).toContain('user@example.com')
  expect(local.dump()).not.toContain('access')
  expect(local.dump()).not.toContain('refresh')
  expect(secure.value('auth-tokens-v1')).toEqual({ accessToken: 'access', refreshToken: 'refresh' })
})

it('keeps real v0 legacy tokens for this process, erases disk, then loses them on restart', async () => {
  const local = memoryStorage({
    'chatbox-ai-auth-info': JSON.stringify({
      state: { loginEmail: 'user@example.com', accessToken: 'legacy-access', refreshToken: 'legacy-refresh' },
      version: 0,
    }),
  })
  const secure = memorySecurePlatform({
    available: false, backend: 'basic_text', persistence: 'memory-only',
    reasonCode: 'LINUX_KEYRING_INSECURE_BACKEND',
  })
  const migrated = await migrateLegacyAuthInfo({ localStorage: local, secure })
  expect(migrated).toMatchObject({ accessToken: 'legacy-access', refreshToken: 'legacy-refresh' })
  expect(local.getItem('chatbox-ai-auth-info')).toBeNull()
  expect(local.dump()).not.toContain('legacy-access')

  const restarted = await createAuthSecureStorage(memorySecurePlatform({
    available: false, backend: 'basic_text', persistence: 'memory-only',
  }), local).getItem('kod-auth-info-v1')
  expect(restarted ?? '').not.toContain('legacy-access')
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `pnpm exec vitest run src/renderer/stores/authSecureStorage.test.ts`

Expected: FAIL because `authSecureStorage.ts` does not exist.

- [ ] **Step 3: Register secure-secret IPC and platform contracts**

Route the four IPC methods to the Task 2 `SecureStore`. Accept only these fixed keys: `auth-tokens-v1`, `settings-secrets-v1`, and `saved-login-passwords-v1`; reject all other keys with `LINUX_SECURE_STORAGE_KEY_REJECTED`. Keep the generic `invoke` bridge unchanged but expose them only through optional `Platform.desktopSecurity`, so renderer code never constructs channel names. `DesktopPlatform` implements it; `TestPlatform` supplies a fake. WebPlatform/MobilePlatform omit it and retain their pre-existing storage path rather than being forced through desktop IPC, which keeps every `implements Platform` type-correct and avoids desktop changes regressing web/mobile.

- [ ] **Step 4: Replace authInfoStore localStorage token persistence**

Use Zustand `persist` with `skipHydration: true` and the async `authSecureStorage`. The local envelope contains only normalized `loginEmail`; the secure value contains only `accessToken` and `refreshToken`. On first hydration, read the legacy `chatbox-ai-auth-info` localStorage record, move tokens to encrypted storage when available, preserve them only in current process memory otherwise, and remove the legacy token-bearing record in both cases. Export `initAuthInfoStore()` and await it alongside `initSettingsStore()` before `initLoginLicenseStateReconciliation()` in `src/renderer/index.tsx`.

- [ ] **Step 5: Add global and login-context keyring warnings with repair actions**

The login modal must disable password remembering when persistence is not encrypted and display:

```text
Linux 安全密钥环不可用。本次登录仍可使用，但密码、登录令牌和供应商密钥不会在退出后保留。
Ubuntu/Debian：sudo apt install gnome-keyring libsecret-1-0，然后重新登录桌面会话；KDE 请解锁 KWallet。
```

Render `SecureStorageWarning` from the root layout whenever desktop persistence is memory-only, so users entering provider, OAuth, MCP, proxy, license, web-search, or parser secrets receive the warning even if they never open the login modal. It is dismissible for the current UI session but status remains queryable and every settings save still follows memory-only policy. The login modal reuses the same component in context.

Start the component test with `// @vitest-environment jsdom`; the repository's default Vitest environment remains Node for non-UI tests.

For `LINUX_KEYRING_LOCKED`, replace the first sentence with a specific “keyring is locked” message and make “unlock Secret Service/KWallet, then retry” the primary recovery action; do not misreport it as a missing package. The English translation conveys the same behavior. Repair text is copyable, never auto-executed, and never claims that email addresses are secret-encrypted. Tests prove migrated provider/auth secrets remain usable until this process exits and disappear in a new fake process.

- [ ] **Step 6: Run auth, login, request, wallet, and settings regressions**

```powershell
pnpm exec vitest run src/renderer/stores/authSecureStorage.test.ts src/renderer/stores/authInfoStore.test.ts src/renderer/components/system/SecureStorageWarning.test.tsx src/renderer/routes/settings/provider/chatbox-ai/-components/useAuthTokens.test.ts src/renderer/packages/remote.test.ts src/renderer/api/wallet.test.ts src/renderer/stores/settingsStore.persist.test.ts
pnpm check
```

Expected: PASS; a serialized local-storage dump contains email but no access token, refresh token, password, or provider key.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src/shared/linux-system.ts src/renderer/stores/authSecureStorage.ts src/renderer/stores/authSecureStorage.test.ts src/renderer/components/system/SecureStorageWarning.tsx src/renderer/components/system/SecureStorageWarning.test.tsx src/renderer/i18n/linuxErrors.ts src/renderer/i18n/linuxErrors.test.ts src/main/main.ts src/preload/index.ts src/shared/electron-types.ts src/renderer/platform/interfaces.ts src/renderer/platform/desktop_platform.ts src/renderer/platform/test_platform.ts src/renderer/stores/authInfoStore.ts src/renderer/stores/authInfoStore.test.ts src/renderer/index.tsx src/renderer/routes/__root.tsx src/renderer/routes/settings/provider/chatbox-ai/-components/EmailCodeLoginModal.tsx src/renderer/i18n/locales/en/translation.json src/renderer/i18n/locales/zh-Hans/translation.json
git commit -m "feat(linux): secure account token persistence"
```

---

### Task 4: Redact sensitive data and private paths from logs

**Files:**
- Create: `src/main/log-redaction.ts`
- Create: `src/main/log-redaction.test.ts`
- Create: `src/main/legacy-database-migration.test.ts`
- Modify: `src/main/util.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/kai-identity.ts`
- Modify: `src/main/oauth/providers/github-copilot.ts`
- Create: `src/main/oauth/providers/github-copilot.test.ts`
- Modify: `src/main/mcp/ipc-stdio-transport.ts`
- Modify: `src/main/file-parser.ts`
- Modify: `src/main/knowledge-base/file-loaders.ts`
- Modify: `src/main/legacy-database-migration.ts`

**Interfaces:**
- Produces `redactLogArguments(args: readonly unknown[]): unknown[]`, `redactLogText(text: string): string`, and `installLogRedaction(logger)`.
- Redacts by field name and text pattern before console/file transports receive the message.

- [ ] **Step 1: Write the failing redaction test**

```ts
it('redacts credentials, callback parameters, identity values, and private paths', () => {
  const input = [{
    password: 'p@ss', accessToken: 'access', apiKey: 'sk-123', user_code: 'ABCD-EFGH', device_code: 'device-secret',
    url: 'https://user:pass@example.com/callback?code=abc&state=def',
    filePath: '/home/alice/private/contracts/id-card.pdf',
  }]
  const output = JSON.stringify(redactLogArguments(input))
  for (const secret of ['p@ss', 'access', 'sk-123', 'ABCD-EFGH', 'device-secret', 'user:pass', 'abc', 'def', '/home/alice/private/contracts']) {
    expect(output).not.toContain(secret)
  }
  expect(output).toContain('id-card.pdf')
})
```

- [ ] **Step 2: Run the test and verify red**

Run: `pnpm exec vitest run src/main/log-redaction.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement recursive and textual redaction**

Redact keys matching `password|passwd|token|api.?key|secret|authorization|cookie|credential|id.?number|callbackState|user.?code|device.?code|authorization.?code|oauth.?code` case-insensitively. Strip URL userinfo and query values for `code`, `state`, `token`, `key`, `signature`, and `sessionId`. Replace absolute path parents with `<private-path>/` while retaining the basename. Preserve error names, error codes, HTTP status, executable names, and module names so diagnostics remain actionable.

- [ ] **Step 4: Install hooks and remove known raw logging sites**

Remove the direct `electron-log/main` import from `legacy-database-migration.ts`; it obtains a logger only through the redaction module, whose factory installs transports before returning any logger. Replace direct `chatbox_kb_migration_debug.txt` writes with structured redacted logger calls; no side-channel debug file may contain source/target paths. Then install the same hook in `main.ts` before its first startup log and apply it to both the root electron-log instance and every `getLogger()` child. In `kai-identity.ts`, log only token endpoint host and HTTP status, never the response body. Replace GitHub Copilot's raw `user_code` device-flow log with a static event plus expiry/verification host; its provider regression test seeds both `user_code` and `device_code` and asserts neither reaches any transport. In MCP, log command basename and argument count, never `env`/headers/arguments. In parser and knowledge-base logs, pass basenames or opaque IDs instead of full paths or document query text.

- [ ] **Step 5: Verify exported logs**

```powershell
pnpm exec vitest run src/main/log-redaction.test.ts src/main/legacy-database-migration.test.ts src/main/deeplinks.test.ts src/main/oauth src/main/mcp
pnpm check
pnpm lint
```

Expected: PASS; integration spies on both root and child transports, exercises legacy migration diagnostics, confirms no raw debug file is created, and finds `[REDACTED]`/`<private-path>` but none of the seeded secrets.

- [ ] **Step 6: Commit Task 4**

```powershell
git add src/main/log-redaction.ts src/main/log-redaction.test.ts src/main/legacy-database-migration.test.ts src/main/util.ts src/main/main.ts src/main/kai-identity.ts src/main/oauth/providers/github-copilot.ts src/main/oauth/providers/github-copilot.test.ts src/main/mcp/ipc-stdio-transport.ts src/main/file-parser.ts src/main/knowledge-base/file-loaders.ts src/main/legacy-database-migration.ts
git commit -m "fix(security): redact desktop logs"
```

---

### Task 5: Add Linux dependency and user-namespace preflight without weakening the sandbox

**Files:**
- Create: `src/main/linux/system-dependencies.ts`
- Create: `src/main/linux/system-dependencies.test.ts`
- Create: `src/main/sandbox/manager.linux.test.ts`
- Create: `src/main/sandbox/ipc-handlers.test.ts`
- Create: `src/renderer/components/linux/LinuxPreflightAlert.tsx`
- Create: `src/renderer/components/linux/LinuxPreflightAlert.test.tsx`
- Modify: `src/main/sandbox/manager.ts`
- Modify: `src/main/sandbox/ipc-handlers.ts`
- Modify: `src/main/main.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/electron-types.ts`
- Modify: `src/renderer/platform/interfaces.ts`
- Modify: `src/renderer/platform/desktop_platform.ts`
- Modify: `src/renderer/platform/test_platform.ts`
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `src/renderer/routes/task/index.tsx`
- Modify: `src/renderer/i18n/linuxErrors.ts`
- Modify: `src/renderer/i18n/locales/en/translation.json`
- Modify: `src/renderer/i18n/locales/zh-Hans/translation.json`

**Interfaces:**
- Produces `findExecutable(command, env): Promise<string | null>` without invoking a shell.
- Produces `checkLinuxSystemDependencies(deps): Promise<LinuxDependencyReport>`.
- Produces `checkLinuxDisplayEnvironment(env): { display: 'x11' | 'wayland' | 'none'; error?: LinuxSystemError }` without trusting `XDG_SESSION_TYPE` alone.
- `LinuxDependencyReport` lists `bubblewrap`, `socat`, `ripgrep`, user namespace state, error codes, and a copyable repair command.
- Replaces the current unconditional Linux `checkAvailability()` success with a structured report; sandbox methods remain disabled when `available` is false. The desktop-only report is exposed through optional `Platform.linuxSystem`, with an injected TestPlatform fake; web/mobile implementations keep their existing platform behavior.

- [ ] **Step 1: Write failing executable and namespace tests**

```ts
describe('checkLinuxSystemDependencies', () => {
  it('reports every missing tool with one Ubuntu/Debian repair command', async () => {
    const result = await checkLinuxSystemDependencies({
      platform: 'linux', env: { PATH: '/usr/bin' },
      accessExecutable: async (path) => path.endsWith('/bwrap'),
      readText: async () => '28633',
    })
    expect(result).toMatchObject({
      available: false,
      missingCommands: ['socat', 'rg'],
      reasonCode: 'LINUX_DEPENDENCY_MISSING',
      repairCommand: 'sudo apt install bubblewrap socat ripgrep',
    })
  })

  it.each([['0', '28633'], ['1', '0']] as const)(
    'rejects disabled user namespaces', async (clone, max) => {
      const result = await checkLinuxSystemDependencies(fakeDeps({
        '/proc/sys/kernel/unprivileged_userns_clone': clone,
        '/proc/sys/user/max_user_namespaces': max,
      }))
      expect(result.reasonCode).toBe('LINUX_USER_NAMESPACE_DISABLED')
    }
  )

  it('still probes bwrap when sysctls look enabled and reports an outer denial', async () => {
    const result = await checkLinuxSystemDependencies(fakeDeps({
      '/proc/sys/kernel/unprivileged_userns_clone': '1',
      '/proc/sys/user/max_user_namespaces': '28633',
    }, { bwrapProbeError: Object.assign(new Error('denied'), { code: 'EPERM' }) }))
    expect(result).toMatchObject({ available: false, reasonCode: 'LINUX_PERMISSION_DENIED' })
  })
})

it('returns a stable display error when neither display identifier is present', () => {
  expect(checkLinuxDisplayEnvironment({ XDG_SESSION_TYPE: 'wayland' })).toMatchObject({
    display: 'none', error: { code: 'LINUX_DISPLAY_UNSUPPORTED' },
  })
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `pnpm exec vitest run src/main/linux/system-dependencies.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement read-only preflight**

Search the merged `PATH` with `fs.access(path, X_OK)` and `path.delimiter`; never use `shell: true`. Check `bwrap`, `socat`, and `rg`, then read `/proc/sys/kernel/unprivileged_userns_clone` when present and `/proc/sys/user/max_user_namespaces` when present. An explicit disabled/zero sysctl may fail early. Otherwise—whether proc files are absent, unknown, or appear enabled—always confirm effective capability by running `bwrap --ro-bind / / --proc /proc --dev /dev true` with a five-second timeout; this catches Docker seccomp/AppArmor or host policy denial that sysctls alone cannot reveal. Map EACCES/EPERM to `LINUX_PERMISSION_DENIED` and other probe failures to `LINUX_PREFLIGHT_FAILED`, with no raw environment values. Separately classify Wayland only from a nonempty `WAYLAND_DISPLAY`, X11 only from a nonempty `DISPLAY`, and neither as `LINUX_DISPLAY_UNSUPPORTED`; `XDG_SESSION_TYPE` is diagnostic context, not proof that a display socket exists.

- [ ] **Step 4: Integrate the report into sandbox availability**

`src/main/sandbox/manager.ts::checkAvailability()` must call the new preflight on Linux. `initSandbox()` must repeat the check immediately before initialization to avoid a time-of-check/time-of-use bypass. If unavailable, return `{ success: false, errorCode, error }`; never call `SandboxManager.initialize()` and never spawn the requested command directly. In `src/renderer/routes/task/index.tsx`, a missing platform method or thrown availability check must enter `unavailable`, never `select-directory`.

- [ ] **Step 5: Expose preflight and isolate the UI warning**

Before creating the first window, main evaluates the display environment; a missing display records only `LINUX_DISPLAY_UNSUPPORTED`, attempts the translated safe startup dialog, and exits without initializing renderer services. Add `linux:get-system-report` IPC and typed platform access for the recoverable sandbox report. Render `LinuxPreflightAlert` only on Linux and only for unavailable optional modules. The alert lists the missing command names and copyable repair command. Dismissing it affects the banner only; attempting a sandbox task still rechecks and returns the structured failure. Account login, ordinary chat, wallet reads, and settings remain usable.

Start `LinuxPreflightAlert.test.tsx` with `// @vitest-environment jsdom`. Missing optional `Platform.linuxSystem` is treated as “not a Linux desktop capability” outside DesktopPlatform; it is never interpreted as sandbox availability on a Linux desktop.

- [ ] **Step 6: Run focused and task-sandbox regressions**

```powershell
pnpm exec vitest run src/main/linux/system-dependencies.test.ts src/main/sandbox/manager.linux.test.ts src/main/sandbox/ipc-handlers.test.ts src/renderer/components/linux/LinuxPreflightAlert.test.tsx
pnpm check
pnpm lint
```

Expected: PASS; manager and IPC tests prove both `checkAvailability()` and `initSandbox()` recheck, the missing-dependency/exception fixtures never call fake `SandboxManager.initialize()`, and no direct unsandboxed command runner exists.

- [ ] **Step 7: Commit Task 5**

```powershell
git add src/main/linux/system-dependencies.ts src/main/linux/system-dependencies.test.ts src/main/sandbox/manager.linux.test.ts src/main/sandbox/ipc-handlers.test.ts src/renderer/components/linux/LinuxPreflightAlert.tsx src/renderer/components/linux/LinuxPreflightAlert.test.tsx src/main/sandbox/manager.ts src/main/sandbox/ipc-handlers.ts src/main/main.ts src/preload/index.ts src/shared/electron-types.ts src/renderer/platform/interfaces.ts src/renderer/platform/desktop_platform.ts src/renderer/platform/test_platform.ts src/renderer/routes/__root.tsx src/renderer/routes/task/index.tsx src/renderer/i18n/linuxErrors.ts src/renderer/i18n/locales/en/translation.json src/renderer/i18n/locales/zh-Hans/translation.json
git commit -m "feat(linux): enforce sandbox dependency preflight"
```

---

### Task 6: Preflight MCP stdio commands and return actionable typed failures

**Files:**
- Create: `src/main/mcp/command-preflight.ts`
- Create: `src/main/mcp/command-preflight.test.ts`
- Create: `src/main/mcp/login-shell-env.ts`
- Create: `src/main/mcp/login-shell-env.test.ts`
- Create: `src/renderer/packages/mcp/ipc-stdio-transport.test.ts`
- Create: `src/renderer/packages/mcp/controller.test.ts`
- Create: `src/renderer/components/mcp/MCPStatus.test.tsx`
- Modify: `src/main/mcp/ipc-stdio-transport.ts`
- Modify: `src/renderer/packages/mcp/ipc-stdio-transport.ts`
- Modify: `src/renderer/packages/mcp/types.ts`
- Modify: `src/shared/types/mcp.ts`
- Modify: `src/renderer/packages/mcp/controller.ts`
- Modify: `src/renderer/components/mcp/MCPStatus.tsx`
- Modify: `src/renderer/routes/settings/mcp.tsx`
- Modify: `src/renderer/i18n/linuxErrors.ts`
- Modify: `src/renderer/i18n/locales/en/translation.json`
- Modify: `src/renderer/i18n/locales/zh-Hans/translation.json`

**Interfaces:**
- Produces `preflightStdioCommand(params, env, deps?): Promise<McpCommandPreflightResult>` so tests inject executable access without mutating the host.
- Changes create IPC to `McpTransportCreateResult = { ok: true; transportId: string } | { ok: false; error: LinuxSystemError }`.
- HTTP/SSE transports do not call the local executable preflight.

- [ ] **Step 1: Write failing command-resolution tests**

```ts
it('uses the enhanced login-shell PATH and returns the resolved executable', async () => {
  const result = await preflightStdioCommand(
    { command: 'npx', args: ['-y', '@example/mcp'] },
    { PATH: '/home/alice/.local/bin:/usr/bin' },
    fakeAccess(['/home/alice/.local/bin/npx'])
  )
  expect(result).toEqual({ ok: true, executable: '/home/alice/.local/bin/npx' })
})

it('returns a safe structured failure without environment values', async () => {
  const result = await preflightStdioCommand(
    { command: 'missing-mcp', args: ['--token', 'secret'] },
    { PATH: '/usr/bin:/bin', API_TOKEN: 'secret' },
    fakeAccess([])
  )
  expect(result).toMatchObject({
    ok: false,
    error: { code: 'MCP_COMMAND_NOT_FOUND', details: { command: 'missing-mcp' } },
  })
  expect(JSON.stringify(result)).not.toContain('secret')
})
```

- [ ] **Step 2: Run the test and verify red**

Run: `pnpm exec vitest run src/main/mcp/command-preflight.test.ts`

Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement stdio-only resolution**

Do not use `shell-env.cjs` for diagnostic Linux preflight because it swallows shell failure; preserve its existing Windows/macOS path. Implement injectable Linux `loadLoginShellEnvironment()` that starts the login shell without string-concatenating user commands, captures a NUL-delimited environment, enforces a five-second timer, sends termination and then kill to that exact child/process group, and returns a discriminated success/failure. Its tests use a fake child that never exits and assert the kill path. Merge a successful login environment with user-configured variables. If discovery fails, absolute commands may still be validated directly; bare commands fall back to `process.env.PATH`, returning `MCP_SHELL_ENVIRONMENT_FAILED` instead of a false command-not-found result when resolution still fails. For commands containing `/`, resolve against `cwd` and require an executable regular file. For bare commands, scan only `PATH`. Return the command name in `error.details`, sanitized searched directories (`$HOME` instead of the home path), and one recovery action: install Node/npm for `node` or `npx`, or configure an absolute executable path for custom commands.

- [ ] **Step 4: Change the IPC contract atomically on both sides**

Create the SDK transport only after a successful preflight. Return the discriminated create result and update `IPCStdioTransport.create()` to throw `McpLaunchError` carrying the stable code/recovery data. Replace the existing `logger.info('create', serverParams)` call with command basename, transport type, argument count, cwd presence, and environment key names only. JSON-RPC logs retain only method, ID, and byte count. Keep stderr collection capped to its redacted 32 KiB tail before displaying and do not write raw stderr to disk.

- [ ] **Step 5: Render the error at server and settings level**

`MCPStatus` and the MCP settings route show the command name, `PATH` search scope, and repair action. A failed stdio server is marked failed without stopping healthy stdio servers, HTTP/SSE servers, chat, or the settings route. Start `MCPStatus.test.tsx` with `// @vitest-environment jsdom`.

- [ ] **Step 6: Run MCP regression tests**

```powershell
pnpm exec vitest run src/main/mcp/command-preflight.test.ts src/main/mcp/login-shell-env.test.ts src/renderer/packages/mcp/ipc-stdio-transport.test.ts src/renderer/packages/mcp/controller.test.ts src/renderer/components/mcp/MCPStatus.test.tsx
pnpm check
pnpm lint
```

Expected: PASS; HTTP/SSE controller tests prove no executable lookup occurs, transport tests prove one stdio failure leaves other servers running, and the never-exiting fake login shell is killed within the test clock deadline.

- [ ] **Step 7: Commit Task 6**

```powershell
git add src/main/mcp/command-preflight.ts src/main/mcp/command-preflight.test.ts src/main/mcp/login-shell-env.ts src/main/mcp/login-shell-env.test.ts src/main/mcp/ipc-stdio-transport.ts src/renderer/packages/mcp/ipc-stdio-transport.ts src/renderer/packages/mcp/ipc-stdio-transport.test.ts src/renderer/packages/mcp/types.ts src/shared/types/mcp.ts src/renderer/packages/mcp/controller.ts src/renderer/packages/mcp/controller.test.ts src/renderer/components/mcp/MCPStatus.tsx src/renderer/components/mcp/MCPStatus.test.tsx src/renderer/routes/settings/mcp.tsx src/renderer/i18n/linuxErrors.ts src/renderer/i18n/locales/en/translation.json src/renderer/i18n/locales/zh-Hans/translation.json
git commit -m "feat(linux): diagnose MCP stdio commands"
```

---

### Task 7: Integrate AppImage with XDG desktop, deep links, and autostart

**Files:**
- Create: `src/main/linux/desktop-integration.ts`
- Create: `src/main/linux/desktop-integration.test.ts`
- Create: `src/main/linux/auto-launch.ts`
- Create: `src/main/linux/auto-launch.test.ts`
- Modify: `src/main/autoLauncher.ts`
- Modify: `src/main/main.ts`
- Modify: `src/main/deeplinks.test.ts`

**Interfaces:**
- Produces `buildDesktopEntry(input): string` and `ensureUserDesktopIntegration(input): Promise<DesktopIntegrationResult>`.
- Produces `refreshAppImageDesktopIntegrationSync(oldPath, newPath, { autostartEnabled }): void` for the updater's synchronous filename event.
- Produces `ensureLinuxAutoLaunch(enable, input): Promise<void>` using `$XDG_CONFIG_HOME/autostart/kod.desktop`.
- Consumes `process.env.APPIMAGE`, `XDG_DATA_HOME`, `XDG_CONFIG_HOME`, and the packaged `assets/icon.png`; writes only inside the current user's XDG roots.

- [ ] **Step 1: Write failing desktop-entry tests**

```ts
it('creates a quoted AppImage desktop entry with the kod protocol', () => {
  expect(buildDesktopEntry({
    executablePath: '/home/alice/KOD Apps/KOD.AppImage',
    iconPath: '/home/alice/.local/share/icons/hicolor/512x512/apps/kod.png',
  })).toContain(
    'Exec="/home/alice/KOD Apps/KOD.AppImage" %U\nMimeType=x-scheme-handler/kod;\n'
  )
})

it('refuses an XDG target outside the current user home', async () => {
  await expect(ensureUserDesktopIntegration(fakeInput({ dataHome: '/usr/share' })))
    .rejects.toMatchObject({ code: 'LINUX_XDG_PATH_REJECTED' })
})

it('atomically replaces old versioned AppImage references before the event handler returns', () => {
  const xdg = fakeXdg()
  refreshAppImageDesktopIntegrationSync('/home/alice/KOD-0.1.0-x64.AppImage', '/home/alice/KOD-0.1.1-x64.AppImage', xdg)
  expect(xdg.desktopEntry()).toContain('/home/alice/KOD-0.1.1-x64.AppImage')
  expect(xdg.desktopEntry()).not.toContain('KOD-0.1.0-x64.AppImage')
})
```

- [ ] **Step 2: Run tests and verify red**

Run: `pnpm exec vitest run src/main/linux/desktop-integration.test.ts src/main/linux/auto-launch.test.ts`

Expected: FAIL because both modules do not exist.

- [ ] **Step 3: Implement safe per-user XDG integration**

Default `XDG_DATA_HOME` to `$HOME/.local/share` and `XDG_CONFIG_HOME` to `$HOME/.config`. Resolve and verify both remain under the resolved home directory. Atomically write `applications/kod.desktop`, copy the icon to `icons/hicolor/512x512/apps/kod.png`, use mode `0644`, and spawn `xdg-mime default kod.desktop x-scheme-handler/kod` plus `update-desktop-database <applications-dir>` without a shell. Missing refresh commands produce warnings but leave the files installed.

- [ ] **Step 4: Implement XDG autostart and retain other platforms**

On Linux, `autoLauncher.ts` delegates to `ensureLinuxAutoLaunch`; on Windows/macOS it continues using `auto-launch`. The autostart entry uses the quoted `APPIMAGE` path for AppImage launches and `process.execPath` for installed `.deb`, adds `X-GNOME-Autostart-enabled=true`, and writes no privileged directory. Disabling deletes only the exact verified user file.

- [ ] **Step 5: Wire startup, runtime protocol registration, and update-safe path refresh**

After `app.whenReady()`, call AppImage integration only when `process.platform === 'linux'` and `APPIMAGE` is an absolute executable path. This startup call is also the self-healing path after an update: it atomically corrects any desktop/autostart entry that does not reference the currently running AppImage. Treat a false result from `app.setAsDefaultProtocolClient()` as a structured warning with the manual recovery action, and continue startup. Implement `refreshAppImageDesktopIntegrationSync` now: validate both paths, use synchronous temp-write/fsync/rename operations for the desktop entry and enabled autostart entry, and return only after both critical files reference the new versioned AppImage. Noncritical MIME database refresh may run afterward, and neither path deletes either AppImage. Task 8 wires the synchronous critical function to the updater's filename event. Task 9, which creates `electron-builder-linux.yml`, adds this declaration (Task 7 must not modify a file that does not yet exist):

```yaml
protocols:
  - name: KOD
    schemes:
      - kod
```

Keep the existing warm/cold `findKodDeepLink` handling; add tests for Linux command lines containing spaces and percent-encoded MCP/provider/compute links.

- [ ] **Step 6: Verify no system paths are written**

```powershell
pnpm exec vitest run src/main/linux/desktop-integration.test.ts src/main/linux/auto-launch.test.ts src/main/deeplinks.test.ts
pnpm check
```

Expected: PASS; the fake filesystem records writes only below `.local/share` and `.config/autostart`.

- [ ] **Step 7: Commit Task 7**

```powershell
git add src/main/linux/desktop-integration.ts src/main/linux/desktop-integration.test.ts src/main/linux/auto-launch.ts src/main/linux/auto-launch.test.ts src/main/autoLauncher.ts src/main/main.ts src/main/deeplinks.test.ts
git commit -m "feat(linux): add XDG desktop integration"
```

---

### Task 8: Make updater behavior package-aware and point it at KOD

**Files:**
- Create: `src/main/update-policy.ts`
- Create: `src/main/update-policy.test.ts`
- Create: `src/main/app-updater.test.ts`
- Modify: `src/main/app-updater.ts`
- Modify: `src/main/linux/desktop-integration.ts`
- Modify: `src/preload/index.ts`
- Modify: `src/shared/electron-types.ts`
- Modify: `src/shared/linux-system.ts`
- Modify: `src/renderer/platform/interfaces.ts`
- Modify: `src/renderer/platform/desktop_platform.ts`
- Modify: `src/renderer/stores/updateStore.ts`
- Modify: `src/renderer/stores/updateStore.test.ts`
- Create: `src/renderer/routes/about.test.tsx`
- Create: `src/renderer/Sidebar.test.tsx`
- Modify: `src/renderer/routes/about.tsx`
- Modify: `src/renderer/Sidebar.tsx`
- Modify: `src/renderer/i18n/locales/en/translation.json`
- Modify: `src/renderer/i18n/locales/zh-Hans/translation.json`

**Interfaces:**
- Produces `detectLinuxPackageMode(input): 'appimage' | 'deb' | 'other'`.
- Produces `createUpdatePolicy(input): { feedUrl; channel; autoDownload; autoInstallOnAppQuit; disableDifferentialDownload; installMode; downloadUrl }`.
- Changes available event payload to `UpdaterAvailablePayload = { version; installMode: 'automatic' | 'external'; downloadUrl?: string }`.

- [ ] **Step 1: Write failing policy tests**

```ts
it.each([
  [{ platform: 'linux', appImagePath: '/home/a/KOD.AppImage', appImageWritable: true, appImageDirectoryWritable: true }, 'automatic', true, true],
  [{ platform: 'linux', appImagePath: '/opt/KOD.AppImage', appImageWritable: true, appImageDirectoryWritable: false }, 'external', false, false],
  [{ platform: 'linux', appImagePath: '/home/a/KOD.AppImage', appImageWritable: false, appImageDirectoryWritable: true }, 'external', false, false],
  [{ platform: 'linux', packageType: 'deb', appPath: '/opt/Kod/resources/app.asar' }, 'external', false, false],
  [{ platform: 'linux', packageType: 'unknown', appPath: '/opt/Kod/resources/app.asar' }, 'external', false, false],
] as const)('selects the safe Linux install mode', (input, installMode, autoDownload, autoInstallOnAppQuit) => {
  expect(createUpdatePolicy({ ...input, betaRequested: true })).toMatchObject({
    feedUrl: 'https://kod.kai.com/api/auto_upgrade/',
    channel: 'latest',
    installMode,
    autoDownload,
    autoInstallOnAppQuit,
    disableDifferentialDownload: true,
  })
})

it('retains automatic behavior for existing Windows and macOS packages', () => {
  expect(createUpdatePolicy({ platform: 'darwin', betaRequested: false })).toMatchObject({
    installMode: 'automatic', autoDownload: true,
  })
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run: `pnpm exec vitest run src/main/update-policy.test.ts`

Expected: FAIL because the policy module does not exist.

- [ ] **Step 3: Implement the pure update policy**

Use `APPIMAGE` plus separate realpath/`W_OK` probes for both the AppImage file and its parent directory; updater replacement needs directory unlink/rename permission as well as file access. Read electron-builder's `resources/package-type` marker to identify `.deb`; packaged Linux without a trustworthy AppImage marker is external-install mode. Linux always uses stable `latest` because only `latest-linux.yml` and `latest-linux-arm64.yml` are published. Windows/macOS preserve their current automatic install policy but use the KOD base URL. `downloadUrl` is always `https://kod.kai.com/download`; no policy output contains a Chatbox host.

- [ ] **Step 4: Refactor AppUpdater around the policy**

Inject the updater, shell, filesystem probes, and desktop-integration callback into AppUpdater tests. Before every check, call `autoUpdater.setFeedURL(policy.feedUrl)` to select electron-updater's GenericProvider, then set `autoUpdater.channel = policy.channel`, reset `autoUpdater.allowDowngrade = false` after the channel setter, and set `autoUpdater.autoDownload`/`autoUpdater.autoInstallOnAppQuit`. A main-process spy test requires that exact call/order and proves Linux requests the architecture-specific file under the KOD generic base instead of resolving the builder's GitHub tag convention. On update available, emit the typed payload. For external mode, set both flags false, do not call `downloadUpdate()`, and make `install-update` call `shell.openExternal(downloadUrl)`. For automatic mode, retain progress/downloaded state and `quitAndInstall()`.

Listen for AppImageUpdater's `appimage-filename-updated` event and call Task 7's synchronous atomic refresh with old/new absolute paths plus current autostart state. EventEmitter does not await promises, so this handler contains no detached async work: critical rewrites finish before `emit()` returns and before electron-updater starts the new image. A refresh failure emits a recovery warning; the new image's startup self-healing call retries against its current `APPIMAGE`. Tests use a real EventEmitter, assert both desktop/autostart entries already reference the new semver filename immediately after `emit()` returns, and then exercise startup repair from an old path. Disable differential download for Linux 0.1.0 because the seven-asset contract does not publish external blockmap files. Map manifest parse, network, architecture, and permission failures to `LINUX_UPDATE_MANIFEST_INVALID`, `NETWORK_FAILURE`, `LINUX_ARCH_MISMATCH`, or `LINUX_PERMISSION_DENIED` without leaking URLs with query values.

- [ ] **Step 5: Update renderer state and both update surfaces**

Add `installMode` and `downloadUrl` to the update store. Begin both TSX tests with `// @vitest-environment jsdom`. About and Sidebar use these exact labels:

| State | Primary action |
|---|---|
| AppImage downloaded | `Restart and install` |
| `.deb` update available | `Open Linux download page` |
| AppImage path not writable | `Download a new AppImage` |

Clicking external actions opens only the typed URL supplied by main. Wire the currently inert About `Check for updates` button to `platform.checkForUpdate()`, make Sidebar display both `available/external` and `downloaded/automatic`, and update the About source link from `lfrenvip/kod` to `https://github.com/wangtengwatt/KOD`. Existing progress and dismissal behavior stays intact.

- [ ] **Step 6: Run updater and UI regressions**

```powershell
pnpm exec vitest run src/main/update-policy.test.ts src/main/app-updater.test.ts src/main/linux/desktop-integration.test.ts src/renderer/stores/updateStore.test.ts src/renderer/routes/about.test.tsx src/renderer/Sidebar.test.tsx
pnpm check
pnpm lint
```

Expected: PASS; main-process spies prove `.deb` mode calls neither `downloadUpdate()` nor `quitAndInstall()` and opens only the official page, while writable AppImage mode alone can download/quit-install and rewrites XDG paths on filename change.

- [ ] **Step 7: Commit Task 8**

```powershell
git add src/main/update-policy.ts src/main/update-policy.test.ts src/main/app-updater.ts src/main/app-updater.test.ts src/main/linux/desktop-integration.ts src/preload/index.ts src/shared/electron-types.ts src/shared/linux-system.ts src/renderer/platform/interfaces.ts src/renderer/platform/desktop_platform.ts src/renderer/stores/updateStore.ts src/renderer/stores/updateStore.test.ts src/renderer/routes/about.tsx src/renderer/Sidebar.tsx src/renderer/i18n/locales/en/translation.json src/renderer/i18n/locales/zh-Hans/translation.json
git add src/renderer/routes/about.test.tsx src/renderer/Sidebar.test.tsx
git commit -m "feat(linux): add package-aware updates"
```

---

### Task 9: Unify package metadata and create deterministic Linux packages

**Files:**
- Create: `scripts/linux/release-contract.test.ts`
- Create: `scripts/linux/normalize-update-manifest.ts`
- Create: `scripts/linux/normalize-update-manifest.test.ts`
- Create: `scripts/linux/generate-release-metadata.ts`
- Create: `scripts/linux/generate-release-metadata.test.ts`
- Create: `scripts/linux/verify-release.ts`
- Create: `scripts/linux/verify-release.test.ts`
- Create: `scripts/linux/verify-public-release.ts`
- Create: `scripts/linux/verify-public-release.test.ts`
- Create: `scripts/linux/release-current-arch.ts`
- Create: `electron-builder-linux.yml`
- Create: `release-notes/linux-v0.1.0.md`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `release/app/package.json`
- Modify: `release/app/package-lock.json`
- Modify: `.erb/scripts/ensure-app-deps.cjs`
- Modify: `.erb/scripts/patch-libsql.cjs`

**Interfaces:**
- Produces `pnpm package:linux -- --x64|--arm64`, `pnpm linux:release:normalize -- <one-artifact-directory> --arch=x64|arm64`, `pnpm linux:release:metadata -- <one-artifact-directory> --portal-output=<outside-path>`, native partial `pnpm linux:release:verify -- <dir> --arch=<arch> --evidence-output=<outside-file>`, portable full `pnpm linux:release:verify -- <dir> --native-evidence-dir=<separate-dir>`, `pnpm linux:release:verify-public -- <one-artifact-directory> <public URLs>`, and native-host-only `pnpm release:linux`.
- Produces updater YAML containing exactly one AppImage for its architecture.
- Produces `SHA256SUMS` inside the seven-file artifact directory and writes `portal-linux-latest.json` to a required separate output path for the portal promotion step.

- [ ] **Step 1: Write failing metadata consistency tests**

```ts
import rootPackage from '../../package.json'
import appPackage from '../../release/app/package.json'
import appLock from '../../release/app/package-lock.json'

it('uses 0.1.0 across both package roots and the npm lock', () => {
  expect(rootPackage.version).toBe('0.1.0')
  expect(appPackage.version).toBe('0.1.0')
  expect(appLock.packages[''].name).toBe('kod')
  expect(appLock.packages[''].version).toBe('0.1.0')
})

it('locks the patched libsql runtime exactly', () => {
  expect(appPackage.dependencies.libsql).toBe('0.5.22')
  expect(appPackage.overrides.libsql).toBe('0.5.22')
  expect(appLock.packages['node_modules/libsql'].version).toBe('0.5.22')
})
```

- [ ] **Step 2: Run the release-contract test and verify red**

Run: `pnpm exec vitest run scripts/linux/release-contract.test.ts`

Expected: FAIL because current versions are `0.0.1` and `1.21.1`, and the runtime npm lock does not pin the approved libsql version.

- [ ] **Step 3: Align root and packaged-app metadata**

Set both package versions to `0.1.0`, repository URL to `https://github.com/wangtengwatt/KOD.git`, author/maintainer email to `watt@vn.com`, and product display name to `KOD` only where it does not rename existing Windows/macOS artifact contracts. In `release/app/package.json`, use exact runtime dependencies:

```json
"dependencies": {
  "@anthropic-ai/sandbox-runtime": "0.0.34",
  "@libsql/client": "0.15.15",
  "libsql": "0.5.22"
},
"overrides": {
  "libsql": "0.5.22"
}
```

Regenerate `release/app/package-lock.json` with Node 22/npm, verify the lock root is `kod@0.1.0`, and keep the root `pnpm-lock.yaml` consistent.

- [ ] **Step 4: Make packaged runtime installation immutable**

Change `.erb/scripts/ensure-app-deps.cjs` to execute exactly:

```js
execSync('npm ci --omit=dev --ignore-scripts --no-audit --no-fund', {
  cwd: appDir,
  stdio: 'inherit',
  env: process.env,
})
```

Keep its narrowly verified removal of type-only packages. Make `.erb/scripts/patch-libsql.cjs` throw when the expected 0.5.22 files cannot be patched or verified; a release must not continue after `skip-unknown` or `no libsql files patched`.

- [ ] **Step 5: Create isolated Linux builder configuration**

`electron-builder-linux.yml` extends `electron-builder.yml`, overrides Linux only, and contains:

```yaml
extends: ./electron-builder.yml

asarUnpack:
  - "**/*.node"
  - "**/node_modules/libsql/**"
  - "**/node_modules/@libsql/**"
  - "**/node_modules/@anthropic-ai/sandbox-runtime/vendor/**"
  - "**/node_modules/@anthropic-ai/sandbox-runtime/dist/vendor/**"

toolsets:
  appimage: "1.0.2"

protocols:
  - name: KOD
    schemes: [kod]

linux:
  target:
    - target: AppImage
      arch: [x64, arm64]
    - target: deb
      arch: [x64, arm64]
  category: Utility
  executableName: kod
  maintainer: KOD <watt@vn.com>
  vendor: KOD
  synopsis: KOD AI desktop client
  description: KOD desktop client for AI chat, tools, knowledge, media, and compute services
  artifactName: KOD-${version}-${arch}.${ext}
  executableArgs: [--ozone-platform-hint=auto]
  publish:
    - provider: github
      owner: wangtengwatt
      repo: KOD
      channel: latest

deb:
  depends:
    - "libgtk-3-0t64 | libgtk-3-0"
    - libnotify4
    - libnss3
    - libxss1
    - libxtst6
    - xdg-utils
    - "libatspi2.0-0t64 | libatspi2.0-0"
    - libuuid1
    - libsecret-1-0
    - libgbm1
    - "libasound2t64 | libasound2"
    - libdrm2
    - bubblewrap
    - socat
    - ripgrep
  recommends:
    - libayatana-appindicator3-1
    - gnome-keyring

extraResources:
  - ./assets/**
  - from: LICENSE
    to: LICENSE
  - from: NOTICE
    to: NOTICE
```

The t64-first alternatives allow Ubuntu 24.04 Noble to select its renamed ABI packages while Ubuntu 22.04 and Debian 12 select the second alternative. The release-contract and partial-verifier tests parse the generated `Depends` field and require these exact alternatives rather than comparing a flattened package list. The original global S3 publish stanza remains untouched for Windows/macOS; the Linux-specific provider overrides it only for this config.

- [ ] **Step 6: Write manifest normalization tests before implementation**

```ts
it('keeps exactly one arm64 AppImage and recalculates SHA-512', async () => {
  const normalized = await normalizeUpdateManifest({
    arch: 'arm64', version: '0.1.0',
    manifest: fixtureManifestWithAppImageAndDeb,
    artifactDirectory: fixtureDirectory,
  })
  expect(normalized.files.map((file) => file.url)).toEqual(['KOD-0.1.0-arm64.AppImage'])
  expect(normalized.path).toBe('KOD-0.1.0-arm64.AppImage')
  expect(normalized.files[0].sha512).toBe(await sha512Base64(fixtureArm64AppImage))
})

it('rejects a second architecture or deb entry after normalization', async () => {
  await expect(normalizeUpdateManifest(invalidMixedFixture)).rejects.toThrow('unique AppImage')
})
```

- [ ] **Step 7: Implement normalization and release metadata generation**

Run `pnpm add --save-dev --save-exact yaml@2.8.2`. The normalizer CLI requires exactly one positional artifact directory plus exactly one `--arch`; it has no default directory. It selects only the requested architecture's exact AppImage/feed pair, may coexist with the other contract architecture during aggregation, leaves that other pair untouched, and rejects unrelated files. For x64 write `latest-linux.yml`; for arm64 write `latest-linux-arm64.yml`. In each file, rewrite `version`, `files`, `path`, `sha512`, and `releaseDate`; preserve no `.deb` entry. Derive `releaseDate` only from required `SOURCE_DATE_EPOCH` (the release commit time), and add a test proving a second normalization is byte-identical. `generate-release-metadata.ts` likewise requires exactly one positional artifact directory and a distinct required `--portal-output`, sorts the four installers by filename, writes `SHA256SUMS` in GNU format inside the artifact directory, and refuses a portal path that resolves inside that directory. It emits this portal schema:

```ts
export interface PortalLinuxReleaseManifest {
  schemaVersion: 1
  version: '0.1.0'
  tag: 'linux-v0.1.0'
  publishedAt: string
  releaseUrl: string
  releaseNotesUrl: string
  sourceUrl: string
  requirements: {
    certified: ['Ubuntu 22.04', 'Ubuntu 24.04', 'Debian 12']
    displays: ['X11', 'Wayland']
  }
  assets: Record<'x64' | 'arm64', Record<'appImage' | 'deb', {
    name: string
    url: string
    size: number
    sha256: string
  }>>
}
```

- [ ] **Step 8: Implement artifact verification**

`verify-release.ts` has two explicit modes. Native partial mode (`--arch=x64|arm64`) accepts exactly that architecture's AppImage, `.deb`, and YAML, executes/extracts only on the matching native host, and emits a hash-bound acceptance fragment. Portable full mode (no `--arch`) accepts exactly the seven public contract files plus a required separate `--native-evidence-dir`; it performs only cross-platform byte/manifest checks and proves that both trusted native fragments match the exact installer hashes. Full mode never executes a foreign-architecture binary and must run on the Windows operator host as well as Linux CI. The applicable checks are:

1. Both modes enforce their exact filenames and version.
2. Native partial mode first asserts `process.arch`/`uname -m`, then `dpkg-deb -f` reports `amd64` for x64 or `arm64` for arm64, version `0.1.0`, and every runtime dependency listed in the Linux builder config.
3. Native partial mode executes a private user-executable copy with `--appimage-extract` and deletes it in `finally`.
4. Native partial mode verifies Electron, every `.node` file, matching `@libsql/linux-<arch>-gnu/index.node`, and Sandbox Runtime `apply-seccomp` have the expected ELF architecture; the opposite libsql architecture is absent.
5. Native partial mode verifies `apply-seccomp` is outside asar and executable, `LICENSE`/`NOTICE` exist in both package resource trees, and packaged `app-update.yml` contains no Chatbox host.
6. Each partial run writes one JSON fragment containing schema, tested commit, native architecture, commands/results, SHA-256/SHA-512 for its AppImage and `.deb`, and the feed-validation result. Installer hashes are immutable evidence keys; the YAML validation result is recorded but its bytes may be deterministically regenerated during aggregation. Failed/skipped fields are forbidden.
7. Both modes require each update YAML to contain only its one AppImage with matching SHA-512.
8. Portable full mode implements GNU `SHA256SUMS` parsing/hash comparison in TypeScript, covers exactly four installers, loads exactly one passing fragment per architecture from `--native-evidence-dir`, and requires both installer hashes plus each fragment's tested commit to match the aggregated files/current source commit.
9. The runtime update-policy test separately proves the KOD feed base is selected for Linux.

Use injected command/file adapters in unit tests, then run native commands only in matching partial jobs. The CLI requires exactly one positional artifact directory, resolves it once, rejects zero or multiple directory arguments, and rejects files outside the selected mode's allowlist so a caller can never silently verify `release/build` instead of a downloaded release. Tests prove portable full mode never spawns `dpkg-deb`, `file`, or an AppImage.

Add `verify-public-release.ts` with injected HTTP/file adapters. It requires one seven-file local directory plus `--manifest-url` and `--feed-base-url`; fetches the production JSON and both YAML responses; requires `Cache-Control` to contain `no-store`; follows only same-base relative updater asset URLs; and compares response filename, length, SHA-256/SHA-512, architecture, and final GitHub Release URL to the local files. Unit tests must fail on a cached feed, cross-origin relative resolution, redirect to a different tag, or byte mismatch.

- [ ] **Step 9: Add package scripts and release notes**

```json
"package:linux": "ts-node ./.erb/scripts/clean.js && pnpm run build && electron-builder --config electron-builder-linux.yml --linux AppImage deb --publish never",
"linux:release:normalize": "tsx scripts/linux/normalize-update-manifest.ts",
"linux:release:metadata": "tsx scripts/linux/generate-release-metadata.ts",
"linux:release:verify": "tsx scripts/linux/verify-release.ts",
"linux:release:verify-public": "tsx scripts/linux/verify-public-release.ts",
"release:linux": "tsx scripts/linux/release-current-arch.ts"
```

`release-current-arch.ts` rejects non-Linux hosts and any architecture except `x64`/`arm64`, then packages `process.arch`, copies only its AppImage, `.deb`, and raw architecture YAML from `release/build` into a newly created empty `release/staging/<arch>` directory, normalizes that explicit directory, and runs partial verification there with evidence written outside the three-file directory. It never requests the other architecture and never creates public metadata; the native CI aggregation job is the sole seven-asset producer.

Release notes state certified systems, AppImage executable permission, `.deb` install command, dependency preflight, SHA-256 verification, AppImage versus `.deb` update behavior, known best-effort distributions, GPLv3, and source URL `https://github.com/wangtengwatt/KOD/tree/linux-v0.1.0`. They also state that internal builds reporting `1.21.1` must be removed once before installing 0.1.0 because electron-updater correctly refuses that numerical downgrade.

- [ ] **Step 10: Run metadata and tooling tests**

```powershell
pnpm install --frozen-lockfile
npm ci --prefix release/app --omit=dev --ignore-scripts --no-audit --no-fund
npm ls --prefix release/app libsql @libsql/client @anthropic-ai/sandbox-runtime
pnpm exec vitest run scripts/linux/release-contract.test.ts scripts/linux/normalize-update-manifest.test.ts scripts/linux/generate-release-metadata.test.ts scripts/linux/verify-release.test.ts scripts/linux/verify-public-release.test.ts
pnpm check
```

Expected: PASS; `npm ls` reports `libsql@0.5.22` with no invalid dependency.

- [ ] **Step 11: Commit Task 9**

```powershell
git add package.json pnpm-lock.yaml release/app/package.json release/app/package-lock.json .erb/scripts/ensure-app-deps.cjs .erb/scripts/patch-libsql.cjs electron-builder-linux.yml scripts/linux/release-contract.test.ts scripts/linux/normalize-update-manifest.ts scripts/linux/normalize-update-manifest.test.ts scripts/linux/generate-release-metadata.ts scripts/linux/generate-release-metadata.test.ts scripts/linux/verify-release.ts scripts/linux/verify-release.test.ts scripts/linux/verify-public-release.ts scripts/linux/verify-public-release.test.ts scripts/linux/release-current-arch.ts release-notes/linux-v0.1.0.md
git commit -m "build(linux): make release artifacts deterministic"
```

---

### Task 10: Add native GUI, display-server, distro, and feature acceptance tests

**Files:**
- Create: `test/e2e/linux-smoke.spec.ts`
- Create: `test/e2e/fixtures/update/fixture-server.ts`
- Create: `scripts/linux/run-gui-smoke.sh`
- Create: `scripts/linux/test-deb-container.sh`
- Create: `scripts/linux/verify-native-evidence.ts`
- Create: `scripts/linux/verify-native-evidence.test.ts`
- Create: `src/main/smoke-test-policy.ts`
- Create: `src/main/smoke-test-policy.test.ts`
- Create: `docs/linux/acceptance/0.1.0.json`
- Modify: `package.json`
- Modify: `pnpm-lock.yaml`
- Modify: `src/main/main.ts`
- Modify: `docs/linux/feature-matrix.json`

**Interfaces:**
- Produces `pnpm test:linux:gui -- --display=x11|wayland --appimage=<absolute-path>` against the final AppImage, not `linux-*-unpacked`.
- Produces `scripts/linux/run-gui-smoke.sh <x11|wayland> <appimage-path> <evidence-file>` and `scripts/linux/test-deb-container.sh <ubuntu:22.04|ubuntu:24.04|debian:12-slim> <deb-path> <evidence-file>`; the latter runs both X11 and Wayland inside each container.
- Produces `pnpm linux:native-evidence:verify -- <evidence-file> --artifact-dir=<native-stage>` to bind package, GUI, distro, and display results to installer hashes.
- Uses `--kod-smoke-test` to enable read-only diagnostics; this mode cannot call real payment, wallet mutation, order, identity, or GPU delivery endpoints.

- [ ] **Step 1: Add Playwright and write the failing packaged-app smoke test**

Run `pnpm add --save-dev --save-exact @playwright/test@1.55.0` with `PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`, then create:

```ts
test('packaged Linux AppImage exposes routes, IPC, window controls, and safe modules', async () => {
  const app = await electron.launch({ executablePath: requiredEnv('KOD_LINUX_APPIMAGE'), args: ['--kod-smoke-test'] })
  const page = await app.firstWindow()
  await expect(page.locator('#root')).toBeVisible()
  expect(await page.evaluate(() => window.electronAPI.invoke('getPlatform'))).toBe('linux')
  for (const [route, landmark] of routeLandmarks) {
    await page.evaluate((path) => window.electronAPI.invoke('smoke:navigate', path), route)
    await expect(page.getByRole(landmark.role, { name: landmark.name })).toBeVisible()
  }
  await page.evaluate(() => window.electronAPI.invoke('window:maximize'))
  expect(await page.evaluate(() => window.electronAPI.invoke('window:is-maximized'))).toBe(true)
  const sandbox = await page.evaluate(() => window.electronAPI.invoke('sandbox:check-availability'))
  if (process.env.KOD_SMOKE_PROFILE === 'native-appimage') {
    expect(sandbox).toMatchObject({ available: true })
  } else {
    expect(sandbox).toMatchObject({ available: false })
  }
  await app.close()
})
```

The suite accepts only `KOD_SMOKE_PROFILE=native-appimage|container-deb`. The native AppImage profile requires a working bwrap sandbox and runs its full read/write/execute lifecycle. The container `.deb` profile exists because Docker's outer seccomp commonly denies nested user namespaces: it must prove the product reports the sandbox unavailable and fails closed, but it never relaxes product security, adds capabilities, passes `--no-sandbox`, or skips the remaining route/window/update assertions.

- [ ] **Step 2: Run against a missing binary and verify red**

Run: `KOD_LINUX_APPIMAGE=/missing/KOD.AppImage pnpm exec playwright test test/e2e/linux-smoke.spec.ts`

Expected: FAIL because no packaged Linux executable exists.

- [ ] **Step 3: Implement smoke-only diagnostics and safety guard**

Register `smoke:navigate`, an injectable tray factory, and local fixture updater overrides only when `--kod-smoke-test` is present. Implement `installSmokeMutationGuard()` over both Chromium `session.webRequest` and main-process `globalThis.fetch`/mutation IPC adapters: deny every non-GET/HEAD external request with `SMOKE_MUTATION_BLOCKED`, allow only the exact loopback fixture origin, and restore the original fetch on shutdown. Unit tests directly call a guarded main-process POST and prove it never reaches the fake network, while a production instance without the flag has identical function identity and exposes no smoke IPC. Do not treat a root pathname attribute as route success; the E2E waits for a route-specific visible landmark and fails on any `pageerror` or unexpected error-level console event.

- [ ] **Step 4: Cover warm/cold deep links, MCP, sandbox, tray degradation, and updater**

Add two independent deep-link cases: cold-launch the AppImage with an allowlisted `kod://mcp/install` argument and assert the destination after first window creation; then launch a second instance with a different allowlisted link and assert warm focus/navigation in the original process. Start one nonexistent MCP stdio command and assert `MCP_COMMAND_NOT_FOUND`. In `native-appimage` only, initialize a temporary sandbox, write/read/grep a fixture, execute `pwd`, kill/reset, and assert paths remain inside the temporary workspace; in `container-deb`, assert unavailable plus a structured fail-closed `initSandbox()` result and prove no bare command runs. Launch once with the smoke-only tray-factory failure switch and confirm the main window still closes/restores/exits visibly. Every launch subscribes to `pageerror` and error console events before navigation and requires each route's real page landmark.

For updater coverage, `fixture-server.ts` binds an ephemeral loopback port, creates deterministic nonempty pseudo-AppImage bytes for the current native architecture, calculates their real SHA-512, and serves a generated 0.1.1 `latest-linux.yml` or `latest-linux-arm64.yml` plus the referenced file. The smoke-only feed override accepts only that exact loopback origin. Native AppImage mode must request the architecture-correct feed and asset, reach `update-downloaded`, and expose the downloaded temporary file path through smoke-only diagnostics so the test rechecks byte length/SHA-512. After asserting the production policy had `autoInstallOnAppQuit=true`, a smoke-only discard IPC sets it false and deletes only that fixture cache file before test shutdown, so the pseudo image can never replace or launch over the tested package; production exposes neither override nor discard channel. Container `.deb` mode checks the same manifest, emits external availability, and proves the asset endpoint was never requested because `autoDownload=false`. The server asserts every request and shuts down in `finally`. This is a real GenericProvider download/hash path, not a policy-only YAML fixture.

- [ ] **Step 5: Implement X11 and Wayland launch wrappers**

`run-gui-smoke.sh` requires exactly the display mode, absolute AppImage path, and acceptance-fragment path shown in the interface and always sets `KOD_SMOKE_PROFILE=native-appimage`. It uses `set -euo pipefail`, `mktemp -d`, and a cleanup trap. It points `HOME`, `XDG_DATA_HOME`, and `XDG_CONFIG_HOME` at isolated temporary directories and gives `XDG_RUNTIME_DIR` mode `0700`. X11 runs the final AppImage with `xvfb-run -a`. Wayland runs it inside `dbus-run-session`, starts Weston with `--backend=headless-backend.so --socket=wayland-kod --idle-time=0`, waits at most 20 seconds for the socket, then launches with `WAYLAND_DISPLAY=wayland-kod` and `--ozone-platform=wayland`. It kills only PIDs started by the script. After each AppImage launch, assert the isolated XDG desktop entry/protocol files exist, reference that exact AppImage, and the updater reports `automatic`; only after all assertions pass does it atomically append the record to the named fragment.

- [ ] **Step 6: Implement distro install/start checks**

For each approved container image, require exactly the image, native `.deb`, and acceptance-fragment arguments. Run `apt-get update`, install `xvfb`, `xauth`, `weston`, `dbus-x11`, and other test harness libraries, copy the native `.deb`, and install with `apt-get install -y ./KOD-0.1.0-<arch>.deb`. Create a non-root `kodtest` user, verify `dpkg-query` version/architecture/dependencies, and run `kod --version`. Under that user, set `KOD_SMOKE_PROFILE=container-deb`, create mode-`0700` `XDG_RUNTIME_DIR`, then run the installed package smoke once with Xvfb/X11 and once under `dbus-run-session` plus headless Weston/Wayland, each with a 30-second timeout. Assert `.deb` updater mode is external and sandbox requests fail closed under the outer container; nested sandbox lifecycle certification remains the native-host AppImage profile's responsibility. Do not grant the container `SYS_ADMIN`, disable its seccomp profile, pass `--no-sandbox`, or introduce a production bypass. Atomically append the two passing display records only after the container checks succeed.

- [ ] **Step 7: Record acceptance and close the strict matrix**

`docs/linux/acceptance/0.1.0.json` records exact tested commit, architecture, distro, display server, package format, smoke profile, sandbox coverage, command, UTC timestamp, result, and installer hashes for each run. Both wrapper scripts append atomically to the partial verifier's evidence file; `verify-native-evidence.ts` rejects missing/duplicate/skipped records, changed hashes, a non-native architecture, any native AppImage record without full sandbox lifecycle success, any container `.deb` record without an explicit fail-closed sandbox result, or any absent AppImage/X11/Wayland and `.deb` distro/display combination. Record read-only/manual flows for credential-gated chat/model/media/knowledge/compute/wallet pages without executing financial mutations. Leave native-only entries as `planned` until the Task 11 dry run supplies x64/arm64 evidence. A feature may change to `verified` only when its automated test passed or its `manualCheckId` resolves to acceptance evidence under the Task 1 ancestry/no-covered-diff rules; package/display entries need all six distro/architecture combinations with X11 and Wayland.

Add package script `"linux:native-evidence:verify": "tsx scripts/linux/verify-native-evidence.ts"` with no default paths.

- [ ] **Step 8: Run the complete local test set available on the current host**

```powershell
pnpm test
pnpm test:integration
pnpm exec vitest run src/main/smoke-test-policy.test.ts scripts/linux/verify-native-evidence.test.ts
pnpm check
pnpm check:ci
pnpm check:error-i18n-keys
pnpm linux:matrix:check
```

Expected: PASS. Linux-only package/display commands run in the CI jobs in Task 11 when the current workstation cannot execute them.

- [ ] **Step 9: Commit Task 10**

```powershell
git add package.json pnpm-lock.yaml test/e2e/linux-smoke.spec.ts test/e2e/fixtures/update/fixture-server.ts scripts/linux/run-gui-smoke.sh scripts/linux/test-deb-container.sh scripts/linux/verify-native-evidence.ts scripts/linux/verify-native-evidence.test.ts src/main/smoke-test-policy.ts src/main/smoke-test-policy.test.ts docs/linux/acceptance/0.1.0.json docs/linux/feature-matrix.json src/main/main.ts
git commit -m "test(linux): gate full desktop parity"
```

---

### Task 11: Build, dry-run, and close both native architecture gates

**Files:**
- Create: `.github/workflows/linux-release.yml`
- Create: `.github/actions/setup-kod/action.yml`
- Modify: `docs/linux/acceptance/0.1.0.json`
- Modify: `docs/linux/feature-matrix.json`

**Interfaces:**
- Trigger: annotated tag matching `linux-v*` and manual `workflow_dispatch` with a typed Boolean `publish` input defaulting to `false`.
- Build artifacts: package-only `linux-x64`/`linux-arm64` artifacts plus separate `linux-x64-acceptance`/`linux-arm64-acceptance` evidence artifacts.
- Public release: exactly seven approved assets, initially draft, made non-draft only after API re-verification.

- [ ] **Step 1: Create a native-runner probe job**

Create a local composite setup action using `pnpm/action-setup@v4` with `version: 10.33.0` and `run_install: false`, followed by `actions/setup-node@v4` with `node-version: 22.12.0` and `cache: pnpm`, then `pnpm install --frozen-lockfile`. Every job that uses repository scripts—including probe, validation, both builds, and aggregation—must first run `actions/checkout@v4` with `fetch-depth: 0` and then this action; jobs never assume another VM's checkout or `node_modules`. Artifact transfer uses `actions/upload-artifact@v4` and `actions/download-artifact@v4`. The workflow starts with a `probe` matrix:

```yaml
strategy:
  fail-fast: false
  matrix:
    include:
      - { arch: x64, runner: ubuntu-22.04, uname: x86_64, debArch: amd64, feed: latest-linux.yml }
      - { arch: arm64, runner: ubuntu-22.04-arm, uname: aarch64, debArch: arm64, feed: latest-linux-arm64.yml }
runs-on: ${{ matrix.runner }}
steps:
  - run: test "$(uname -m)" = "${{ matrix.uname }}"
  - run: node -e "if (process.arch !== '${{ matrix.arch }}') process.exit(1)"
```

A missing/unavailable ARM runner blocks the release instead of silently switching to emulation.

- [ ] **Step 2: Add the validation job using the shared setup**

After its own checkout/shared setup, run:

```bash
pnpm exec vitest run scripts/linux/release-contract.test.ts
pnpm check
pnpm check:ci
pnpm check:error-i18n-keys
pnpm test
pnpm test:integration
if [[ "$GITHUB_REF_TYPE" == "tag" ]]; then
  pnpm linux:matrix:release
  node -e "const p=require('./release/app/package.json'); if (process.env.GITHUB_REF_NAME !== 'linux-v'+p.version) process.exit(1)"
else
  pnpm linux:matrix:check
fi
```

- [ ] **Step 3: Add native x64/arm64 build jobs**

Set the matrix build job's `needs: [probe, validation]` and use the default success condition, so no package starts after either gate fails. Install build/smoke dependencies, including `bubblewrap socat ripgrep xvfb weston dbus-x11 libsecret-1-dev file jq`, then run on each native runner:

```bash
export SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)"
pnpm package:linux -- --${{ matrix.arch }}
stage="release/staging/${{ matrix.arch }}"
test ! -e "$stage"
mkdir -p "$stage" "release/native-evidence/${{ matrix.arch }}"
cp -p "release/build/KOD-0.1.0-${{ matrix.arch }}.AppImage" "$stage/"
cp -p "release/build/KOD-0.1.0-${{ matrix.arch }}.deb" "$stage/"
cp -p "release/build/${{ matrix.feed }}" "$stage/"
pnpm linux:release:normalize -- "$stage" --arch=${{ matrix.arch }}
pnpm linux:release:verify -- "$stage" --arch=${{ matrix.arch }} --evidence-output="release/native-evidence/${{ matrix.arch }}/acceptance.json"
evidence="release/native-evidence/${{ matrix.arch }}/acceptance.json"
bash scripts/linux/run-gui-smoke.sh x11 "$(pwd)/$stage/KOD-0.1.0-${{ matrix.arch }}.AppImage" "$evidence"
bash scripts/linux/run-gui-smoke.sh wayland "$(pwd)/$stage/KOD-0.1.0-${{ matrix.arch }}.AppImage" "$evidence"
bash scripts/linux/test-deb-container.sh ubuntu:22.04 "$(pwd)/$stage/KOD-0.1.0-${{ matrix.arch }}.deb" "$evidence"
bash scripts/linux/test-deb-container.sh ubuntu:24.04 "$(pwd)/$stage/KOD-0.1.0-${{ matrix.arch }}.deb" "$evidence"
bash scripts/linux/test-deb-container.sh debian:12-slim "$(pwd)/$stage/KOD-0.1.0-${{ matrix.arch }}.deb" "$evidence"
pnpm linux:native-evidence:verify -- "$evidence" --artifact-dir="$stage"
```

Each container invocation passes both X11 and Wayland on that same native runner, producing twelve distro/architecture/display launches overall. Both GUI and distro scripts append to the same fragment, and the final verifier rejects any missing, duplicate, skipped, wrong-commit, or hash-mismatched record before upload. Upload the architecture's AppImage, `.deb`, and YAML only as `linux-${{ matrix.arch }}`; upload `release/native-evidence/${{ matrix.arch }}/acceptance.json` separately as `linux-${{ matrix.arch }}-acceptance`. Every fixed-name upload sets `overwrite: true` and `if-no-files-found: error`, so `gh run rerun` replaces a prior attempt's artifact under the same run ID instead of conflicting or leaving ambiguous evidence. No acceptance file may enter a package artifact.

- [ ] **Step 4: Add the single release aggregation job**

The aggregation job runs for both manual and tag builds with `needs: [probe, validation, build]` and the default success condition; this is the only publishing job, so a failed gate or matrix leg prevents both artifact aggregation and release mutation. Download the two package artifacts from this same workflow run into separate temporary directories, copy only the six contract-allowlisted package/feed files into a newly created empty `release-assets` directory, set the user execute bit on both AppImages, normalize both YAML files again, write `SHA256SUMS` there and the portal manifest to separate `workflow-output/portal/portal-linux-latest.json`, then run full mode against the resulting exact seven files. Give this job `permissions: contents: write` and set `GH_TOKEN: ${{ github.token }}` on every `gh` step. Use these exact staging commands:

```bash
export SOURCE_DATE_EPOCH="$(git show -s --format=%ct HEAD)"
test ! -e release-assets
mkdir -p release-assets workflow-output/portal workflow-input/native-evidence/x64 workflow-input/native-evidence/arm64
cp workflow-input/x64/KOD-0.1.0-x64.AppImage workflow-input/x64/KOD-0.1.0-x64.deb workflow-input/x64/latest-linux.yml release-assets/
cp workflow-input/arm64/KOD-0.1.0-arm64.AppImage workflow-input/arm64/KOD-0.1.0-arm64.deb workflow-input/arm64/latest-linux-arm64.yml release-assets/
chmod u+x release-assets/KOD-0.1.0-x64.AppImage release-assets/KOD-0.1.0-arm64.AppImage
pnpm linux:release:normalize -- release-assets --arch=x64
pnpm linux:release:normalize -- release-assets --arch=arm64
pnpm linux:release:metadata -- release-assets --portal-output=workflow-output/portal/portal-linux-latest.json
pnpm linux:release:verify -- release-assets --native-evidence-dir=workflow-input/native-evidence
```

The preceding `actions/download-artifact` steps map `linux-x64` to `workflow-input/x64`, `linux-arm64` to `workflow-input/arm64`, and the two acceptance artifacts to their matching `workflow-input/native-evidence/<arch>` directories. Package and evidence paths never overlap. Guard only the publishing steps with this condition:

```yaml
if: >-
  (github.event_name == 'push' && github.ref_type == 'tag' && startsWith(github.ref_name, 'linux-v')) ||
  (github.event_name == 'workflow_dispatch' && inputs.publish == true && github.ref_type == 'tag' && startsWith(github.ref_name, 'linux-v'))
```

Thus a branch dry run with `publish=false` still proves aggregation and uploads private workflow evidence while creating no Release; manually dispatching a tag with `publish=false` also cannot publish. On a publishing run, create the release as draft:

```bash
gh release create "$GITHUB_REF_NAME" \
  --repo wangtengwatt/KOD \
  --verify-tag \
  --draft \
  --latest=false \
  --title "KOD Linux 0.1.0" \
  --notes-file release-notes/linux-v0.1.0.md \
  release-assets/KOD-0.1.0-x64.AppImage \
  release-assets/KOD-0.1.0-x64.deb \
  release-assets/KOD-0.1.0-arm64.AppImage \
  release-assets/KOD-0.1.0-arm64.deb \
  release-assets/SHA256SUMS \
  release-assets/latest-linux.yml \
  release-assets/latest-linux-arm64.yml
```

Make this block resumable. If no release exists, create the draft. If an exact-tag draft already exists from a failed attempt, run `gh release upload --clobber` for the seven allowlisted assets; reject rather than delete any unexpected asset. If an already-published release exists, accept it only when its target, notes/source link, and exact seven assets match, then continue verification without editing it. Query the GitHub API, sort asset names, and require exact equality with the contract plus nonzero sizes. Download each uploaded asset into a second clean directory, set user execute permission only on its two temporary AppImage copies, and rerun the verifier. Keep every newly created or resumed release in draft state through this step; publication occurs only after private evidence is durably uploaded and re-downloaded in Step 5. No retry deletes a release or force-moves a tag.

- [ ] **Step 5: Persist private evidence, then publish as the final side effect**

Upload only `workflow-output/portal/portal-linux-latest.json` under artifact name `portal-linux-manifest`, and upload the two validated fragments under `native-verification-evidence`. These uploads and their verification run unconditionally for branch/tag dry runs; only GitHub Release mutations use the publish condition. Both fixed-name uploads use `overwrite: true` and `if-no-files-found: error`. Download both artifacts back into fresh directories within the same aggregation job, compare their bytes/hashes to the local originals, and rerun native-evidence validation against the downloaded fragments. These remain private workflow artifacts; the public Release directory stays at exactly seven assets while portal promotion and later portable verification receive byte-for-byte generated metadata/evidence.

Only after those round trips pass may a matching draft execute `gh release edit "$GITHUB_REF_NAME" --draft=false --latest=false`. Make that edit the aggregation job's final command and final external side effect: no upload, validation, or action step follows it. If the release was already published and matched in Step 4, require the two current-run private artifacts to pass the same round trip, but do not edit the release. Thus any pre-publication failure leaves a resumable draft, while every public release has recoverable private evidence in its successful workflow run.

- [ ] **Step 6: Commit and push the workflow before its dry run**

On the operator workstation, PowerShell 7.4+ and GitHub CLI are release prerequisites. If `Get-Command pwsh` is absent, install the official package with `winget install --id Microsoft.PowerShell --exact`, open a new `pwsh` session, and run every remaining PowerShell block there. If `Get-Command gh` is absent in that session, install the official package with `winget install --id GitHub.cli --exact`, start a new `pwsh`, authenticate with `gh auth login --hostname github.com --git-protocol https --web`, and then require:

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw 'PowerShell 7.4 or newer is required' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) { throw 'GitHub CLI is not installed' }
gh --version
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI failed' }
gh auth status --hostname github.com
if ($LASTEXITCODE -ne 0) { throw 'GitHub CLI is not authenticated' }
gh repo view wangtengwatt/KOD --json nameWithOwner,viewerPermission
if ($LASTEXITCODE -ne 0) { throw 'GitHub repository access check failed' }
```

Never print `gh auth token`. The authenticated account must have permission to push the branch/tag and create Releases.

```powershell
git add .github/workflows/linux-release.yml .github/actions/setup-kod/action.yml
git commit -m "ci(linux): build and verify native releases"
git push github suanlizhongxin_KOD
```

- [ ] **Step 7: Validate the workflow without publishing**

```powershell
$knownRunIds = @(gh run list --repo wangtengwatt/KOD --workflow linux-release.yml --event workflow_dispatch --limit 50 --json databaseId --jq '.[].databaseId')
gh workflow run linux-release.yml --repo wangtengwatt/KOD --ref suanlizhongxin_KOD -f publish=false
$deadline = (Get-Date).AddMinutes(3)
do {
  $candidateIds = @(gh run list --repo wangtengwatt/KOD --workflow linux-release.yml --branch suanlizhongxin_KOD --event workflow_dispatch --limit 50 --json databaseId --jq '.[].databaseId')
  $dryRunId = $candidateIds | Where-Object { $_ -notin $knownRunIds } | Select-Object -First 1
  if (-not $dryRunId) { Start-Sleep -Seconds 5 }
} until ($dryRunId -or (Get-Date) -ge $deadline)
if (-not $dryRunId) { throw 'Timed out waiting for the dispatched Linux workflow' }
gh run watch $dryRunId --repo wangtengwatt/KOD --exit-status
```

Expected: both native builds, six distro/architecture installs with twelve X11/Wayland launches, both final-AppImage smoke suites, and aggregate verification pass; the guarded publish steps are skipped and no GitHub Release is created.

- [ ] **Step 8: Import native evidence and verify the complete matrix**

Download `linux-x64-acceptance` and `linux-arm64-acceptance` from `$dryRunId`, merge them deterministically into `docs/linux/acceptance/0.1.0.json`, and verify their tested commit equals the current commit containing the workflow. Change the remaining native-only matrix entries to `verified`, point them at the merged evidence IDs, then run:

```powershell
pnpm linux:matrix:release
pnpm exec vitest run scripts/linux/verify-feature-matrix.test.ts
```

Expected: PASS with no planned, duplicate, missing-file, or evidence-free entry.

- [ ] **Step 9: Commit the dry-run evidence**

```powershell
git add docs/linux/acceptance/0.1.0.json docs/linux/feature-matrix.json
git commit -m "test(linux): record native release evidence"
```

---

### Task 12: Push the verified source and publish `linux-v0.1.0`

**Files:**
- Verify: all Task 1–11 files
- Generate locally: `release/verified/linux-v0.1.0/`
- Generate locally: `release/verified/linux-v0.1.0-native-evidence/`
- Generate locally: `release/verified/linux-v0.1.0-workflow/`

**Interfaces:**
- Publishes tag `linux-v0.1.0` to both configured source remotes.
- Publishes a non-draft, non-latest GitHub Release at `wangtengwatt/KOD` only through the Task 11 workflow.
- Produces a locally re-downloaded seven-file verification directory and the workflow-only portal manifest.

- [ ] **Step 1: Prove the source tree and release gate are clean**

```powershell
if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw 'PowerShell 7.4 or newer is required' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$dirty = git status --porcelain=v1 --untracked-files=all
if ($dirty) { $dirty; throw 'Release worktree is not clean' }
git diff --check
pnpm install --frozen-lockfile
pnpm check
pnpm check:ci
pnpm check:error-i18n-keys
pnpm test
pnpm test:integration
pnpm linux:matrix:release
pnpm exec vitest run scripts/linux/release-contract.test.ts
```

Expected: no uncommitted files and every command PASS.

- [ ] **Step 2: Classify existing tag state and allow only a safe resume**

```powershell
$tag = 'linux-v0.1.0'
$releaseCommit = (git rev-parse HEAD).Trim()
function Get-RemoteAnnotatedTag([string]$remote) {
  $rawLine = git ls-remote --tags $remote "refs/tags/$tag"
  $peeledLine = git ls-remote --tags $remote "refs/tags/$tag^{}"
  if ($rawLine -and -not $peeledLine) { throw "$remote has a non-annotated release tag" }
  if (-not $rawLine) { return $null }
  [pscustomobject]@{
    raw = $rawLine.Split("`t")[0]
    commit = $peeledLine.Split("`t")[0]
  }
}
$originTag = Get-RemoteAnnotatedTag origin
$githubTag = Get-RemoteAnnotatedTag github
foreach ($entry in @($originTag, $githubTag) | Where-Object { $_ }) {
  if ($entry.commit -ne $releaseCommit) { throw 'Existing release tag points to a different commit' }
}
if ($originTag -and $githubTag -and $originTag.raw -ne $githubTag.raw) { throw 'Remote annotated tag objects differ' }
if (git tag --list $tag) {
  if ((git cat-file -t $tag).Trim() -ne 'tag') { throw 'Local release tag is not annotated' }
  if ((git rev-parse "$tag^{}").Trim() -ne $releaseCommit) { throw 'Local release tag points to a different commit' }
  $localTagObject = (git rev-parse $tag).Trim()
  if (($originTag -and $originTag.raw -ne $localTagObject) -or ($githubTag -and $githubTag.raw -ne $localTagObject)) {
    throw 'Local and remote annotated tag objects differ'
  }
}
```

Expected: tags are either absent everywhere or every existing annotated tag resolves to this exact commit and has the same tag object. A same-commit partial push is resumable; a lightweight, divergent, or moved tag blocks. Never delete or force-move an existing release tag.

- [ ] **Step 3: Mirror the exact canonical branch commit**

```powershell
git push origin suanlizhongxin_KOD
git push github suanlizhongxin_KOD
$originCommit = (git ls-remote origin refs/heads/suanlizhongxin_KOD).Split("`t")[0]
$githubCommit = (git ls-remote github refs/heads/suanlizhongxin_KOD).Split("`t")[0]
if ($releaseCommit -ne $originCommit -or $releaseCommit -ne $githubCommit) { throw 'remote commit mismatch' }
```

- [ ] **Step 4: Create and push the annotated release tag**

```powershell
if (-not (git tag --list $tag)) {
  $tagSource = if ($originTag) { 'origin' } elseif ($githubTag) { 'github' } else { $null }
  if ($tagSource) {
    git fetch $tagSource "refs/tags/${tag}:refs/tags/${tag}"
  } else {
    git tag -a $tag -m "KOD Linux 0.1.0"
  }
}
git push origin "refs/tags/$tag"
git push github "refs/tags/$tag"
$localTagObject = (git rev-parse $tag).Trim()
$originTag = Get-RemoteAnnotatedTag origin
$githubTag = Get-RemoteAnnotatedTag github
if ($originTag.raw -ne $localTagObject -or $githubTag.raw -ne $localTagObject) { throw 'Remote tag object mismatch' }
if ($originTag.commit -ne $releaseCommit -or $githubTag.commit -ne $releaseCommit) { throw 'Remote peeled commit mismatch' }
```

Expected: both remotes report the same peeled commit for the annotated tag.

- [ ] **Step 5: Watch the release workflow to completion**

```powershell
$deadline = (Get-Date).AddMinutes(3)
do {
  $runs = gh run list --repo wangtengwatt/KOD --workflow linux-release.yml --commit $releaseCommit --limit 50 --json databaseId,headSha,event,createdAt | ConvertFrom-Json
  $runId = $runs |
    Where-Object { $_.headSha -eq $releaseCommit -and $_.event -in @('push','workflow_dispatch') } |
    Sort-Object { [datetime]$_.createdAt } -Descending |
    Select-Object -ExpandProperty databaseId -First 1
  if (-not $runId) { Start-Sleep -Seconds 5 }
} until ($runId -or (Get-Date) -ge $deadline)
if (-not $runId) { throw 'No release workflow found for the tagged commit; inspect Actions before manually dispatching this tag with publish=true, then rerun this step' }
$runState = gh run view $runId --repo wangtengwatt/KOD --json status,conclusion | ConvertFrom-Json
if ($runState.status -eq 'completed' -and $runState.conclusion -ne 'success') {
  gh run rerun $runId --repo wangtengwatt/KOD
}
gh run watch $runId --repo wangtengwatt/KOD --exit-status
```

Expected: validation, both native builds, all distro/display checks, aggregate verification, and publish complete successfully.

- [ ] **Step 6: Re-download and independently verify the public Release**

Require that none of the three verification destinations exists, create only the seven-asset directory, then run:

```powershell
if (Test-Path -LiteralPath release/verified/linux-v0.1.0) { throw 'Release verification directory already exists' }
if (Test-Path -LiteralPath release/verified/linux-v0.1.0-native-evidence) { throw 'Native evidence directory already exists' }
if (Test-Path -LiteralPath release/verified/linux-v0.1.0-workflow) { throw 'Workflow evidence directory already exists' }
New-Item -ItemType Directory -Path release/verified/linux-v0.1.0 | Out-Null
$release = gh release view linux-v0.1.0 --repo wangtengwatt/KOD --json isDraft,isPrerelease,tagName,name,targetCommitish,url,assets | ConvertFrom-Json
if ($release.isDraft -or $release.isPrerelease -or $release.tagName -ne 'linux-v0.1.0') { throw 'Release state mismatch' }
$expectedAssets = @('KOD-0.1.0-x64.AppImage','KOD-0.1.0-x64.deb','KOD-0.1.0-arm64.AppImage','KOD-0.1.0-arm64.deb','SHA256SUMS','latest-linux.yml','latest-linux-arm64.yml') | Sort-Object
$actualAssets = @($release.assets | ForEach-Object { if ($_.size -le 0) { throw "Empty asset: $($_.name)" }; $_.name } | Sort-Object)
if (Compare-Object $expectedAssets $actualAssets) { throw 'Release asset set mismatch' }
$releaseListJson = gh release list --repo wangtengwatt/KOD --limit 100 --json isLatest,tagName
if ($LASTEXITCODE -ne 0) { throw 'Unable to query repository Latest release state' }
$latestTag = ($releaseListJson | ConvertFrom-Json | Where-Object { $_.isLatest } | Select-Object -ExpandProperty tagName -First 1)
if ($latestTag -eq 'linux-v0.1.0') { throw 'Linux release unexpectedly replaced the repository Latest release' }
gh release download linux-v0.1.0 --repo wangtengwatt/KOD --dir release/verified/linux-v0.1.0
gh run download $runId --repo wangtengwatt/KOD --name native-verification-evidence --dir release/verified/linux-v0.1.0-native-evidence
pnpm linux:release:verify -- release/verified/linux-v0.1.0 --native-evidence-dir=release/verified/linux-v0.1.0-native-evidence
gh run download $runId --repo wangtengwatt/KOD --name portal-linux-manifest --dir release/verified/linux-v0.1.0-workflow
if (-not (Test-Path -LiteralPath release/verified/linux-v0.1.0-workflow/portal-linux-latest.json -PathType Leaf)) { throw 'Portal workflow manifest is missing' }
```

Expected: `isDraft=false`, `isLatest=false`, exactly seven public assets, all checksum/architecture/content checks PASS, and `release/verified/linux-v0.1.0-workflow/portal-linux-latest.json` exists only as a workflow artifact outside the exact-seven directory.

---

### Task 13: Build the official Linux download experience from the generated manifest

**Repository:** `D:\watt\kod-ai-portal`

**Files:**
- Create: `frontend/src/releases/linuxRelease.ts`
- Create: `frontend/src/releases/linuxRelease.test.ts`
- Create: `frontend/src/hooks/useLinuxRelease.ts`
- Create: `frontend/src/components/download/LinuxDownloadCard.tsx`
- Create: `frontend/src/components/download/LinuxDownloadCard.test.tsx`
- Create: `frontend/src/routes/download.test.tsx`
- Create: `frontend/src/test/setup.ts`
- Create: `frontend/vitest.config.ts`
- Create: `frontend/public/download/linux/latest.json`
- Modify: `frontend/src/routes/download.tsx`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

**Interfaces:**
- Produces `parseLinuxReleaseManifest(value): LinuxReleaseManifest` and `getLinuxAsset(release, arch, format)`.
- Produces `useLinuxRelease()` backed by `/download/linux/latest.json`.
- Main button always selects x64 AppImage; alternates expose x64 `.deb`, arm64 AppImage, and arm64 `.deb`.

- [ ] **Step 1: Add the frontend test stack and write failing parser tests**

Run `npm install --save-dev --save-exact vitest@4.0.18 jsdom@27.4.0 @testing-library/react@16.3.0 @testing-library/jest-dom@6.9.1 @testing-library/user-event@14.6.1`, add exact package script `"test": "vitest"`, then create:

```ts
it('accepts the generated 0.1.0 four-asset manifest', () => {
  const release = parseLinuxReleaseManifest(validManifest)
  expect(getLinuxAsset(release, 'x64', 'appImage').name).toBe('KOD-0.1.0-x64.AppImage')
  expect(Object.values(release.assets).flatMap(Object.values)).toHaveLength(4)
})

it.each([
  ['wrong tag', { ...validManifest, tag: 'v0.1.0' }],
  ['non-GitHub URL', manifestWithUrl('https://example.com/KOD.AppImage')],
  ['bad checksum', manifestWithSha256('1234')],
  ['missing arm64 deb', manifestWithout('arm64', 'deb')],
])('rejects %s', (_name, value) => {
  expect(() => parseLinuxReleaseManifest(value)).toThrow()
})
```

- [ ] **Step 2: Run parser tests and verify red**

```powershell
Set-Location D:\watt\kod-ai-portal\frontend
npm test -- --run src/releases/linuxRelease.test.ts
```

Expected: FAIL because the parser does not exist; the newly added test command itself resolves and runs Vitest.

- [ ] **Step 3: Implement strict manifest parsing**

Use these types:

```ts
export type LinuxArch = 'x64' | 'arm64'
export type LinuxFormat = 'appImage' | 'deb'

export interface LinuxReleaseAsset {
  name: string
  url: string
  sha256: string
  size: number
}

export interface LinuxReleaseManifest {
  schemaVersion: 1
  version: string
  tag: string
  publishedAt: string
  releaseUrl: string
  releaseNotesUrl: string
  sourceUrl: string
  requirements: { certified: string[]; displays: string[] }
  assets: Record<LinuxArch, Record<LinuxFormat, LinuxReleaseAsset>>
}
```

Require semver `0.1.0`, tag `linux-v0.1.0`, exact filenames, 64 lowercase hex SHA-256, positive integer size, and URLs under `https://github.com/wangtengwatt/KOD/releases/download/linux-v0.1.0/`. Reject extra/missing assets.

- [ ] **Step 4: Copy the generated portal manifest without retyping values**

```powershell
New-Item -ItemType Directory -Force -Path D:\watt\kod-ai-portal\frontend\public\download\linux | Out-Null
Copy-Item -LiteralPath D:\watt\kod\release\verified\linux-v0.1.0-workflow\portal-linux-latest.json -Destination D:\watt\kod-ai-portal\frontend\public\download\linux\latest.json
```

Run the parser test against this actual file as well as fixtures.

- [ ] **Step 5: Write failing Linux card interaction tests**

```tsx
it('makes x64 AppImage primary and exposes all alternatives by keyboard', async () => {
  render(<LinuxDownloadCard release={validManifest} />)
  expect(screen.getByRole('link', { name: /download linux x64 appimage/i })).toHaveAttribute(
    'href', validManifest.assets.x64.appImage.url
  )
  await userEvent.tab()
  await userEvent.keyboard('{Enter}')
  for (const name of [/x64 .deb/i, /arm64 appimage/i, /arm64 .deb/i]) {
    expect(screen.getByRole('link', { name })).toBeVisible()
  }
})

it('renders no stale download URL when the manifest fails', () => {
  render(<LinuxDownloadCard error={new Error('invalid manifest')} />)
  expect(screen.queryByRole('link', { name: /download linux/i })).toBeNull()
  expect(screen.getByText(/download information is temporarily unavailable/i)).toBeVisible()
})
```

- [ ] **Step 6: Implement the hook, card, and route replacement**

Load the manifest with React Query, validate before exposing it, and set finite retry behavior. Replace only the existing Linux coming-soon card in `download.tsx`. Show version, certified distributions, X11/Wayland, primary x64 AppImage, the three alternatives, SHA-256 for the selected asset, and a checksum-help disclosure. The primary native anchor points directly at the manifest's x64 AppImage GitHub asset so one click starts the download; show copyable post-download commands `chmod +x KOD-0.1.0-x64.AppImage && ./KOD-0.1.0-x64.AppImage` and `sudo apt install ./KOD-0.1.0-x64.deb` for Linux's required execution/install step. Use native anchors, visible focus styles, 44-pixel minimum targets, and responsive wrapping; loading/error states contain no guessed URL.

In `download.test.tsx`, scope assertions to the landmark/region named Linux: it must contain four exact links and no coming-soon text. Do not assert that Windows, macOS, or iOS cards lack their legitimate existing status text.

- [ ] **Step 7: Run frontend tests and build**

```powershell
npm ci
npm test -- --run
npm run typecheck
npm run lint
npm run build
if (-not (Test-Path dist/download/linux/latest.json)) { throw 'manifest missing from build' }
```

Expected: PASS and the generated manifest is byte-identical in `public` and `dist`.

- [ ] **Step 8: Commit Task 13 in the portal repository**

```powershell
Set-Location D:\watt\kod-ai-portal
git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/src/test/setup.ts frontend/src/releases/linuxRelease.ts frontend/src/releases/linuxRelease.test.ts frontend/src/hooks/useLinuxRelease.ts frontend/src/components/download/LinuxDownloadCard.tsx frontend/src/components/download/LinuxDownloadCard.test.tsx frontend/src/routes/download.tsx frontend/src/routes/download.test.tsx frontend/public/download/linux/latest.json
git commit -m "feat(download): publish KOD Linux packages"
```

---

### Task 14: Serve updater feeds safely and gate the frontend container

**Repository:** `D:\watt\kod-ai-portal`

**Files:**
- Create: `frontend/scripts/verify-linux-release.mjs`
- Create: `frontend/public/api/auto_upgrade/latest-linux.yml`
- Create: `frontend/public/api/auto_upgrade/latest-linux-arm64.yml`
- Create: `.github/workflows/frontend.yml`
- Create: `document/KOD-Linux-0.1.0-发布与回滚.md`
- Modify: `frontend/nginx.conf`
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `docker-compose.yml`

**Interfaces:**
- Serves exact static feeds at `/api/auto_upgrade/latest-linux.yml` and `/api/auto_upgrade/latest-linux-arm64.yml` with no long-term cache.
- Redirects only allowlisted `KOD-<semver>-(x64|arm64).AppImage` paths to the matching GitHub tag/asset.
- Adds frontend health endpoint `/healthz` and Compose health status without changing backend lifecycle.

- [ ] **Step 1: Copy the exact verified updater manifests**

```powershell
Set-Location D:\watt\kod-ai-portal
New-Item -ItemType Directory -Force -Path frontend\public\api\auto_upgrade | Out-Null
Copy-Item -LiteralPath D:\watt\kod\release\verified\linux-v0.1.0\latest-linux.yml -Destination frontend\public\api\auto_upgrade\latest-linux.yml
Copy-Item -LiteralPath D:\watt\kod\release\verified\linux-v0.1.0\latest-linux-arm64.yml -Destination frontend\public\api\auto_upgrade\latest-linux-arm64.yml
```

Do not edit their checksums, dates, paths, or filenames by hand.

- [ ] **Step 2: Write the failing portal release verifier**

The script must parse the JSON and YAML files and assert: version/tag agreement; four direct GitHub download URLs; two YAML files with one matching AppImage each; YAML SHA-512 matching the public Release after download; JSON SHA-256/size matching the same files; no Chatbox host; and release/source URLs matching `wangtengwatt/KOD`. Add `npm run verify:linux-release` and prove it fails when a fixture checksum is changed.

- [ ] **Step 3: Add exact Nginx locations before generic `/api/`**

```nginx
location = /api/auto_upgrade/latest-linux.yml {
    default_type application/yaml;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files $uri =404;
}

location = /api/auto_upgrade/latest-linux-arm64.yml {
    default_type application/yaml;
    add_header Cache-Control "no-store, max-age=0" always;
    add_header X-Content-Type-Options "nosniff" always;
    try_files $uri =404;
}

location ~ ^/api/auto_upgrade/(KOD-([0-9]+\.[0-9]+\.[0-9]+)-(x64|arm64)\.AppImage)$ {
    return 302 https://github.com/wangtengwatt/KOD/releases/download/linux-v$2/$1;
}

location = /healthz {
    access_log off;
    default_type text/plain;
    return 200 "ok\n";
}
```

The generic `/api/` proxy remains after these blocks and is otherwise unchanged. The regex has no user-provided host/query target and therefore cannot become an open redirect.

- [ ] **Step 4: Add a frontend-only healthcheck**

```yaml
healthcheck:
  test: ["CMD-SHELL", "wget -q -O - http://127.0.0.1/healthz | grep -qx ok"]
  interval: 10s
  timeout: 3s
  retries: 6
  start_period: 10s
```

Add it only to service `frontend`; do not change backend ports, volumes, environment, or dependencies.

- [ ] **Step 5: Add the frontend CI workflow**

On pushes and pull requests affecting `frontend/**`, `docker-compose.yml`, or the workflow, run Node 24/npm CI, unit/component tests, typecheck, lint, build, and `verify:linux-release`. Then run:

```bash
docker compose --env-file .env.example config --quiet
docker build -t kod-frontend:linux-release-test frontend
docker run --rm --add-host backend:127.0.0.1 kod-frontend:linux-release-test nginx -t
```

Start the image on port 18080, verify `/healthz`, JSON, both YAML feeds, the x64 redirect target, and that `/api/health` still attempts the backend route. Always stop/remove only the named test container in a cleanup step.

- [ ] **Step 6: Run all portal gates locally or on an approved Docker host**

```powershell
Set-Location D:\watt\kod-ai-portal\frontend
npm ci
npm test -- --run
npm run typecheck
npm run lint
npm run build
npm run verify:linux-release
Set-Location ..
docker compose --env-file .env.example config --quiet
docker build -t kod-frontend:linux-release-test frontend
docker run --rm --add-host backend:127.0.0.1 kod-frontend:linux-release-test nginx -t
```

Expected: PASS. If local Docker is unavailable, the committed workflow must pass before Task 15.

- [ ] **Step 7: Write the operator runbook and commit Task 14**

The runbook contains the exact Task 15 discovery, backup, deployment, health, public download, and rollback commands. Its supplied commands append populated JSON evidence records at execution time; no empty evidence records or hand-entered hashes are committed.

```powershell
git add frontend/scripts/verify-linux-release.mjs frontend/public/api/auto_upgrade/latest-linux.yml frontend/public/api/auto_upgrade/latest-linux-arm64.yml frontend/nginx.conf frontend/package.json frontend/package-lock.json docker-compose.yml .github/workflows/frontend.yml document/KOD-Linux-0.1.0-发布与回滚.md
git commit -m "feat(release): serve KOD Linux update feeds"
```

---

### Task 15: Push the portal commit and deploy only the frontend with rollback ready

**Repository:** `D:\watt\kod-ai-portal`

**Server:** `ubuntu@18.166.72.200:22`

**Files:**
- Update after execution: `document/KOD-Linux-0.1.0-发布与回滚.md`

**Interfaces:**
- Promotes one exact `release/3.0` commit present on both `origin` (GitLab) and `github` remotes.
- Discovers the server compose directory from the running `kod-frontend` container label.
- Retains the previous image under a timestamped rollback tag and recreates only service `frontend`.

- [ ] **Step 1: Verify and mirror the portal commit**

```powershell
Set-Location D:\watt\kod-ai-portal
if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw 'PowerShell 7.4 or newer is required' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$portalDirty = git status --porcelain=v1 --untracked-files=all
if ($portalDirty) { $portalDirty; throw 'Portal worktree is not clean' }
npm --prefix frontend ci
npm --prefix frontend test -- --run
npm --prefix frontend run typecheck
npm --prefix frontend run lint
npm --prefix frontend run build
npm --prefix frontend run verify:linux-release
$targetCommit = (git rev-parse HEAD).Trim()
git push origin release/3.0
git push github release/3.0
$originCommit = (git ls-remote origin refs/heads/release/3.0).Split("`t")[0]
$githubCommit = (git ls-remote github refs/heads/release/3.0).Split("`t")[0]
if ($targetCommit -ne $originCommit -or $targetCommit -ne $githubCommit) { throw 'portal remote commit mismatch' }
$deadline = (Get-Date).AddMinutes(3)
do {
  $runs = gh run list --repo wangtengwatt/kod-ai-portal --workflow frontend.yml --commit $targetCommit --limit 20 --json databaseId,headSha,createdAt | ConvertFrom-Json
  $frontendRunId = $runs |
    Where-Object { $_.headSha -eq $targetCommit } |
    Sort-Object { [datetime]$_.createdAt } -Descending |
    Select-Object -ExpandProperty databaseId -First 1
  if (-not $frontendRunId) { Start-Sleep -Seconds 5 }
} until ($frontendRunId -or (Get-Date) -ge $deadline)
if (-not $frontendRunId) { throw 'No frontend CI run found for the promoted commit' }
gh run watch $frontendRunId --repo wangtengwatt/kod-ai-portal --exit-status
```

Expected: both remotes point at `$targetCommit` and that exact commit's frontend workflow passes, including Docker/Nginx checks. This remote gate is mandatory even when local Docker passed.

- [ ] **Step 2: Log in and perform read-only discovery first**

```powershell
if ($targetCommit -notmatch '^[0-9a-f]{40}$') { throw 'Invalid target commit' }
ssh -t -o BatchMode=yes -p 22 ubuntu@18.166.72.200 "KOD_EXPECTED_PORTAL_COMMIT='$targetCommit' bash -l"
```

On the server:

```bash
set -euo pipefail
docker inspect kod-frontend --format '{{.Name}} {{.Image}} {{.State.Status}}'
DEPLOY_DIR="$(docker inspect kod-frontend --format '{{ index .Config.Labels "com.docker.compose.project.working_dir" }}')"
test -n "$DEPLOY_DIR"
test -d "$DEPLOY_DIR/.git"
git -C "$DEPLOY_DIR" diff --quiet
git -C "$DEPLOY_DIR" diff --cached --quiet
test -z "$(git -C "$DEPLOY_DIR" status --porcelain --untracked-files=all)"
docker compose --project-directory "$DEPLOY_DIR" ps frontend
```

Do not run `env`, `printenv`, `docker inspect` without a restrictive format, or read `.env`.

- [ ] **Step 3: Record the rollback point and preserve the current image**

```bash
PREVIOUS_COMMIT="$(git -C "$DEPLOY_DIR" rev-parse HEAD)"
PREVIOUS_IMAGE_ID="$(docker inspect kod-frontend --format '{{.Image}}')"
ROLLBACK_TAG="kod-frontend:rollback-$(date -u +%Y%m%dT%H%M%SZ)"
docker image tag "$PREVIOUS_IMAGE_ID" "$ROLLBACK_TAG"
curl -fsS --max-time 15 http://127.0.0.1/download >/dev/null
curl -fsS --max-time 15 http://127.0.0.1/api/health |
  python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "UP"'
printf 'previous_commit=%s\nprevious_image=%s\nrollback_tag=%s\n' \
  "$PREVIOUS_COMMIT" "$PREVIOUS_IMAGE_ID" "$ROLLBACK_TAG"

rollback_frontend() {
  git -C "$DEPLOY_DIR" switch --detach "$PREVIOUS_COMMIT"
  docker image tag "$ROLLBACK_TAG" kod-frontend:latest
  docker compose --project-directory "$DEPLOY_DIR" up -d --no-deps --force-recreate frontend
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    if test "$(docker inspect kod-frontend --format '{{.State.Running}}')" = true &&
       curl -fsS --max-time 15 http://127.0.0.1/download >/dev/null &&
       curl -fsS --max-time 15 http://127.0.0.1/api/health |
         python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "UP"'; then
      return 0
    fi
    sleep 2
  done
  return 1
}
```

Copy those three non-secret values into the runbook evidence before continuing.

- [ ] **Step 4: Fetch and verify the exact promoted commit**

```bash
git -C "$DEPLOY_DIR" fetch origin release/3.0
TARGET_COMMIT="$(git -C "$DEPLOY_DIR" rev-parse FETCH_HEAD)"
test "$TARGET_COMMIT" = "$(git -C "$DEPLOY_DIR" rev-parse origin/release/3.0)"
test "$TARGET_COMMIT" = "${KOD_EXPECTED_PORTAL_COMMIT:?expected portal commit was not passed from the operator workstation}"
git -C "$DEPLOY_DIR" switch --detach "$TARGET_COMMIT"
```

The hard equality test binds the server checkout to the SHA that passed the workstation and frontend-CI gates; it must finish before any image build.

- [ ] **Step 5: Build and recreate frontend only**

```bash
cd "$DEPLOY_DIR"
docker compose build frontend || { rollback_frontend; exit 1; }
docker compose up -d --no-deps --force-recreate frontend || { rollback_frontend; exit 1; }
```

Do not issue `docker compose down`, and do not restart `backend`, MySQL, Redis, or any unrelated service.

- [ ] **Step 6: Verify container and local origin health**

```bash
verify_new_frontend() {
  local deadline=$((SECONDS + 120))
  while (( SECONDS < deadline )); do
    local health
    health="$(docker inspect kod-frontend --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}')"
    test "$health" = unhealthy && return 1
    test "$health" = healthy && break
    sleep 2
  done
  test "$(docker inspect kod-frontend --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}missing{{end}}')" = healthy &&
  curl -fsS --max-time 15 http://127.0.0.1/healthz | grep -qx ok &&
  curl -fsS --max-time 15 http://127.0.0.1/api/health |
    python3 -c 'import json,sys; assert json.load(sys.stdin)["status"] == "UP"' &&
  curl -fsS --max-time 15 http://127.0.0.1/download/linux/latest.json |
    python3 -c 'import json,sys; assert json.load(sys.stdin)["version"] == "0.1.0"' &&
  curl -fsS --max-time 15 http://127.0.0.1/api/auto_upgrade/latest-linux.yml | grep -q 'KOD-0.1.0-x64.AppImage' &&
  curl -fsS --max-time 15 http://127.0.0.1/api/auto_upgrade/latest-linux-arm64.yml | grep -q 'KOD-0.1.0-arm64.AppImage' &&
  curl -sSI --max-time 15 http://127.0.0.1/api/auto_upgrade/KOD-0.1.0-x64.AppImage |
    grep -Fi 'location: https://github.com/wangtengwatt/KOD/releases/download/linux-v0.1.0/KOD-0.1.0-x64.AppImage'
}
verify_new_frontend || { rollback_frontend; exit 1; }
```

- [ ] **Step 7: Roll back immediately if any Step 5–6 check fails**

```bash
rollback_frontend
```

The function verifies the old baseline with container `State.Running`, `/download`, and backend JSON `status == "UP"`; it intentionally does not require the new healthcheck or `/healthz`, because the previous frontend image may not contain either. Keep this command in the same SSH session; the runbook also records the three values needed to reconstruct it after reconnecting.

Keep the rollback image tag through the observation period. Do not delete the failed GitHub Release; make the portal stop pointing to it and retain it for diagnosis.

- [ ] **Step 8: Verify public HTTPS from the operator workstation**

```powershell
$endpoints = @(
  'https://kod.kai.com/download',
  'https://kod.kai.com/download/linux/latest.json',
  'https://kod.kai.com/api/auto_upgrade/latest-linux.yml',
  'https://kod.kai.com/api/auto_upgrade/latest-linux-arm64.yml'
)
foreach ($endpoint in $endpoints) {
  $response = Invoke-WebRequest -Uri $endpoint -MaximumRedirection 5
  if ($response.StatusCode -ne 200) { throw "public health failed: $endpoint" }
}
```

Verify the main Linux button and all three alternatives resolve to their exact GitHub asset and return nonzero content. Verify both manifest responses include `Cache-Control: no-store`.

- [ ] **Step 9: Record deployment evidence and commit it**

Append UTC time, target/previous commits, new/previous image IDs, rollback tag, container health, four endpoint statuses, four asset statuses, and result `pass` to the runbook. Never record headers containing cookies or credentials.

```powershell
git add document/KOD-Linux-0.1.0-发布与回滚.md
git commit -m "docs(release): record Linux portal deployment"
git push origin release/3.0
git push github release/3.0
```

---

### Task 16: Perform final download verification and close the release evidence

**Repository:** `D:\watt\kod`

**Files:**
- Create: `docs/linux/release-report-0.1.0.md`
- Modify: `docs/linux/acceptance/0.1.0.json`
- Modify: `docs/linux/feature-matrix.json`

**Interfaces:**
- Produces the final evidence bundle tying source commit, tag, seven release assets, four public downloads, two update feeds, six distro/architecture checks, X11/Wayland tests, and production deployment together.
- Completion is forbidden while any matrix entry is non-verified or any public check is absent.

- [ ] **Step 1: Download all four public installers through the links exposed by the website**

Create a fresh directory and fetch every installer URL from the deployed manifest with redirects enabled. Refuse to overwrite an earlier verification run:

```powershell
Set-Location D:\watt\kod
if ($PSVersionTable.PSVersion -lt [version]'7.4') { throw 'PowerShell 7.4 or newer is required' }
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true
$downloadDir = Join-Path (Resolve-Path release\verified).Path 'public-downloads'
if (Test-Path -LiteralPath $downloadDir) { throw "Verification directory already exists: $downloadDir" }
New-Item -ItemType Directory -Path $downloadDir | Out-Null
$manifest = Invoke-RestMethod -Uri 'https://kod.kai.com/download/linux/latest.json'
$assets = @(
  $manifest.assets.x64.appImage,
  $manifest.assets.x64.deb,
  $manifest.assets.arm64.appImage,
  $manifest.assets.arm64.deb
)
foreach ($asset in $assets) {
  $target = Join-Path $downloadDir $asset.name
  Invoke-WebRequest -Uri $asset.url -MaximumRedirection 10 -OutFile $target
  if ((Get-Item -LiteralPath $target).Length -ne $asset.size) { throw "Size mismatch: $($asset.name)" }
  if ((Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant() -ne $asset.sha256.ToLowerInvariant()) {
    throw "SHA-256 mismatch: $($asset.name)"
  }
}
```

Assert the four names are exactly those in the release contract. Do not reuse the Task 12 downloads.

- [ ] **Step 2: Recheck updater manifests through production**

Download the checksum file and both production feeds into the same directory so it contains exactly the seven approved release assets:

```powershell
$downloadDir = (Resolve-Path release\verified\public-downloads).Path
Invoke-WebRequest -Uri 'https://github.com/wangtengwatt/KOD/releases/download/linux-v0.1.0/SHA256SUMS' -OutFile (Join-Path $downloadDir 'SHA256SUMS')
Invoke-WebRequest -Uri 'https://kod.kai.com/api/auto_upgrade/latest-linux.yml' -OutFile (Join-Path $downloadDir 'latest-linux.yml')
Invoke-WebRequest -Uri 'https://kod.kai.com/api/auto_upgrade/latest-linux-arm64.yml' -OutFile (Join-Path $downloadDir 'latest-linux-arm64.yml')
pnpm linux:release:verify -- $downloadDir --native-evidence-dir=release/verified/linux-v0.1.0-native-evidence
pnpm linux:release:verify-public -- $downloadDir --manifest-url=https://kod.kai.com/download/linux/latest.json --feed-base-url=https://kod.kai.com/api/auto_upgrade/
```

The offline verifier proves the seven local files; the public verifier fetches both YAML responses, follows each relative AppImage URL through Nginx, and compares the downloaded bytes and SHA-512 to the corresponding GitHub Release asset. It also asserts `Cache-Control: no-store`, the exact final redirect allowlist, and the architecture requested by each feed.

- [ ] **Step 3: Re-run the strict source and feature gates at the tagged commit**

```powershell
git diff linux-v0.1.0 --exit-code -- package.json release/app/package.json release/app/package-lock.json electron-builder-linux.yml src scripts test docs/linux/feature-matrix.json
pnpm linux:matrix:release
pnpm linux:release:verify -- release/verified/public-downloads --native-evidence-dir=release/verified/linux-v0.1.0-native-evidence
```

Expected: the functional/release source still matches the tag, every feature is `verified`, and downloaded packages pass the same artifact verifier.

- [ ] **Step 4: Write the final report**

Record:

- canonical source commit and annotated tag;
- workflow run URL and native runner architectures;
- seven release asset names, sizes, SHA-256/SHA-512 evidence;
- Ubuntu 22.04/24.04 and Debian 12 install/start results for x64 and arm64;
- X11 and Wayland smoke results;
- feature matrix summary and credential-gated manual checks;
- portal commit, production image ID, deployment time, health result, and rollback tag;
- public page/feed/download verification results;
- GPLv3 `LICENSE`/`NOTICE` and source-link verification;
- known best-effort distribution limitations.

Append the deployment/public-download/feed records to `docs/linux/acceptance/0.1.0.json` with the tagged source commit, portal commit, UTC timestamp, checked URLs, hashes/statuses, and `passed` result. Update only the corresponding final evidence references in `docs/linux/feature-matrix.json`; do not rewrite the tagged implementation mapping. Then rerun `pnpm linux:matrix:release` in this same strict PowerShell session before committing.

- [ ] **Step 5: Run the final unfinished-content and credential scan**

```powershell
$unfinishedPattern = ('place' + 'holder') + '|implement' + ' later|not' + ' supported|' + ('敬请' + '期待')
$credentialPattern = 'ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----|https?://[^/@\s]+:[^/@\s]+@'
function Assert-NoRgMatch {
  param([string]$Pattern, [string[]]$Paths, [string]$Label)
  $hits = & rg -n -i --glob '!*.test.*' -- $Pattern @Paths 2>$null
  $code = $LASTEXITCODE
  if ($code -eq 0) { $hits; throw "$Label found" }
  if ($code -gt 1) { throw "$Label scan failed" }
}
$unfinishedSurfaces = @(
  'docs/linux/feature-matrix.json',
  '..\kod-ai-portal\frontend\src\components\download\LinuxDownloadCard.tsx',
  '..\kod-ai-portal\frontend\public\download\linux\latest.json'
)
$securitySurfaces = @(
  'docs/linux', 'release-notes/linux-v0.1.0.md', 'electron-builder-linux.yml',
  'src/main/linux', 'src/main/secure-store.ts', 'src/main/settings-persistence.ts',
  'src/main/update-policy.ts', 'src/main/app-updater.ts', 'src/main/mcp/command-preflight.ts',
  'src/main/mcp/ipc-stdio-transport.ts', 'src/renderer/components/linux',
  'src/renderer/routes/about.tsx', 'src/renderer/Sidebar.tsx', 'src/renderer/routes/task/index.tsx',
  'src/renderer/i18n/linuxErrors.ts', '..\kod-ai-portal\frontend\src\components\download',
  '..\kod-ai-portal\frontend\src\releases', '..\kod-ai-portal\frontend\src\hooks\useLinuxRelease.ts',
  '..\kod-ai-portal\frontend\nginx.conf',
  '..\kod-ai-portal\frontend\public\download\linux', '..\kod-ai-portal\frontend\public\api\auto_upgrade',
  '..\kod-ai-portal\document\KOD-Linux-0.1.0-发布与回滚.md'
)
Assert-NoRgMatch $unfinishedPattern $unfinishedSurfaces 'Unfinished Linux release content'
Assert-NoRgMatch $credentialPattern $securitySurfaces 'Credential-like literal'
Assert-NoRgMatch 'chatboxai\.(app|com)|chatbox.*auto_upgrade' @('src/main/app-updater.ts','src/main/update-policy.ts','electron-builder-linux.yml','docs/linux','release-notes') 'Stale update domain'
git diff --check
```

Expected: no release-blocking unfinished-content marker, stale Linux update domain, credential literal, or whitespace error. Product-history/internal identifiers that are not network endpoints are not renamed solely for this scan.

- [ ] **Step 6: Commit and mirror the final evidence**

```powershell
pnpm linux:matrix:release
git add docs/linux/release-report-0.1.0.md docs/linux/acceptance/0.1.0.json docs/linux/feature-matrix.json
git commit -m "docs(release): record KOD Linux 0.1.0 verification"
git push origin suanlizhongxin_KOD
git push github suanlizhongxin_KOD
```

The release is complete only after this commit and all Task 16 checks pass. Do not move `linux-v0.1.0`; the report intentionally records post-release production evidence on the branch.
