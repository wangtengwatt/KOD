# 阶段五：隔离验收、真实手机、部署与 APK 发布

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** 在不触碰生产真实资金的条件下完成端到端业务验收，把同步和云任务后端部署到服务器，并交付可在真实 Android 手机上直接连接 `https://kod.kai.com` 的 Debug 与签名 Release APK。

**Architecture:** staging 使用独立数据库、对象存储桶、worker 队列和模拟支付；生产部署先做数据库向前兼容迁移，再灰度启用能力开关；Android 构建按 localtest/staging/production 三环境分离并由流水线生成校验清单。

**Tech Stack:** Docker Compose、Spring Boot profiles、MySQL、S3 兼容存储、JUnit、Vitest、Playwright/Android instrumentation、Gradle、GitLab CI、GitHub Actions。

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

---

## Task 1：建立完全隔离的 staging 环境

**Backend files (`D:\watt\kod-ai-portal`):**

- Create: `docker-compose.staging.yml`
- Create: `backend/src/main/resources/application-staging.yml`
- Create: `backend/src/main/java/com/kod/config/StagingSeedInitializer.java`
- Create: `backend/src/test/java/com/kod/config/StagingIsolationTest.java`
- Create: `docs/operations/staging-environment.md`

**Steps:**

1. 写失败测试：staging profile 若数据库主机、schema、对象存储 bucket、支付回调或 worker namespace 与 production 相同则启动失败。
2. Run: `./mvnw -Dtest=StagingIsolationTest test`
   Expected: FAIL，隔离校验不存在。
3. Compose 启动独立 MySQL、S3 兼容存储和 worker；seed 创建购买方、已认证供应方、管理员 A、管理员 B 和模拟资金/卡时，不使用生产邮箱和真实证件。
4. 模拟支付只接受测试签名且仅修改 staging 模拟账本；生产 profile 明确禁用 seed 和模拟回调。
5. Run: `docker compose -f docker-compose.staging.yml config` and `./mvnw -Dtest=StagingIsolationTest test`
   Expected: PASS。
6. Commit: `git commit -m "test(env): add isolated KOD staging stack"`

## Task 2：端到端业务场景自动化

**Backend files:**

- Create: `backend/src/test/java/com/kod/e2e/BuyerSupplierMarketplaceE2ETest.java`
- Create: `backend/src/test/java/com/kod/e2e/TokenPackageProxyE2ETest.java`
- Create: `backend/src/test/java/com/kod/e2e/AdminReviewE2ETest.java`

**Client files (`D:\watt\kod`):**

- Create: `e2e/android/account-and-sync.spec.ts`
- Create: `e2e/android/compute-marketplace.spec.ts`
- Create: `e2e/android/offline-and-permissions.spec.ts`
- Create: `e2e/fixtures/staging-users.ts`

**Steps:**

1. 先写失败 E2E：注册/登录、角色同步、实名、供应方、设备、商品图片、购买、人民币补差、买方公钥、商家交付、确认/24 小时结算、争议、收益、提现申请、另一管理员审核。
2. Token 场景验证指定模型、输入输出扣减、最后一次完整返回、下次拒绝和 key 重新验证复制。
3. 内容场景验证 Windows/Android 同步、冲突副本、媒体续传、知识库、MCP/技能云任务、30 天回收站。
4. 离线场景验证缓存/草稿可用，资金和调用被明确阻止；拒绝蒜宝权限后核心功能正常。
5. Run: `./mvnw -Dtest='*E2ETest' test` and `pnpm exec playwright test e2e/android`
   Expected: 首次因未完成功能失败；修复必须回到对应前置阶段计划，不在 E2E 内加绕过。
6. 全部通过后提交 backend: `git commit -m "test(e2e): cover KOD marketplace lifecycles"`; client: `git commit -m "test(e2e): verify Android client parity"`。

## Task 3：Android 版本矩阵和真实手机测试

**Client files:**

- Create: `android/app/src/androidTest/java/com/kod/app/NavigationSmokeTest.kt`
- Create: `android/app/src/androidTest/java/com/kod/app/AccountParityTest.kt`
- Create: `android/app/src/androidTest/java/com/kod/app/PermissionDegradeTest.kt`
- Create: `scripts/run-android-device-matrix.ps1`
- Create: `docs/testing/android-device-matrix.md`

**Steps:**

1. 写 instrumentation 测试：默认简体中文、KOD 大写、五栏导航、唯一零售站/节点选择器、账号切换/退出、角色/资产一致、充值浏览器返回刷新、权限拒绝降级。
2. 在 Android 8、12、15 模拟器运行，记录系统版本、分辨率、测试结果和截图路径。
3. 在至少一台真实手机安装 staging Debug APK，完成相同场景；生产域名只做登录、资产读取、内容读取和受控模型烟测，不自动扣真实资金。
4. Run: `./gradlew connectedDebugAndroidTest` for each target。
   Expected: PASS，无崩溃、无横向溢出、键盘不遮挡主要提交按钮。
