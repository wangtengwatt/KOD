# 阶段一：唯一功能源、能力清单与平台基础

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** 把 `suanlizhongxin_KOD` 建成 Windows/Web/Android 的唯一功能源，并让 CI 能阻止任何只有桌面实现、没有 Android 映射的新增能力。

**Architecture:** 用机器可读能力清单描述产品能力到共享、原生或云端实现的映射；通过统一 `PlatformCapabilities` 契约消除页面对 Electron/Capacitor 的直接判断；从现有 Android 分支迁移移动外壳和原生适配，但不迁移第二套业务逻辑。

**Tech Stack:** TypeScript、React、Vitest、Capacitor、Gradle、PowerShell、GitLab CI、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

---

## Task 1：建立机器可读功能对照表

**Files:**

- Create: `src/shared/platform-capabilities.ts`
- Create: `src/shared/platform-capabilities.test.ts`
- Create: `docs/android-feature-parity.json`
- Create: `scripts/check-platform-parity.ts`
- Modify: `package.json`

**Produced interfaces:**

```ts
export type PlatformFeatureId =
  | 'account.session'
  | 'chat.relayNodeSelector'
  | 'chat.historySync'
  | 'image.generation'
  | 'video.generation'
  | 'knowledgeBase'
  | 'mcp'
  | 'skills'
  | 'taskSandbox'
  | 'wallet'
  | 'computeCenter'
  | 'computeAdmin'

export type FeatureImplementation = 'shared' | 'native' | 'cloud'

export interface PlatformFeatureMapping {
  id: PlatformFeatureId
  windows: FeatureImplementation
  android: FeatureImplementation
  entrypoints: string[]
  tests: string[]
}
```

**Steps:**

1. 在 `platform-capabilities.test.ts` 写失败测试：重复 ID、Android 映射缺失、入口文件不存在、测试数组为空时校验失败。
2. Run: `pnpm exec vitest run src/shared/platform-capabilities.test.ts`
   Expected: FAIL，提示清单读取或校验函数不存在。
3. 写最小 `validateFeatureParity()` 与 JSON 解析器，首批清单覆盖规格第 3.1 节的全部模块，不允许 `placeholder` 状态。
4. 在 `scripts/check-platform-parity.ts` 调用校验器并以非零状态退出；在 `package.json` 增加 `check:platform-parity`。
5. Run: `pnpm exec vitest run src/shared/platform-capabilities.test.ts && pnpm run check:platform-parity`
   Expected: PASS。
6. Commit: `git commit -m "build: enforce Android feature parity manifest"`

## Task 2：统一平台能力契约

**Files:**

- Modify: `src/renderer/platform/interfaces.ts`
- Modify: `src/renderer/platform/desktop_platform.ts`
- Modify: `src/renderer/platform/mobile_platform.ts`
- Modify: `src/renderer/platform/web_platform.ts`
- Modify: `src/renderer/platform/test_platform.ts`
- Create: `src/renderer/platform/platform-capabilities.test.ts`

**Produced interfaces:**

```ts
export interface PlatformCapabilities {
  runtime: 'desktop' | 'android' | 'web' | 'test'
  localFiles: boolean
  mobilePermissions: boolean
  localSandbox: boolean
  cloudSandbox: boolean
  sqlite: boolean
  externalBrowser: boolean
}

export interface Platform {
  getCapabilities(): Promise<PlatformCapabilities>
}
```

**Steps:**

1. 写契约测试，实例化四个平台并断言完整能力键；Android 必须是 `cloudSandbox=true`、`localSandbox=false`，Desktop 相反。
2. Run: `pnpm exec vitest run src/renderer/platform/platform-capabilities.test.ts`
   Expected: FAIL，`getCapabilities` 不存在。
3. 在接口和四个平台实现只读能力对象；共享页面只能读取该对象，不得继续新增 `window.electron`、`Capacitor.isNativePlatform()` 分支。
4. 用 `rg -n "window\.electron|Capacitor\.isNativePlatform" src/renderer/routes src/renderer/components` 列出已有直接判断，迁移到能力契约；平台实现目录内的判断可保留。
5. Run: `pnpm exec vitest run src/renderer/platform/platform-capabilities.test.ts && pnpm run check`
   Expected: PASS。
6. Commit: `git commit -m "refactor: expose shared platform capability contract"`

## Task 3：把现有 Android 外壳迁入唯一功能源

**Files:**

- Create or merge: `android/**`
- Modify: `capacitor.config.ts`
- Modify: `src/renderer/router.tsx`
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `src/renderer/setup/mobile_safe_area.ts`
- Create: `src/renderer/routes/-mobile-route-contract.test.tsx`
- Create: `src/renderer/components/mobile/MobileBottomNavigation.test.tsx`
- Source reference only: `D:\watt\kod-android\android/**`
- Source reference only: `D:\watt\kod-android\src\renderer/**`

