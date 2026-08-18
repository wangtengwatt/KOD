# KOD Source Unification and Feature Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `D:\watt\kod` the only business-source upstream, turn `KOD-iOS` and `kod-android` into pinned native release wrappers, and establish a machine-readable feature catalog that prevents false parity claims.

**Architecture:** The canonical repository builds immutable iOS and Android web bundles carrying a source manifest. Each native release repository pins one canonical commit, verifies the manifest, copies only the verified bundle into its Capacitor `www` directory, and owns only native code and store configuration. A feature catalog and cross-repository lock verifier become release gates; current mobile-only work is archived before duplicate business source is removed.

**Tech Stack:** Node.js 22.12+, pnpm 10.17+, TypeScript 5.8, Vitest 4, Electron Vite 4, Capacitor 7, GitHub Actions, Xcode 17-compatible runner, Gradle/Android SDK.

**Spec:** `docs/superpowers/specs/2026-08-18-cross-platform-feature-parity-design.md`

## Global Constraints

- `D:\watt\kod` is the only business-source upstream.
- `KOD-iOS` and `kod-android` may retain only native projects, native plugins, signing/store configuration, wrapper build scripts, documentation, and generated web assets ignored by Git.
- Preserve every current iOS and Android product-source change in a recoverable Git commit and archive tag before deleting duplicate source. Repository-local `.agents/` and `openspec/config.yaml` metadata are explicitly outside product-source scope and remain unstaged.
- Do not stage or modify unrelated untracked plans already present under `docs/superpowers/plans/`.
- Do not migrate Android accessibility-agent or system-overlay code into the canonical client; the approved design uses in-app UI, notifications, and cloud execution.
- Internal identifiers that still say `chatbox` are not renamed solely for branding; rename only when required by a public route, bundle ID, or user-visible string.
- iOS deployment target remains 17.0 and device family remains iPhone/iPad.
- Capacitor remains major version 7; Node remains `>=22.12.0 <25.0.0`; pnpm remains `>=10.17.0`.
- A feature is never `verified` without platform-specific automated evidence.
- No production key, certificate, provisioning profile, keystore, store API key, or cluster credential enters Git.
- Use `apply_patch` for focused edits. Before any recursive removal, verify the absolute repository root and confirm the archived commit/tag exists.
- Every task ends with its own passing tests and intentional commit. If the Windows hook fails only because `/usr/bin/env sh` is unavailable, run the already-verified commit with `git -c core.hooksPath=.git/no-hooks commit` and record that fact.

## File Structure

### Canonical repository: `D:\watt\kod`

- `src/shared/feature-catalog.ts` — typed product feature IDs, target mappings, roles, routes, and evidence.
- `src/shared/feature-catalog.test.ts` — catalog completeness and truthfulness rules.
- `scripts/platform-release/mobile-delta-inventory.ts` — deterministic mobile fork inventory.
- `scripts/platform-release/mobile-delta-inventory.test.ts` — parser and path-classification tests.
- `scripts/platform-release/render-feature-catalog.ts` — renders the catalog to reviewable Markdown.
- `scripts/platform-release/build-mobile-bundle.ts` — copies a platform build and writes its source manifest.
- `scripts/platform-release/build-mobile-bundle.test.ts` — deterministic hashing and safe-output tests.
- `scripts/platform-release/upstream-lock.ts` — lock-file schema and validation shared by release checks.
- `scripts/platform-release/upstream-lock.test.ts` — lock validation and mismatch tests.
- `scripts/platform-release/verify-release-locks.ts` — proves iOS and Android pin the same canonical commit.
- `config/platform-release-sources.json` — local/default mobile source locations and the common fork baseline.
- `docs/platform-parity/mobile-source-deltas.json` — generated preservation and migration inventory.
- `docs/platform-parity/feature-catalog.md` — generated human-readable catalog.
- `docs/platform-parity/source-unification-report.md` — final evidence for this subproject.
- `.github/workflows/platform-parity.yml` — canonical quality, bundle, catalog, and release-train checks.
- `package.json` — canonical parity and mobile-bundle commands.
- `.gitignore` — generated bundle output exclusions.

### iOS release repository: `D:\watt\KOD-iOS`

- `ios/` — retained native Xcode project and approved Swift plugins.
- `kod-upstream.lock.json` — exact canonical repository, commit, and release-train ID.
- `scripts/sync-upstream.mjs` — builds/validates canonical iOS bundle and copies it to `www`.
- `scripts/upstream-lock.test.mjs` — wrapper lock and mismatch tests.
- `scripts/verify-thin-wrapper.mjs` — forbids duplicate business roots and validates native readiness.
- `scripts/verify-ios-release.mjs` — validates native iOS release prerequisites without reading removed `src` files.
- `capacitor.config.ts` — iOS wrapper config with `webDir: 'www'`.
- `package.json`, `pnpm-lock.yaml` — minimal Capacitor wrapper toolchain.
- `.github/workflows/ios.yml` — macOS build and optional TestFlight pipeline using the pinned upstream.

### Android release repository: `D:\watt\kod-android`

- `android/` — retained native Android project after accessibility-agent/overlay removal.
- `kod-upstream.lock.json` — exact canonical repository, commit, and release-train ID.
- `scripts/sync-upstream.mjs` — builds/validates canonical Android bundle and copies it to `www`.
- `scripts/upstream-lock.test.mjs` — wrapper lock and mismatch tests.
- `scripts/verify-thin-wrapper.mjs` — forbids duplicate business roots and validates Android ownership.
- `android/app/src/test/java/com/kod/app/ThinWrapperManifestTest.java` — prevents accessibility/overlay capabilities from returning.
- `capacitor.config.ts` — Android wrapper config with `webDir: 'www'`.
- `package.json`, `pnpm-lock.yaml` — minimal Capacitor wrapper toolchain.
- `.github/workflows/android.yml` — pinned upstream sync and Gradle build.

---

### Task 1: Inventory and preserve every mobile-source delta

**Files:**
- Create: `scripts/platform-release/mobile-delta-inventory.ts`
- Create: `scripts/platform-release/mobile-delta-inventory.test.ts`
- Create: `config/platform-release-sources.json`
- Create: `docs/platform-parity/mobile-source-deltas.json`
- Modify: `vitest.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `type MobileSourceId = 'ios' | 'android'`.
- Produces `classifyMobilePath(path: string): DeltaDomain` where `DeltaDomain` is `native-shell | shared-client | cloud-prototype | generated | tooling | documentation`.
- Produces `parseNameStatusZ(raw: Buffer): NameStatusEntry[]`.
- Produces CLI command `pnpm parity:inventory` and deterministic JSON schema version `1`.
- The generated inventory is consumed by Tasks 5, 6, and 7; it is not itself proof that a feature works.

- [ ] **Step 1: Extend test discovery and add failing path-classification and parser tests**

Modify the existing `vitest.config.ts` `include` list so repository tooling tests are actually collected:

```ts
include: [
  'src/**/*.{test,spec}.{ts,tsx}',
  'scripts/**/*.{test,spec}.{ts,tsx}',
  'test/integration/**/*.{test,spec}.{ts,tsx}',
],
```

Create `scripts/platform-release/mobile-delta-inventory.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { classifyMobilePath, parseNameStatusZ } from './mobile-delta-inventory'

describe('classifyMobilePath', () => {
  it.each([
    ['ios/App/App/StoreKitPlugin.swift', 'native-shell'],
    ['android/app/src/main/AndroidManifest.xml', 'native-shell'],
    ['src/renderer/Sidebar.tsx', 'shared-client'],
    ['src/renderer/sync/outbox.ts', 'cloud-prototype'],
    ['release/app/dist/renderer/index.html', 'generated'],
    ['scripts/verify-ios-release.mjs', 'tooling'],
    ['docs/ios/README.md', 'documentation'],
  ] as const)('maps %s to %s', (path, expected) => {
    expect(classifyMobilePath(path)).toBe(expected)
  })
})

describe('parseNameStatusZ', () => {
  it('parses modifications and renames without losing either path', () => {
    const raw = Buffer.from('M\0src/a.ts\0R100\0src/old.ts\0src/new.ts\0')
    expect(parseNameStatusZ(raw)).toEqual([
      { status: 'M', path: 'src/a.ts' },
      { status: 'R100', path: 'src/new.ts', previousPath: 'src/old.ts' },
    ])
  })
})
```

- [ ] **Step 2: Run the focused test and verify red**

Run:

```powershell
pnpm exec vitest run scripts/platform-release/mobile-delta-inventory.test.ts
```

Expected: FAIL because `mobile-delta-inventory.ts` does not exist.

- [ ] **Step 3: Implement deterministic classification and Git inventory**

Create `scripts/platform-release/mobile-delta-inventory.ts` with these exported contracts and exact classification precedence:

```ts
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