5. Commit: `git commit -m "test(android): add device parity matrix"`

## Task 4：生产后端灰度部署与回滚

**Backend files:**

- Create: `docs/operations/android-parity-production-rollout.md`
- Create: `backend/src/main/java/com/kod/controller/CapabilityController.java`
- Create: `backend/src/test/java/com/kod/controller/CapabilityControllerTest.java`
- Modify: `backend/src/main/resources/application-prod.yml`

**Produced endpoint:** `GET /api/capabilities` 返回版本化能力开关，不包含机密配置。

**Steps:**

1. 写失败测试：未部署能力为 false；客户端版本低于最小版本时返回升级要求；响应不含数据库、bucket、worker 或密钥信息。
2. Run: `./mvnw -Dtest=CapabilityControllerTest test`
   Expected: FAIL。
3. 实现能力清单和灰度开关：sync、secretReveal、resumableMedia、cloudSandbox、mobileComputeAdmin 分别开启；客户端按清单隐藏未部署入口但不崩溃。
4. 部署顺序写入 runbook：备份、向前兼容迁移、只读健康检查、5% 灰度、指标观察、全量；回滚只关能力开关和旧应用版本，不回滚已写数据结构。
5. Run 全部 backend tests and production config validation，Expected: PASS。
6. Commit: `git commit -m "ops: add capability-gated production rollout"`

## Task 5：生产 Android 构建、签名和下载交付

**Client files:**

- Modify: `android/app/build.gradle`
- Create: `android/keystore.properties.example`
- Create: `scripts/build-android-release.ps1`
- Create: `scripts/generate-android-release-manifest.ts`
- Create: `scripts/generate-android-release-manifest.test.ts`
- Create: `docs/releases/android-release-checklist.md`
- Modify: `.gitlab-ci.yml`
- Modify: `.github/workflows/platform-parity.yml`

**Produced artifact manifest:**

```json
{
  "version": "0.1.0",
  "packageId": "com.kod.app",
  "environment": "production",
  "apiOrigin": "https://kod.kai.com",
  "sha256": "...",
  "gitCommit": "..."
}
```

**Steps:**

1. 写失败测试：manifest 缺 SHA-256、包名错误、production 指向本地地址、APK 未签名或提交哈希不一致时失败。
2. Run: `pnpm exec vitest run scripts/generate-android-release-manifest.test.ts`
   Expected: FAIL。
3. Gradle 建立 `localtest/staging/production` product flavors；签名材料只从 CI secret/本机安全文件读取，仓库只提交 example。
4. 脚本依次运行清单校验、TypeScript 检查、单元测试、Capacitor sync、Gradle assemble/bundle、签名验证、SHA-256 和 manifest 生成。
5. 先交付可安装 staging/production Debug APK 给用户验收；正式上线前生成签名 Release APK/AAB。
6. 网站 Android 下载按钮指向版本化 APK 资源；服务器返回正确 `application/vnd.android.package-archive` 和 `Content-Disposition`，下载页显示版本、大小和 SHA-256。
7. Run: `powershell -File scripts/build-android-release.ps1 -Environment production`
   Expected: PASS，并输出 APK、AAB、manifest 和校验值的绝对路径。
8. Commit: `git commit -m "release(android): automate signed production artifacts"`

## Task 6：最终对照审计和发布证据

**Files:**

- Modify: `docs/android-feature-parity.json`
- Create: `docs/releases/android-full-parity-report.md`
- Create: `scripts/audit-android-parity.ts`
- Create: `scripts/audit-android-parity.test.ts`

**Steps:**

1. 写失败测试：清单存在未映射入口、缺测试证据、后端能力未部署、生产包地址错误、APK 哈希不匹配任一情况时审计失败。
2. Run: `pnpm exec vitest run scripts/audit-android-parity.test.ts`
   Expected: FAIL。
3. 实现审计器并生成报告：逐功能列 Windows 入口、Android 入口、实现方式、API、测试、真实手机结果和已知非阻断差异。
4. Run: `pnpm run check:platform-parity && pnpm run check && pnpm run test && pnpm exec tsx scripts/audit-android-parity.ts`
   Expected: PASS，报告无未实现或占位项。
5. 使用 `superpowers:verification-before-completion` 重新运行报告中全部关键命令，保存原始结果后才能声明完成。
6. Commit: `git commit -m "docs: publish Android full parity evidence"`

## 最终交付

- 可直接安装的 Debug APK、签名 Release APK/AAB、SHA-256、版本、包名、环境和提交哈希。
- GitLab 与 GitHub 同名分支提交一致，并附流水线结果。
- staging 全流程测试报告、真实手机测试矩阵、生产只读烟测记录。
- 功能对照清单无缺失项；所有平台共用同一账号、同一后端数据和同一业务规则。
- 明确事实：若生产同步/云任务接口尚未部署，APK 本身无法实现完整跨设备和云执行能力，因此不能把“APK 能打开页面”当作项目完成。