**Steps:**

1. 写失败测试固定移动端五个一级入口：对话、生图、视频、算力、我的；断言对话页只有输入框上方一组零售站/节点选择器。
2. Run: `pnpm exec vitest run src/renderer/routes/-mobile-route-contract.test.tsx src/renderer/components/mobile/MobileBottomNavigation.test.tsx`
   Expected: FAIL，移动路由或单一选择器契约未满足。
3. 对比 `kod-android` 已完成适配，迁移 Android 工程、安全区、原生启动、底部导航、简体中文默认值、账号切换和退出；业务调用必须改为引用当前仓库共享 store/API，不复制旧业务文件。
4. 包名保留两套：本地测试 `com.kod.app.localtest`，生产 `com.kod.app`；启动页必须显示对应环境，生产包不得包含 `10.0.2.2`。
5. Run: `pnpm exec vitest run src/renderer/routes/-mobile-route-contract.test.tsx src/renderer/components/mobile/MobileBottomNavigation.test.tsx && pnpm run mobile:sync:android`
   Expected: PASS，Capacitor 同步成功。
6. Commit: `git commit -m "feat(android): migrate mobile shell into canonical source"`

## Task 4：统一身份状态与服务地址

**Files:**

- Modify: `src/renderer/packages/remote.ts`
- Create: `src/renderer/packages/session/AccountSessionService.ts`
- Create: `src/renderer/packages/session/AccountSessionService.test.ts`
- Modify: `src/renderer/routes/settings/provider/chatbox-ai/-components/useAuthTokens.ts`
- Modify: `src/renderer/routes/compute-center.tsx`
- Modify: `src/renderer/routes/__root.tsx`
- Modify: `.env.production`
- Modify: `.env.localtest`

**Produced interface:**

```ts
export interface AccountSnapshot {
  userId: number
  email: string
  roles: string[]
  accessTokenExpiresAt: number
}
```

**Steps:**

1. 写失败测试：模型设置登录后“我的”和算力中心必须显示同一邮箱/角色；401 只刷新一次，刷新失败后所有页面统一退出。
2. Run: `pnpm exec vitest run src/renderer/packages/session/AccountSessionService.test.ts`
   Expected: FAIL，当前认证状态分散。
3. 实现单例会话服务，登录、续期、切换账号、退出和角色刷新都经由该服务；移除页面各自维护的“已登录”布尔值。
4. 生产地址只从构建环境得到 `https://kod.kai.com`；本地测试才允许 `http://10.0.2.2:8080`。启动时校验生产构建没有 localhost、10.0.2.2 或明文 HTTP。
5. Run: `pnpm exec vitest run src/renderer/packages/session/AccountSessionService.test.ts && pnpm run check`
   Expected: PASS。
6. Commit: `git commit -m "fix(auth): share one account session across platforms"`

## Task 5：建立双平台 CI 阻断

**Files:**

- Create: `.github/workflows/platform-parity.yml`
- Create: `.gitlab-ci.yml`
- Create: `scripts/verify-production-endpoints.ts`
- Create: `scripts/verify-android-build.ps1`
- Modify: `package.json`

**Steps:**

1. 写 `verify-production-endpoints` 的失败夹具测试，输入含 localhost、10.0.2.2、HTTP 钱包地址的生产 bundle 时必须失败。
2. Run: `pnpm exec vitest run scripts/verify-production-endpoints.test.ts`
   Expected: FAIL，验证器不存在。
3. 实现验证脚本，并让 GitHub/GitLab 顺序执行：`pnpm install --frozen-lockfile`、`pnpm run check:platform-parity`、`pnpm run check`、`pnpm run test`、Windows renderer build、Capacitor sync、Android Debug build、生产地址扫描。
4. `verify-android-build.ps1` 输出 APK 路径、包名、版本和 SHA-256；发现环境不一致时退出非零。
5. Run: `pnpm run check:platform-parity && pnpm run check && pnpm run test && pnpm run mobile:sync:android`
   Expected: PASS；随后在 `android` 目录运行 `./gradlew assembleDebug` 成功。
6. Commit: `git commit -m "ci: gate releases on desktop and Android parity"`

## 阶段验收

- `kod-android` 不再新增独立业务功能；新能力只进入 `suanlizhongxin_KOD`。
- CI 能通过故意删除一个 Android 能力映射的测试证明阻断有效，然后恢复清单使流水线通过。
- 同一账号在设置、我的、算力中心显示相同邮箱、角色和登录状态。
- Android Debug 构建成功，生产配置扫描证明不包含本地服务地址。