export type MobileSourceId = 'ios' | 'android'
export type DeltaDomain =
  | 'native-shell'
  | 'shared-client'
  | 'cloud-prototype'
  | 'generated'
  | 'tooling'
  | 'documentation'

export interface NameStatusEntry {
  status: string
  path: string
  previousPath?: string
}

export function classifyMobilePath(path: string): DeltaDomain {
  const normalized = path.replaceAll('\\', '/')
  if (normalized.startsWith('ios/') || normalized.startsWith('android/')) return 'native-shell'
  if (normalized.startsWith('release/') || normalized.includes('/dist/')) return 'generated'
  if (normalized.startsWith('docs/')) return 'documentation'
  if (normalized.startsWith('scripts/') || normalized.startsWith('.github/')) return 'tooling'
  if (
    normalized.startsWith('src/renderer/sync/') ||
    normalized.includes('cloud_sandbox') ||
    normalized.includes('storekit') ||
    normalized.includes('authSecureStorage') ||
    normalized.includes('cloud-controller')
  ) {
    return 'cloud-prototype'
  }
  return 'shared-client'
}

export function parseNameStatusZ(raw: Buffer): NameStatusEntry[] {
  const parts = raw.toString('utf8').split('\0').filter(Boolean)
  const entries: NameStatusEntry[] = []
  for (let index = 0; index < parts.length; ) {
    const status = parts[index++]
    if (status.startsWith('R') || status.startsWith('C')) {
      const previousPath = parts[index++]
      const path = parts[index++]
      entries.push({ status, path, previousPath })
    } else {
      entries.push({ status, path: parts[index++] })
    }
  }
  return entries
}

function git(root: string, args: string[]): Buffer {
  const result = spawnSync('git', ['-C', root, ...args], { encoding: 'buffer' })
  if (result.status !== 0) throw new Error(result.stderr.toString('utf8'))
  return result.stdout
}

async function sha256(root: string, path: string): Promise<string | null> {
  try {
    return createHash('sha256').update(await readFile(resolve(root, path))).digest('hex')
  } catch {
    return null
  }
}
```

The CLI must read `config/platform-release-sources.json`, run `git diff --name-status -z <baseline>` plus `git ls-files --others --exclude-standard -z` for each source, deduplicate by `(source,path)`, attach `domain`, `sha256`, `status`, and `previousPath`, sort by `source` then `path`, and write UTF-8 JSON with a trailing newline. Reject roots outside the parent workspace and reject a baseline that `git cat-file -e <baseline>^{commit}` cannot resolve.

- [ ] **Step 4: Add exact source configuration and package command**

Create `config/platform-release-sources.json`:

```json
{
  "schemaVersion": 1,
  "sources": [
    {
      "id": "ios",
      "defaultRoot": "../KOD-iOS",
      "baseline": "5346c45"
    },
    {
      "id": "android",
      "defaultRoot": "../kod-android",
      "baseline": "5346c45"
    }
  ]
}
```

Add to `package.json`:

```json
"parity:inventory": "tsx scripts/platform-release/mobile-delta-inventory.ts"
```

- [ ] **Step 5: Run tests and generate the checked-in inventory**

Run:

```powershell
pnpm exec vitest run scripts/platform-release/mobile-delta-inventory.test.ts
pnpm parity:inventory
$firstInventoryHash = (Get-FileHash docs/platform-parity/mobile-source-deltas.json -Algorithm SHA256).Hash
pnpm parity:inventory
$secondInventoryHash = (Get-FileHash docs/platform-parity/mobile-source-deltas.json -Algorithm SHA256).Hash
if ($firstInventoryHash -ne $secondInventoryHash) { throw 'mobile inventory is not deterministic' }
```

Expected: tests PASS; the second generation is byte-for-byte identical and the final diff command exits `0`.

- [ ] **Step 6: Inspect preservation coverage**

Run:

```powershell
$inventory = Get-Content -Raw docs/platform-parity/mobile-source-deltas.json | ConvertFrom-Json
$inventory.entries | Group-Object source,domain | Select-Object Name,Count
git -C ..\KOD-iOS status --short
git -C ..\kod-android status --short
```

Expected: every current iOS changed/untracked file and every Android delta since `5346c45` appears in the inventory; this step changes neither mobile repository.

- [ ] **Step 7: Commit Task 1**

```powershell
git add package.json vitest.config.ts config/platform-release-sources.json scripts/platform-release/mobile-delta-inventory.ts scripts/platform-release/mobile-delta-inventory.test.ts docs/platform-parity/mobile-source-deltas.json
git commit -m "chore(platform): inventory mobile source deltas"
```

---

### Task 2: Add the machine-readable feature catalog and truthfulness rules

**Files:**
- Create: `src/shared/feature-catalog.ts`
- Create: `src/shared/feature-catalog.test.ts`
- Create: `scripts/platform-release/render-feature-catalog.ts`
- Create: `docs/platform-parity/feature-catalog.md`
- Modify: `package.json`

**Interfaces:**
- Produces `featureCatalog`, `FeatureId`, `ParityTarget`, `FeatureStatus`, `FeatureTarget`, and `getOverallFeatureStatus`.
- Produces `pnpm parity:catalog:render` and `pnpm parity:catalog:check`.
- Later subprojects update target status and evidence in one canonical file; release wrappers never own feature status.

- [ ] **Step 1: Write catalog integrity tests first**

Create `src/shared/feature-catalog.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { featureCatalog, parityTargets } from './feature-catalog'

describe('featureCatalog', () => {
  it('has unique IDs and all four target mappings', () => {
    const ids = featureCatalog.map((feature) => feature.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const feature of featureCatalog) {
      expect(Object.keys(feature.targets).sort()).toEqual([...parityTargets].sort())
    }
  })

  it('does not expose development or administrator routes', () => {
    for (const feature of featureCatalog) {
      expect(feature.route ?? '').not.toMatch(/^\/dev(?:\/|$)/)
      expect(feature.roles).not.toContain('platform-admin')
    }
  })

  it('requires automated evidence before a target is verified', () => {
    for (const feature of featureCatalog) {
      for (const target of parityTargets) {
        const value = feature.targets[target]
        if (value.status === 'verified') expect(value.evidence.length).toBeGreaterThan(0)
      }
    }
  })

  it('covers every approved formal product domain', () => {
    expect(featureCatalog.map((feature) => feature.id)).toEqual(
      expect.arrayContaining([
        'identity.kai-login',
        'data.cross-device-sync',
        'chat.conversation',
        'tasks.cloud-agent',
        'media.image-generation',
        'media.video-generation',
        'knowledge.library',
        'tools.mcp',
        'tools.skills',
        'compute.market-buyer',
        'compute.market-seller',
        'compute.wallet',
        'payments.digital-entitlements',
      ])
    )
  })
})
```

- [ ] **Step 2: Run the focused catalog test and verify red**

```powershell
pnpm exec vitest run src/shared/feature-catalog.test.ts
```

Expected: FAIL because `feature-catalog.ts` does not exist.

- [ ] **Step 3: Implement the typed catalog**

Create `src/shared/feature-catalog.ts` with these exact types:

```ts
export const parityTargets = ['desktop', 'iphone', 'ipad', 'android'] as const
export type ParityTarget = (typeof parityTargets)[number]
export type FeatureStatus = 'not-started' | 'in-progress' | 'blocked-external' | 'verified'
export type ExecutionMode = 'shared-client' | 'native-adapter' | 'cloud-service' | 'desktop-enhancement'
export type ProductRole = 'signed-in-user' | 'compute-buyer' | 'compute-seller'

export const featureIds = [
  'identity.kai-login',
  'identity.account-deletion',
  'data.cross-device-sync',
  'chat.conversation',
  'chat.attachments',
  'chat.web-search',
  'tasks.cloud-agent',
  'media.image-generation',
  'media.video-generation',
  'knowledge.library',
  'knowledge.session-rag',
  'tools.mcp',
  'tools.skills',
  'copilots.library',
  'providers.model-settings',
  'compute.market-buyer',
  'compute.market-seller',
  'compute.wallet',
  'payments.digital-entitlements',
  'settings.application',
  'native.notifications-share',
] as const

export type FeatureId = (typeof featureIds)[number]

export interface FeatureTarget {
  mode: ExecutionMode
  status: FeatureStatus
  evidence: readonly string[]
}

export interface ProductFeature {
  id: FeatureId
  name: string
  route?: string
  roles: readonly ProductRole[]
  targets: Record<ParityTarget, FeatureTarget>
}
```

Use these helpers so all initial evidence arrays are empty and every target is explicitly represented:

```ts
const target = (mode: ExecutionMode): FeatureTarget => ({ mode, status: 'in-progress', evidence: [] })

const targets = (desktop: ExecutionMode, mobile: ExecutionMode): Record<ParityTarget, FeatureTarget> => ({
  desktop: target(desktop),
  iphone: target(mobile),
  ipad: target(mobile),
  android: target(mobile),
})
```

Create all 21 entries using this exact mapping; `name` is the English human label in the second column:

| Feature ID | Name | Route | Roles | Desktop mode | Mobile mode |
|---|---|---|---|---|---|
| `identity.kai-login` | KAI unified identity | `/settings/chatbox-ai` | `signed-in-user` | `shared-client` | `native-adapter` |
| `identity.account-deletion` | Account deletion | `/settings/chatbox-ai` | `signed-in-user` | `shared-client` | `shared-client` |
| `data.cross-device-sync` | Cross-device sync | `/settings/general` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `chat.conversation` | Conversations | `/` | `signed-in-user` | `shared-client` | `shared-client` |
| `chat.attachments` | Chat attachments | `/` | `signed-in-user` | `shared-client` | `native-adapter` |
| `chat.web-search` | Web search | `/settings/web-search` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `tasks.cloud-agent` | Cloud agent tasks | `/task` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `media.image-generation` | Image generation | `/image-creator` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `media.video-generation` | Video generation | `/video-creator` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `knowledge.library` | Knowledge library | `/settings/knowledge-base` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `knowledge.session-rag` | Session RAG | `/` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `tools.mcp` | MCP tools | `/settings/mcp` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `tools.skills` | Skills | `/settings/skills` | `signed-in-user` | `cloud-service` | `cloud-service` |
| `copilots.library` | Copilots | `/copilots` | `signed-in-user` | `shared-client` | `shared-client` |
| `providers.model-settings` | Model providers | `/settings/provider` | `signed-in-user` | `shared-client` | `shared-client` |
| `compute.market-buyer` | Compute marketplace buyer | `/compute-center` | `compute-buyer` | `cloud-service` | `cloud-service` |
| `compute.market-seller` | Compute marketplace seller | `/compute-center` | `compute-seller` | `cloud-service` | `cloud-service` |
| `compute.wallet` | Compute wallet | `/settings/wallet` | `signed-in-user`, `compute-buyer`, `compute-seller` | `cloud-service` | `cloud-service` |
| `payments.digital-entitlements` | Digital entitlements | `/settings/wallet` | `signed-in-user`, `compute-buyer` | `shared-client` | `native-adapter` |
| `settings.application` | Application settings | `/settings/` | `signed-in-user` | `shared-client` | `shared-client` |
| `native.notifications-share` | Notifications and sharing | `/settings/general` | `signed-in-user` | `desktop-enhancement` | `native-adapter` |

Set all initial target statuses to `in-progress`. A later feature task may change a target to `verified` only while adding an automated evidence path that proves the full target. Do not infer `verified` from a successful build or visible button.

Implement:

```ts
export function getOverallFeatureStatus(feature: ProductFeature): FeatureStatus {
  const statuses = parityTargets.map((target) => feature.targets[target].status)
  if (statuses.every((status) => status === 'verified')) return 'verified'
  if (statuses.some((status) => status === 'blocked-external')) return 'blocked-external'
  if (statuses.some((status) => status === 'in-progress')) return 'in-progress'
  return 'not-started'
}
```

- [ ] **Step 4: Add deterministic Markdown rendering**

Create `scripts/platform-release/render-feature-catalog.ts`. It must import `featureCatalog`, sort by `id`, and render this column order:

```text
Feature ID | Name | Route | Roles | Desktop | iPhone | iPad | Android | Overall
```

The CLI accepts `--check`. In check mode it compares generated text with `docs/platform-parity/feature-catalog.md` and exits `1` on mismatch; otherwise it writes the file with UTF-8 and a trailing newline.

Add package commands:

```json
"parity:catalog:render": "tsx scripts/platform-release/render-feature-catalog.ts",
"parity:catalog:check": "tsx scripts/platform-release/render-feature-catalog.ts --check"
```

- [ ] **Step 5: Run tests, render twice, and verify determinism**

```powershell
pnpm exec vitest run src/shared/feature-catalog.test.ts
pnpm parity:catalog:render
pnpm parity:catalog:check
pnpm check
```

Expected: every command passes; the generated Markdown contains 21 formal features and no `/dev` route.

- [ ] **Step 6: Commit Task 2**

```powershell
git add package.json src/shared/feature-catalog.ts src/shared/feature-catalog.test.ts scripts/platform-release/render-feature-catalog.ts docs/platform-parity/feature-catalog.md
git commit -m "feat(platform): add cross-platform feature catalog"
```

---

### Task 3: Build immutable platform bundles with source manifests

**Files:**
- Create: `scripts/platform-release/build-mobile-bundle.ts`
- Create: `scripts/platform-release/build-mobile-bundle.test.ts`
- Modify: `package.json`
- Modify: `.gitignore`

**Interfaces:**
- Produces `MobileBuildPlatform = 'ios' | 'android'`.
- Produces `hashDirectory(root: string): Promise<{ digest: string; files: BuildFile[] }>`.
- Produces `createMobileBuildManifest(input): Promise<MobileBuildManifest>`.
- Produces `pnpm mobile:bundle:ios` and `pnpm mobile:bundle:android`.
- Release wrappers consume `release/mobile/<platform>/www/kod-build-manifest.json`.

- [ ] **Step 1: Write deterministic hashing tests**

Create `scripts/platform-release/build-mobile-bundle.test.ts`:

```ts
import { mkdtemp, mkdir, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { createMobileBuildManifest, hashDirectory } from './build-mobile-bundle'

describe('mobile bundle manifest', () => {
  it('hashes files in normalized lexical order', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kod-bundle-'))
    await mkdir(join(root, 'assets'))
    await writeFile(join(root, 'z.js'), 'z')
    await writeFile(join(root, 'assets', 'a.js'), 'a')
    const first = await hashDirectory(root)
    const second = await hashDirectory(root)
    expect(first).toEqual(second)
    expect(first.files.map((file) => file.path)).toEqual(['assets/a.js', 'z.js'])
  })

  it('binds the artifact to platform and full source commit', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kod-bundle-'))
    await writeFile(join(root, 'index.html'), '<main>KOD</main>')
    const manifest = await createMobileBuildManifest({
      platform: 'ios',
      sourceCommit: '1111111111111111111111111111111111111111',
      sourceVersion: '0.0.1',
      rendererRoot: root,
    })
    expect(manifest.platform).toBe('ios')
    expect(manifest.sourceCommit).toHaveLength(40)
    expect(manifest.rendererSha256).toMatch(/^[a-f0-9]{64}$/)
  })
})
```

- [ ] **Step 2: Run the focused bundle test and verify red**

```powershell
pnpm exec vitest run scripts/platform-release/build-mobile-bundle.test.ts
```

Expected: FAIL because `build-mobile-bundle.ts` does not exist.

- [ ] **Step 3: Implement safe bundle creation**

Create `scripts/platform-release/build-mobile-bundle.ts` with this public shape:

```ts
export type MobileBuildPlatform = 'ios' | 'android'

export interface BuildFile {
  path: string
  bytes: number
  sha256: string
}

export interface MobileBuildManifest {
  schemaVersion: 1
  product: 'KOD'
  platform: MobileBuildPlatform
  sourceCommit: string
  sourceVersion: string
  rendererSha256: string
  files: BuildFile[]
}
```

Implementation requirements:

1. Resolve the repository root with `git rev-parse --show-toplevel` and the full commit with `git rev-parse HEAD`.
2. When invoked as a CLI, reject staged or unstaged changes to tracked files using `git diff --quiet -- .` and `git diff --cached --quiet -- .`. Also reject untracked files under `src`, `scripts/platform-release`, `package.json`, `pnpm-lock.yaml`, `electron.vite.config.ts`, and `capacitor.config.ts`. Untracked documentation outside those build inputs may exist and must not invalidate an otherwise reproducible bundle.
3. Accept exactly `ios` or `android` as the CLI platform.
4. Build from `release/app/dist/renderer` into the verified absolute target `release/mobile/<platform>/www`.
5. Refuse deletion unless the resolved target starts with `<repo>/release/mobile/` and is not that parent directory itself.
6. Copy the renderer, hash every regular file except the manifest, and write `kod-build-manifest.json`.
7. Hash each row as `path + NUL + bytes + NUL + fileSha256 + newline`, then SHA-256 the concatenated rows for `rendererSha256`.

- [ ] **Step 4: Add bundle commands without native sync**

Add these commands to `package.json`:

```json
"mobile:web:ios": "cross-env CHATBOX_BUILD_TARGET=mobile_app CHATBOX_BUILD_PLATFORM=ios electron-vite build && pnpm run delete-sourcemaps",
"mobile:web:android": "cross-env CHATBOX_BUILD_TARGET=mobile_app CHATBOX_BUILD_PLATFORM=android electron-vite build && pnpm run delete-sourcemaps",
"mobile:bundle:ios": "pnpm run mobile:web:ios && tsx scripts/platform-release/build-mobile-bundle.ts ios",
"mobile:bundle:android": "pnpm run mobile:web:android && tsx scripts/platform-release/build-mobile-bundle.ts android"
```

Add to `.gitignore`:

```gitignore
/release/mobile/
```

- [ ] **Step 5: Pass focused checks, commit the implementation, then verify both canonical bundles**

The CLI intentionally requires committed build inputs. Run unit/type checks, make the Task 3 commit, then build both clean-tree artifacts:

```powershell
pnpm exec vitest run scripts/platform-release/build-mobile-bundle.test.ts
pnpm check
git add package.json .gitignore scripts/platform-release/build-mobile-bundle.ts scripts/platform-release/build-mobile-bundle.test.ts
git commit -m "build(platform): produce pinned mobile bundles"
pnpm mobile:bundle:ios
pnpm mobile:bundle:android
$ios = Get-Content -Raw release/mobile/ios/www/kod-build-manifest.json | ConvertFrom-Json
$android = Get-Content -Raw release/mobile/android/www/kod-build-manifest.json | ConvertFrom-Json
if ($ios.sourceCommit -ne $android.sourceCommit -or $ios.platform -ne 'ios' -or $android.platform -ne 'android') {
  throw 'bundle manifests do not describe one cross-platform source commit'
}
```

Expected: tests and builds pass; both manifests contain the same 40-character source commit and different platform values.

- [ ] **Step 6: Handle any post-commit bundle failure without hiding it**

If either platform build fails after the Task 3 commit, add the smallest failing regression test, fix it, rerun both platform builds, and create a separate corrective commit:

```powershell
git add scripts/platform-release/build-mobile-bundle.ts scripts/platform-release/build-mobile-bundle.test.ts package.json
git commit -m "fix(platform): make mobile bundles reproducible"
```

Do not amend or declare Task 3 complete until both manifests have passed the equality assertion above.

---

### Task 4: Define and verify the upstream lock contract

**Files:**
- Create: `scripts/platform-release/upstream-lock.ts`
- Create: `scripts/platform-release/upstream-lock.test.ts`
- Create: `scripts/platform-release/pin-upstream-lock.ts`
- Create: `scripts/platform-release/verify-release-locks.ts`
- Modify: `package.json`

**Interfaces:**
- Produces `KodUpstreamLock` with `schemaVersion`, `repository`, `commit`, and `releaseTrain`.
- Produces `readUpstreamLock(path: string): Promise<KodUpstreamLock>`.
- Produces `writeUpstreamLock(path: string, lock: KodUpstreamLock): Promise<void>` with deterministic UTF-8 JSON.
- Produces `verifyReleaseLocks(canonicalCommit, iosLock, androidLock): void`.
- Produces CLI `pnpm parity:pin-lock -- --target <wrapper-root> --release-train <id>`.
- Treats `releaseTrain` as the exact canonical Git tag name; wrappers pin the commit that tag resolves to.
- Produces CLI `pnpm parity:locks -- --ios-root <path> --android-root <path>`.

- [ ] **Step 1: Write lock validation tests**

Create `scripts/platform-release/upstream-lock.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { parseUpstreamLock, verifyReleaseLocks } from './upstream-lock'

const commit = '2222222222222222222222222222222222222222'
const valid = {
  schemaVersion: 1,
  repository: 'https://gitlab.kaiweb.org/KAI/oD/KoD/kod.git',
  commit,
  releaseTrain: 'kod-2026.08.18.1',
}

describe('upstream lock', () => {
  it('accepts the exact schema', () => {
    expect(parseUpstreamLock(valid)).toEqual(valid)
  })

  it('rejects abbreviated commits', () => {
    expect(() => parseUpstreamLock({ ...valid, commit: '2222222' })).toThrow(/40-character/)
  })

  it('rejects cross-platform drift', () => {
    expect(() =>
      verifyReleaseLocks(commit, valid, {
        ...valid,
        commit: '3333333333333333333333333333333333333333',
      })
    ).toThrow(/same canonical commit/)
  })
})
```

- [ ] **Step 2: Run the lock test and verify red**

```powershell
pnpm exec vitest run scripts/platform-release/upstream-lock.test.ts
```

Expected: FAIL because `upstream-lock.ts` does not exist.

- [ ] **Step 3: Implement strict parsing and equality checks**

Create `scripts/platform-release/upstream-lock.ts`:

```ts
export interface KodUpstreamLock {
  schemaVersion: 1
  repository: string
  commit: string
  releaseTrain: string
}

export function parseUpstreamLock(value: unknown): KodUpstreamLock {
  if (!value || typeof value !== 'object') throw new Error('upstream lock must be an object')
  const lock = value as Record<string, unknown>
  if (lock.schemaVersion !== 1) throw new Error('upstream lock schemaVersion must be 1')
  if (typeof lock.repository !== 'string' || !lock.repository.startsWith('https://')) {
    throw new Error('upstream repository must be an HTTPS URL')
  }
  if (typeof lock.commit !== 'string' || !/^[a-f0-9]{40}$/.test(lock.commit)) {
    throw new Error('upstream commit must be a lowercase 40-character SHA-1')
  }
  if (typeof lock.releaseTrain !== 'string' || !/^kod-\d{4}\.\d{2}\.\d{2}\.\d+$/.test(lock.releaseTrain)) {
    throw new Error('releaseTrain must match kod-YYYY.MM.DD.N')
  }
  return lock as unknown as KodUpstreamLock
}

export function verifyReleaseLocks(
  canonicalCommit: string,
  ios: KodUpstreamLock,
  android: KodUpstreamLock
): void {
  if (ios.commit !== android.commit) throw new Error('iOS and Android must pin the same canonical commit')
  if (ios.commit !== canonicalCommit) throw new Error('release locks do not match canonical commit')
  if (ios.releaseTrain !== android.releaseTrain) throw new Error('release trains differ')
  if (ios.repository !== android.repository) throw new Error('upstream repositories differ')
}
```

Add `readUpstreamLock(path)` using `readFile` and `JSON.parse`. Add `writeUpstreamLock(path, lock)` that validates first, serializes with `JSON.stringify(lock, null, 2) + '\n'`, and writes UTF-8. Extend the test with a temporary-directory round trip and assert the file has one trailing newline.

Create `scripts/platform-release/pin-upstream-lock.ts`. It must:

1. Require exactly one `--target <wrapper-root>` and one valid `--release-train <id>`.
2. Resolve the canonical root and full `HEAD` with Git.
3. Resolve the target directory, require its Git top level to equal that exact directory, and require its parent to equal the canonical repository's parent workspace.
4. Call `writeUpstreamLock(<target>/kod-upstream.lock.json, { schemaVersion: 1, repository: 'https://gitlab.kaiweb.org/KAI/oD/KoD/kod.git', commit: <canonical HEAD>, releaseTrain })`.
5. Print only target path, release train, and commit; never environment data.

Create `verify-release-locks.ts` to require exactly one `--ios-root` and one `--android-root`, verify each path is a Git top level under the same parent workspace, and read each `<root>/kod-upstream.lock.json`. Require both release-train IDs to be equal, resolve the canonical commit with `git rev-parse refs/tags/<releaseTrain>^{commit}`, and call `verifyReleaseLocks` with that tagged commit. Do not compare against a moving branch `HEAD`; documentation-only evidence commits after the release tag must not invalidate an immutable release train.

- [ ] **Step 4: Add the package command and run tests**

Add:

```json
"parity:pin-lock": "tsx scripts/platform-release/pin-upstream-lock.ts",
"parity:locks": "tsx scripts/platform-release/verify-release-locks.ts"
```

Run:

```powershell
pnpm exec vitest run scripts/platform-release/upstream-lock.test.ts
pnpm check
```

Expected: PASS.

- [ ] **Step 5: Commit Task 4**

```powershell
git add package.json scripts/platform-release/upstream-lock.ts scripts/platform-release/upstream-lock.test.ts scripts/platform-release/pin-upstream-lock.ts scripts/platform-release/verify-release-locks.ts
git commit -m "build(platform): define release upstream locks"
```

---

### Task 5: Preserve the iOS prototype and convert `KOD-iOS` to a thin native wrapper

**Files:**
- Preserve in archive commit: current `src/`, `ios/`, `docs/ios/`, `.github/workflows/ios.yml`, `scripts/verify-ios-release.mjs`, `scripts/windows-node-userinfo-shim.cjs`, `capacitor.config.ts`, `package.json`
- Create: `kod-upstream.lock.json`
- Create: `scripts/sync-upstream.mjs`
- Create: `scripts/upstream-lock.test.mjs`
- Create: `scripts/verify-thin-wrapper.mjs`
- Modify: `scripts/verify-ios-release.mjs`
- Modify: `capacitor.config.ts`
- Replace: `package.json`
- Regenerate: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Modify: `.github/workflows/ios.yml`
- Remove after archive: duplicated shared/Electron source and Android native project

**Interfaces:**
- Consumes the Task 3 command `pnpm mobile:bundle:ios` from a locked canonical checkout.
- Consumes `kod-build-manifest.json` schema version `1`.
- Produces wrapper command `pnpm sync:ios` and verification command `pnpm verify:wrapper`.
- Produces native web root `www`, always ignored by Git.

- [ ] **Step 1: Verify exact iOS repository target and scan staged scope for secrets**

Run from `D:\watt\KOD-iOS`:

```powershell
$root = (git rev-parse --show-toplevel).Trim()
if ((Resolve-Path $root).Path -ne (Resolve-Path 'D:\watt\KOD-iOS').Path) { throw 'wrong iOS repository' }
git status --short
rg -n --pcre2 --hidden --glob '!node_modules/**' --glob '!release/**' '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|(?:APP_STORE_CONNECT_API_KEY_BASE64|IOS_DISTRIBUTION_CERTIFICATE_BASE64|password)\h*[:=]\h*(?![$<{])\S+)' src ios docs/ios scripts .github capacitor.config.ts package.json
```

Expected: repository path matches; findings contain no real private key, certificate, profile, or password. Stop and remove any real secret before staging.

- [ ] **Step 2: Create a recoverable archive branch and commit the current iOS work**

```powershell
git switch -c archive/ios-full-source-20260818
git add -- src ios docs/ios .github/workflows/ios.yml scripts/verify-ios-release.mjs scripts/windows-node-userinfo-shim.cjs capacitor.config.ts package.json
git commit -m "archive(ios): preserve pre-unification mobile implementation"
git tag archive-ios-full-source-20260818
git switch -c feature/ios-thin-wrapper
git show --stat archive-ios-full-source-20260818
```

Expected: the tag resolves and includes all paths listed for preservation. Do not stage `.agents/` or unrelated OpenSpec files.

- [ ] **Step 3: Write failing wrapper lock tests**

Create `scripts/upstream-lock.test.mjs` using `node:test`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateLock, validateManifest } from './sync-upstream.mjs'

const commit = '4444444444444444444444444444444444444444'

test('lock and iOS manifest must match exactly', () => {
  const lock = validateLock({
    schemaVersion: 1,
    repository: 'https://gitlab.kaiweb.org/KAI/oD/KoD/kod.git',
    commit,
    releaseTrain: 'kod-2026.08.18.1',
  })
  assert.doesNotThrow(() =>
    validateManifest(lock, {
      schemaVersion: 1,
      product: 'KOD',
      platform: 'ios',
      sourceCommit: commit,
      sourceVersion: '0.0.1',
      rendererSha256: 'a'.repeat(64),
      files: [],
    })
  )
})

test('Android artifacts are rejected by the iOS wrapper', () => {
  const lock = {
    schemaVersion: 1,
    repository: 'https://gitlab.kaiweb.org/KAI/oD/KoD/kod.git',
    commit,
    releaseTrain: 'kod-2026.08.18.1',
  }
  assert.throws(() =>
    validateManifest(lock, {
      schemaVersion: 1,
      product: 'KOD',
      platform: 'android',
      sourceCommit: commit,
      sourceVersion: '0.0.1',
      rendererSha256: 'a'.repeat(64),
      files: [],
    })
  )
})
```

Run:

```powershell
node --test scripts/upstream-lock.test.mjs
```

Expected: FAIL because `sync-upstream.mjs` does not exist.

- [ ] **Step 4: Implement pinned upstream synchronization**

Create `scripts/sync-upstream.mjs`. Export `validateLock` and `validateManifest`; when executed directly it must:

1. Read `kod-upstream.lock.json`; require schema version `1`, an HTTPS repository URL, a lowercase 40-character commit, and a release train matching `kod-YYYY.MM.DD.N`.
2. Resolve `KOD_UPSTREAM_DIR` when set; otherwise clone/fetch `lock.repository` into `.kod-upstream/kod`.
3. Verify `git rev-parse HEAD` in the upstream directory equals `lock.commit`; never accept an ancestor, branch name, or abbreviated hash.
4. Run `pnpm install --frozen-lockfile` only for a cloned cache missing `node_modules`; run `pnpm mobile:bundle:ios` in the upstream.
5. Read `release/mobile/ios/www/kod-build-manifest.json` and require platform `ios`, product `KOD`, schema `1`, and exact `sourceCommit` equality.
6. Resolve wrapper target `www`; require its parent equals the wrapper root before recursively replacing it.
7. Copy the verified bundle and run `pnpm exec cap sync ios` in the wrapper.

Use platform-aware executable selection:

```js
const pnpm = process.platform === 'win32' ? 'pnpm.CMD' : 'pnpm'
```

Any subprocess failure must throw with command, exit code, stdout, and stderr. Never print environment variables.

- [ ] **Step 5: Replace package and Capacitor configuration with wrapper-only versions**

Replace `package.json` with a minimal private package containing:

```json
{
  "name": "kod-ios-wrapper",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22.12.0 <25.0.0",
    "pnpm": ">=10.17.0"
  },
  "scripts": {
    "test": "node --test scripts/upstream-lock.test.mjs",
    "sync:ios": "node scripts/sync-upstream.mjs",
    "verify:wrapper": "node scripts/verify-thin-wrapper.mjs",
    "verify:ios": "node scripts/verify-ios-release.mjs",
    "verify:ios:release": "node scripts/verify-ios-release.mjs --release"
  },
  "devDependencies": {
    "@capacitor/cli": "^7.0.0",
    "@capacitor/core": "^7.0.0",
    "@capacitor/ios": "^7.0.0",
    "typescript": "^5.8.3"
  },
  "packageManager": "pnpm@10.33.0"
}
```

Replace `capacitor.config.ts` with:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'com.kai.kod',
  appName: 'KOD',
  webDir: 'www',
  server: { iosScheme: 'https' },
}

export default config
```

Add `www/` and `.kod-upstream/` to `.gitignore`, then run `pnpm install --lockfile-only` to regenerate the minimal lockfile.

- [ ] **Step 6: Pin the canonical commit and validate native-only ownership**

After Tasks 1–4 are committed in `D:\watt\kod`, run:

```powershell
pnpm --dir D:\watt\kod parity:pin-lock -- --target D:\watt\KOD-iOS --release-train kod-2026.08.18.1
Get-Content -Raw kod-upstream.lock.json | ConvertFrom-Json | Format-List
```

Expected: the printed lock uses the full current `D:\watt\kod` commit and the fixed release train. Do not hand-edit the generated lock.

Create `scripts/verify-thin-wrapper.mjs` to fail if any of these paths exist: `src`, `test`, `.erb`, `android`, `electron.vite.config.ts`, `vite.config.web.mts`, `electron-builder.yml`. It must also require `ios/App/App.xcodeproj/project.pbxproj`, `ios/App/App/PrivacyInfo.xcprivacy`, `LICENSE`, and a valid lock.

- [ ] **Step 7: Update iOS readiness verification and CI**

Change `scripts/verify-ios-release.mjs` so it no longer reads removed renderer files. It must verify:

- deployment target `17.0` and device family `1,2`;
- KaiIdentity, SecureStorage, StoreKit, and Notification plugin registration;
- privacy manifest and associated domains;
- `www/kod-build-manifest.json` matches `kod-upstream.lock.json` after `pnpm sync:ios`;
- when `--release` is used: a 10-character uppercase/digit `APPLE_TEAM_ID`; non-empty `ASC_KEY_ID`, `ASC_ISSUER_ID`, `APP_STORE_CONNECT_API_KEY_BASE64`, `IOS_DISTRIBUTION_CERTIFICATE_BASE64`, `IOS_DISTRIBUTION_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE_BASE64`, `KOD_IDENTITY_IOS_CLIENT_ID`, and `KOD_STOREKIT_PRODUCT_IDS`; HTTPS `KOD_PRIVACY_POLICY_URL`; and `KOD_APP_STORE_GPL_APPROVED=yes`.

Update `.github/workflows/ios.yml` to run this order:

```yaml
- run: pnpm install --frozen-lockfile
- run: pnpm test
- run: pnpm sync:ios
- run: pnpm verify:wrapper
- run: pnpm verify:ios
- working-directory: ios/App
  run: pod install --repo-update
- working-directory: ios/App
  run: >-
    xcodebuild -workspace App.xcworkspace -scheme App -configuration Debug
    -sdk iphonesimulator -destination 'generic/platform=iOS Simulator'
    CODE_SIGNING_ALLOWED=NO build
```

Keep the existing manual TestFlight job and signing secret names, but replace its old shared-source commands with `pnpm sync:ios`, `pnpm verify:wrapper`, and `pnpm verify:ios:release`.

- [ ] **Step 8: Remove duplicated source only after archive verification**

Verify target and tag again:

```powershell
$root = (git rev-parse --show-toplevel).Trim()
if ((Resolve-Path $root).Path -ne (Resolve-Path 'D:\watt\KOD-iOS').Path) { throw 'wrong iOS repository' }
git rev-parse archive-ios-full-source-20260818
```

Then remove tracked shared/Electron roots from the thin-wrapper branch, retaining `ios`, wrapper scripts/configuration, docs, assets required by Xcode, license, and repository guidance. Use `git rm` only for paths confirmed by `git ls-files`, including `src`, `test`, `.erb`, `android`, Electron/Vite configs, renderer-only assets, and obsolete release scripts.

- [ ] **Step 9: Verify iOS wrapper from the local canonical checkout**

```powershell
$env:KOD_UPSTREAM_DIR = 'D:\watt\kod'
pnpm install --frozen-lockfile
pnpm test
pnpm sync:ios
pnpm verify:wrapper
pnpm verify:ios
Remove-Item Env:KOD_UPSTREAM_DIR
git status --short
```

Expected: all commands pass; `src` and `android` are absent; `www` is generated and ignored; native iOS files remain.

- [ ] **Step 10: Commit Task 5 in `KOD-iOS`**

```powershell
git add -A
git commit -m "refactor(ios): consume pinned KOD upstream"
```

---

### Task 6: Convert `kod-android` to a thin native wrapper and remove unsafe local-agent capabilities

**Files:**
- Retain: `android/` native project after policy cleanup
- Create: `kod-upstream.lock.json`
- Create: `scripts/sync-upstream.mjs`
- Create: `scripts/upstream-lock.test.mjs`
- Create: `scripts/verify-thin-wrapper.mjs`
- Create: `.github/workflows/android.yml`
- Create: `android/app/src/test/java/com/kod/app/ThinWrapperManifestTest.java`
- Modify: `android/app/src/main/AndroidManifest.xml`
- Modify: `capacitor.config.ts`
- Replace: `package.json`
- Regenerate: `pnpm-lock.yaml`
- Modify: `.gitignore`
- Remove after archive: duplicated shared/Electron source, iOS project, accessibility agent, overlay service, and their production resources

**Interfaces:**
- Consumes Task 3 command `pnpm mobile:bundle:android`.
- Produces `pnpm sync:android` and `pnpm verify:wrapper`.
- Uses the same lock schema and release train as iOS.

- [ ] **Step 1: Verify Android target and create an archive tag**

```powershell
$root = (git rev-parse --show-toplevel).Trim()
if ((Resolve-Path $root).Path -ne (Resolve-Path 'D:\watt\kod-android').Path) { throw 'wrong Android repository' }
$unexpected = git status --porcelain | Where-Object { $_ -notmatch '^\?\? (\.agents/|openspec/config\.yaml$)' }
if ($unexpected) { $unexpected; throw 'Android product-source changes must be committed before archive tagging' }
git branch archive/android-full-source-20260818
git tag archive-android-full-source-20260818
git switch -c feature/android-thin-wrapper
git show --stat archive-android-full-source-20260818
```

Expected: both archive references resolve to the current complete Android implementation.

- [ ] **Step 2: Write wrapper lock tests before the script**

Create `scripts/upstream-lock.test.mjs`:

```js
import assert from 'node:assert/strict'
import test from 'node:test'
import { validateLock, validateManifest } from './sync-upstream.mjs'

const commit = '4444444444444444444444444444444444444444'
const lock = {
  schemaVersion: 1,
  repository: 'https://gitlab.kaiweb.org/KAI/oD/KoD/kod.git',
  commit,
  releaseTrain: 'kod-2026.08.18.1',
}

test('lock and Android manifest must match exactly', () => {
  const validated = validateLock(lock)
  assert.doesNotThrow(() =>
    validateManifest(validated, {
      schemaVersion: 1,
      product: 'KOD',
      platform: 'android',
      sourceCommit: commit,
      sourceVersion: '0.0.1',
      rendererSha256: 'a'.repeat(64),
      files: [],
    })
  )
})

test('iOS artifacts are rejected by the Android wrapper', () => {
  assert.throws(() =>
    validateManifest(lock, {
      schemaVersion: 1,
      product: 'KOD',
      platform: 'ios',
      sourceCommit: commit,
      sourceVersion: '0.0.1',
      rendererSha256: 'a'.repeat(64),
      files: [],
    })
  )
})
```

Run:

```powershell
node --test scripts/upstream-lock.test.mjs
```

Expected: FAIL because `sync-upstream.mjs` does not exist.

- [ ] **Step 3: Implement Android pinned synchronization**

Create `scripts/sync-upstream.mjs`. Export `validateLock` and `validateManifest`; when executed directly it must:

1. Read `kod-upstream.lock.json`; require schema `1`, the HTTPS repository, a lowercase 40-character commit, and a valid release train.
2. Resolve `KOD_UPSTREAM_DIR` when set; otherwise clone/fetch `lock.repository` into `.kod-upstream/kod`.
3. Verify the upstream directory's exact `git rev-parse HEAD` equals `lock.commit`; do not accept an ancestor, branch, or abbreviated hash.
4. Run `pnpm install --frozen-lockfile` only for a cloned cache missing `node_modules`, then run `pnpm mobile:bundle:android` in the upstream.
5. Read `release/mobile/android/www/kod-build-manifest.json` and require platform `android`, product `KOD`, schema `1`, and exact `sourceCommit` equality.
6. Resolve wrapper target `www`; require its parent equals the wrapper root before recursively replacing it with the verified bundle.
7. Run `pnpm exec cap sync android` in the wrapper.

Use these platform constants:

```js
const platform = 'android'
const upstreamCommand = ['run', 'mobile:bundle:android']
const capacitorCommand = ['exec', 'cap', 'sync', 'android']
```

It must require manifest platform `android`, replace only the verified wrapper `www` directory, and never accept a different commit.

- [ ] **Step 4: Replace package and Capacitor configuration**

Replace `package.json` with this complete wrapper-only package:

```json
{
  "name": "kod-android-wrapper",
  "version": "0.1.0",
  "private": true,
  "engines": {
    "node": ">=22.12.0 <25.0.0",
    "pnpm": ">=10.17.0"
  },
  "scripts": {
    "test": "node --test scripts/upstream-lock.test.mjs",
    "sync:android": "node scripts/sync-upstream.mjs",
    "verify:wrapper": "node scripts/verify-thin-wrapper.mjs"
  },
  "devDependencies": {
    "@capacitor/android": "^7.0.0",
    "@capacitor/cli": "^7.0.0",
    "@capacitor/core": "^7.0.0",
    "typescript": "^5.8.3"
  },
  "packageManager": "pnpm@10.33.0"
}
```

Replace `capacitor.config.ts` with:

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const isLocalAndroidTest = process.env.KOD_ANDROID_LOCAL_TEST === '1'

const config: CapacitorConfig = {
  appId: isLocalAndroidTest ? 'com.kod.app.local' : 'com.kod.app',
  appName: isLocalAndroidTest ? 'KOD Local' : 'KOD',
  webDir: 'www',
  android: { allowMixedContent: isLocalAndroidTest },
  server: {
    androidScheme: isLocalAndroidTest ? 'http' : 'https',
    cleartext: isLocalAndroidTest,
  },
}

export default config
```

Ignore `www/` and `.kod-upstream/`, and regenerate the lockfile with `pnpm install --lockfile-only`.

- [ ] **Step 5: Pin the exact same canonical release train**

Generate the Android lock with the canonical pinning CLI, then confirm equality before continuing:

```powershell
pnpm --dir D:\watt\kod parity:pin-lock -- --target D:\watt\kod-android --release-train kod-2026.08.18.1
$iosLock = Get-Content -Raw D:\watt\KOD-iOS\kod-upstream.lock.json | ConvertFrom-Json
$androidLock = Get-Content -Raw kod-upstream.lock.json | ConvertFrom-Json
if ($iosLock.repository -ne $androidLock.repository -or $iosLock.commit -ne $androidLock.commit -or $iosLock.releaseTrain -ne $androidLock.releaseTrain) {
  throw 'mobile locks differ'
}
```

- [ ] **Step 6: Add a failing native security regression test**

Create `android/app/src/test/java/com/kod/app/ThinWrapperManifestTest.java`:

```java
package com.kod.app;

import static org.junit.Assert.assertFalse;

import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.Test;

public class ThinWrapperManifestTest {
    @Test
    public void productionManifestDoesNotExposeAccessibilityOrOverlayAgent() throws Exception {
        String manifest = Files.readString(Path.of("src/main/AndroidManifest.xml"));
        assertFalse(manifest.contains("android.permission.SYSTEM_ALERT_WINDOW"));
        assertFalse(manifest.contains("android.accessibilityservice.AccessibilityService"));
        assertFalse(manifest.contains("KodAccessibilityService"));
        assertFalse(manifest.contains("SuanbaoOverlayService"));
        assertFalse(manifest.contains("AndroidAgentPlugin"));
    }
}
```

Run from `android`:

```powershell
.\gradlew.bat testDebugUnitTest --tests com.kod.app.ThinWrapperManifestTest
```

Expected: FAIL while the current accessibility/overlay declarations exist.

- [ ] **Step 7: Remove local-agent and overlay production capabilities**

After confirming `archive-android-full-source-20260818` resolves, remove from the thin-wrapper branch:

- `android/app/src/main/java/com/kod/app/agent/`;
- agent-only tests under `android/app/src/test/java/com/kod/app/agent/`;
- accessibility service and overlay service declarations;
- `SYSTEM_ALERT_WINDOW`, accessibility metadata, and agent-only file-provider paths;
- `kod_accessibility_service.xml` and agent-only overlay drawables.

Keep ordinary Capacitor file sharing, app notifications, launcher assets, `MainActivity.java`, and release signing configuration. Run the focused native test again and require PASS.

- [ ] **Step 8: Add wrapper ownership verification and remove duplicate business source**

Create `scripts/verify-thin-wrapper.mjs` to fail if `src`, `test`, `.erb`, `ios`, Electron/Vite configs, or renderer build roots exist. Require `android/app/build.gradle`, `android/app/src/main/AndroidManifest.xml`, `LICENSE`, and a valid lock.

Verify the archive tag and absolute repository path, then use `git rm` for tracked duplicate shared/Electron roots. Do not remove `android/`.

- [ ] **Step 9: Add Android wrapper CI**

Create `.github/workflows/android.yml`:

```yaml
name: Android Wrapper

on:
  push:
    branches: [feature/android-thin-wrapper, main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  debug:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22.23.2
          cache: pnpm
      - uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '21'
          cache: gradle
      - run: pnpm install --frozen-lockfile
      - run: pnpm test
      - run: pnpm sync:android
      - run: pnpm verify:wrapper
      - working-directory: android
        run: ./gradlew testDebugUnitTest assembleDebug
```

- [ ] **Step 10: Verify and commit Task 6 in `kod-android`**

```powershell
$env:KOD_UPSTREAM_DIR = 'D:\watt\kod'
pnpm install --frozen-lockfile
pnpm test
pnpm sync:android
pnpm verify:wrapper
Push-Location android
.\gradlew.bat testDebugUnitTest assembleDebug
Pop-Location
Remove-Item Env:KOD_UPSTREAM_DIR
git status --short
git add -A
git commit -m "refactor(android): consume pinned KOD upstream"
```

Expected: no duplicate `src`; no accessibility/overlay service; debug APK builds from the pinned canonical web bundle.

---

### Task 7: Remove native-release ownership from the canonical repository

**Files:**
- Create: `scripts/platform-release/native-ownership.test.ts`
- Modify: `package.json`
- Modify: `capacitor.config.ts`
- Remove after Android wrapper verification: `android/`
- Remove obsolete canonical native-sync scripts while retaining mobile web-bundle scripts

**Interfaces:**
- Enforces that canonical `kod` owns shared TypeScript/mobile web code but no iOS/Android native release directory.
- Preserves Task 3 bundle commands as the only canonical mobile release output.

- [ ] **Step 1: Write a failing native ownership test**

Create `scripts/platform-release/native-ownership.test.ts`:

```ts
import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

describe('canonical native ownership', () => {
  it('keeps native projects in release repositories only', () => {
    expect(existsSync('ios')).toBe(false)
    expect(existsSync('android')).toBe(false)
  })

  it('builds mobile web bundles without cap sync', () => {
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
    expect(pkg.scripts['mobile:bundle:ios']).toContain('mobile:web:ios')
    expect(pkg.scripts['mobile:bundle:android']).toContain('mobile:web:android')
    expect(pkg.scripts['mobile:bundle:ios']).not.toContain('cap sync')
    expect(pkg.scripts['mobile:bundle:android']).not.toContain('cap sync')
  })
})
```

- [ ] **Step 2: Run the test and verify red**

```powershell
pnpm exec vitest run scripts/platform-release/native-ownership.test.ts
```

Expected: FAIL because canonical `android/` still exists.

- [ ] **Step 3: Prove the Android wrapper contains the native project and archive is recoverable**

```powershell
git -C D:\watt\kod-android rev-parse archive-android-full-source-20260818
if (-not (Test-Path D:\watt\kod-android\android\app\build.gradle)) { throw 'Android wrapper missing native project' }
$wrapperLock = Get-Content -Raw D:\watt\kod-android\kod-upstream.lock.json | ConvertFrom-Json
$canonicalCommit = (git rev-parse HEAD).Trim()
if ($wrapperLock.commit -ne $canonicalCommit) { throw 'Android wrapper is not pinned to current canonical commit' }
```

Expected: all checks pass before canonical removal.

- [ ] **Step 4: Remove canonical native directory and obsolete native-sync commands**

Verify the exact target:

```powershell
$target = (Resolve-Path .\android).Path
$expected = Join-Path (git rev-parse --show-toplevel).Trim() 'android'
if ($target -ne $expected) { throw 'unexpected canonical Android target' }
```

Use `git rm -r -- android`. Remove `mobile:sync`, `mobile:sync:ios`, `mobile:sync:android`, `mobile:ios`, `mobile:android`, and `mobile:assets` from canonical `package.json`; keep `mobile:web:*` and `mobile:bundle:*`. Keep `capacitor.config.ts` only as shared build metadata, without native-specific local-test server settings that belong to the Android wrapper.

- [ ] **Step 5: Run ownership, type, and bundle regression**

```powershell
pnpm exec vitest run scripts/platform-release/native-ownership.test.ts scripts/platform-release/build-mobile-bundle.test.ts
pnpm check
pnpm mobile:bundle:ios
pnpm mobile:bundle:android
```

Expected: PASS; canonical repository emits platform bundles without an `ios/` or `android/` project.

- [ ] **Step 6: Commit Task 7**

```powershell
git add -A -- android package.json capacitor.config.ts scripts/platform-release/native-ownership.test.ts
git commit -m "refactor(platform): move native ownership to release wrappers"
```

---

### Task 8: Add cross-repository CI gates and final source-unification evidence

**Files:**
- Create: `.github/workflows/platform-parity.yml`
- Create: `docs/platform-parity/source-unification-report.md`
- Modify: `package.json`

**Interfaces:**
- Produces `pnpm parity:check` as the canonical local/CI gate.
- Produces a release-train job that checks out both wrappers and rejects different locks or a lock not matching the immutable canonical release tag.
- Uses Git tag `kod-2026.08.18.1` as the immutable canonical source boundary, avoiding a cyclic dependency between wrapper lock commits and the later evidence-report commit.
- Produces a dated evidence report without claiming that later feature phases are complete.

- [ ] **Step 1: Add the aggregate parity command**

Add to `package.json`:

```json
"parity:check": "pnpm parity:catalog:check && pnpm exec vitest run src/shared/feature-catalog.test.ts scripts/platform-release/mobile-delta-inventory.test.ts scripts/platform-release/build-mobile-bundle.test.ts scripts/platform-release/upstream-lock.test.ts scripts/platform-release/native-ownership.test.ts"
```

Run `pnpm parity:check` and require PASS.

- [ ] **Step 2: Add canonical source and bundle CI**

Create `.github/workflows/platform-parity.yml` with a `source` job:

```yaml
name: Platform Parity

on:
  push:
    branches: [suanlizhongxin_KOD, main]
  pull_request:
  workflow_dispatch:

permissions:
  contents: read

jobs:
  source:
    runs-on: ubuntu-latest
    timeout-minutes: 60
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: pnpm/action-setup@v4
        with:
          version: 10.33.0
          run_install: false
      - uses: actions/setup-node@v4
        with:
          node-version: 22.23.2
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm check
      - run: pnpm parity:check
      - run: pnpm mobile:bundle:ios
      - run: pnpm mobile:bundle:android
```

The bundle command's clean-tree rule must ignore the generated bundle directory through `.gitignore`; it must still fail if tracked source is dirty.

- [ ] **Step 3: Add a release-train lock job**

Add a `release-train` job enabled only for `workflow_dispatch`. It must:

1. Check out canonical source into `kod`.
2. Check out `${{ vars.KOD_IOS_REPOSITORY }}` into `KOD-iOS` using `${{ secrets.KOD_RELEASE_READ_TOKEN }}`.
3. Check out `${{ vars.KOD_ANDROID_REPOSITORY }}` into `kod-android` using the same read token.
4. Use `fetch-depth: 0` for the canonical checkout so the release tag is available.
5. Run `pnpm --dir kod install --frozen-lockfile`.
6. Run from `kod`:

```yaml
- working-directory: kod
  run: pnpm parity:locks -- --ios-root ../KOD-iOS --android-root ../kod-android
```

Missing repository variables or token are external release configuration failures and must fail the manual release-train job; they do not weaken the source job.

- [ ] **Step 4: Commit the canonical release source and create its immutable tag**

Run the canonical checks before committing:

```powershell
pnpm check
pnpm parity:check
pnpm test
git diff --check
git add package.json .github/workflows/platform-parity.yml
git commit -m "ci(platform): enforce single-source release parity"
git show-ref --verify --quiet refs/tags/kod-2026.08.18.1
if ($LASTEXITCODE -eq 0) { throw 'release tag already exists' }
if ($LASTEXITCODE -ne 1) { throw 'release tag lookup failed' }
git tag -a kod-2026.08.18.1 -m "KOD source-unification release train 2026.08.18.1"
git rev-parse HEAD
git rev-parse 'refs/tags/kod-2026.08.18.1^{commit}'
```

Expected: both printed commits are identical. Do not move or recreate this tag; create a new release-train suffix for any later source change.

- [ ] **Step 5: Re-pin and commit both wrappers to the tagged canonical source**

Run from `D:\watt\kod`:

```powershell
pnpm parity:pin-lock -- --target ..\KOD-iOS --release-train kod-2026.08.18.1
pnpm parity:pin-lock -- --target ..\kod-android --release-train kod-2026.08.18.1
git -C ..\KOD-iOS add kod-upstream.lock.json
git -C ..\KOD-iOS commit -m "build(ios): pin KOD release train 2026.08.18.1"
git -C ..\kod-android add kod-upstream.lock.json
git -C ..\kod-android commit -m "build(android): pin KOD release train 2026.08.18.1"
pnpm parity:locks -- --ios-root ..\KOD-iOS --android-root ..\kod-android
```

Expected: the lock verifier resolves `refs/tags/kod-2026.08.18.1^{commit}` and both wrapper locks match it exactly.

- [ ] **Step 6: Execute the complete local three-repository gate**

Run from `D:\watt\kod`:

```powershell
pnpm check
pnpm parity:check
pnpm test
pnpm mobile:bundle:ios
pnpm mobile:bundle:android
pnpm parity:locks -- --ios-root ..\KOD-iOS --android-root ..\kod-android

$env:KOD_UPSTREAM_DIR = 'D:\watt\kod'
pnpm --dir ..\KOD-iOS test
pnpm --dir ..\KOD-iOS sync:ios
pnpm --dir ..\KOD-iOS verify:wrapper
pnpm --dir ..\KOD-iOS verify:ios
pnpm --dir ..\kod-android test
pnpm --dir ..\kod-android sync:android
pnpm --dir ..\kod-android verify:wrapper
Push-Location ..\kod-android\android
.\gradlew.bat testDebugUnitTest assembleDebug
Pop-Location
Remove-Item Env:KOD_UPSTREAM_DIR
```

On macOS CI, additionally require the iOS simulator build from Task 5. Do not mark TestFlight upload complete without an Apple team and signing material.

- [ ] **Step 7: Write the evidence report from actual command results**

Create `docs/platform-parity/source-unification-report.md` containing:

- the canonical release-tag commit and final iOS/Android wrapper commit hashes;
- the shared `releaseTrain` and pinned canonical commit;
- counts from `mobile-source-deltas.json` grouped by source and domain;
- exact commands run and their exit codes;
- Android APK absolute path and SHA-256 when generated;
- iOS simulator CI run URL when available;
- external blockers limited to Apple team/signing/TestFlight upload configuration;
- a statement that feature catalog entries remain `in-progress` until later subprojects add platform E2E evidence.

Do not write success text before the corresponding command has passed.

- [ ] **Step 8: Commit evidence, then perform the final diff and secret review**

Commit only the evidence document after all recorded checks have passed:

```powershell
git add docs/platform-parity/source-unification-report.md
git commit -m "docs(platform): record source-unification evidence"
```

The evidence commit intentionally follows the immutable release tag. Prove that no product/build input changed after the tag and that locks still resolve:

```powershell
git diff --check
git status --short
git diff --exit-code kod-2026.08.18.1..HEAD -- src scripts package.json pnpm-lock.yaml electron.vite.config.ts capacitor.config.ts
pnpm parity:locks -- --ios-root ..\KOD-iOS --android-root ..\kod-android
rg -n --pcre2 --hidden --glob '!node_modules/**' --glob '!release/**' '(BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|(?:APP_STORE_CONNECT_API_KEY_BASE64|IOS_DISTRIBUTION_CERTIFICATE_BASE64|password)\h*[:=]\h*(?![$<{])\S+)' .
git -C ..\KOD-iOS status --short
git -C ..\kod-android status --short
```

Expected: no whitespace errors, no real secret matches, and only intentional changes/ignored generated assets.

## Completion Criteria

This subproject is complete only when all statements below are true:

- `kod` contains all shared business source and no native `ios/` or `android/` release project.
- `KOD-iOS` contains the native iOS project but no `src`, Electron runtime, Android project, or duplicated business UI.
- `kod-android` contains the native Android project but no `src`, Electron runtime, iOS project, accessibility agent, or overlay service.
- Both wrappers pin the same full canonical commit and release-train ID, and that commit equals `refs/tags/kod-2026.08.18.1^{commit}`.
- Both wrappers reject a bundle for the wrong platform or commit.
- The canonical feature catalog covers all approved formal user domains and contains no unsupported `verified` claim.
- Canonical type checks, parity tests, iOS/Android web bundles, Android native tests/build, and iOS simulator CI pass.
- Existing mobile work is recoverable through the two archive tags.
- The evidence report explicitly distinguishes completed source unification from later identity/sync, cloud execution, commerce, and TestFlight work.
