# 阶段三：对话、媒体、知识、MCP、技能与云任务

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** 让 Windows 和 Android 共享对话、图片、视频、设置、知识库和任务结果，并通过隔离云任务为 Android 提供 MCP、技能和任务沙箱能力。

**Architecture:** 现有 store 保持本地优先响应，在持久化成功后投递同步 mutation；媒体内容以 objectId 引用；Android 的沙箱接口由 `MobileCloudSandboxController` 映射到现有 `/api/cloud-sandbox`，页面只依赖统一 Platform 接口。

**Tech Stack:** React、Zustand、Vitest、SSE、Capacitor、Spring Boot、JUnit、隔离 worker。

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

---

## Task 1：为各内容类型建立同步适配器

**Client files:**

- Create: `src/renderer/packages/sync/adapters/SessionSyncAdapter.ts`
- Create: `src/renderer/packages/sync/adapters/TaskSyncAdapter.ts`
- Create: `src/renderer/packages/sync/adapters/ImageSyncAdapter.ts`
- Create: `src/renderer/packages/sync/adapters/VideoSyncAdapter.ts`
- Create: `src/renderer/packages/sync/adapters/SettingsSyncAdapter.ts`
- Create: `src/renderer/packages/sync/adapters/adapter-contract.test.ts`
- Modify: `src/renderer/packages/sync/types.ts`

**Produced interface:**

```ts
export interface SyncAdapter<Local, Remote> {
  entityType: SyncEntityType
  toRemote(local: Local): Promise<Remote>
  applyRemote(remote: Remote): Promise<void>
  createConflictCopy(local: Local, remote: Remote): Promise<Local>
}
```

**Steps:**

1. 写参数化失败测试：所有适配器往返不丢 ID、排序、模型、附件引用和更新时间；冲突副本名称包含设备与时间；敏感设置只序列化 secretRef。
2. Run: `pnpm exec vitest run src/renderer/packages/sync/adapters/adapter-contract.test.ts`
   Expected: FAIL。
3. 实现五类适配器，明确 schemaVersion；读取旧版本时迁移，未知未来版本保留原始 payload 并提示升级，不崩溃。
4. Run 同一测试，Expected: PASS。
5. Commit: `git commit -m "feat(sync): map client content to versioned records"`

## Task 2：把对话、任务和设置接入写穿同步

**Client files:**

- Modify: `src/renderer/stores/session/crud.ts`
- Modify: `src/renderer/stores/session/messages.ts`
- Modify: `src/renderer/storage/TaskSessionStorage.ts`
- Modify: `src/renderer/stores/settingsStore.ts`
- Modify: `src/renderer/packages/mcp/controller.ts`
- Modify: `src/renderer/packages/skills/controller.ts`
- Create: `src/renderer/stores/content-sync-integration.test.ts`

**Steps:**

1. 写失败测试：本地创建/更新/删除先落本地再 enqueue；远程 apply 不产生回声 mutation；零售站、节点、模型、MCP 和技能设置跟随账号，不跨账号污染。
2. Run: `pnpm exec vitest run src/renderer/stores/content-sync-integration.test.ts`
   Expected: FAIL。
3. 在 storage 成功后的唯一提交点调用 SyncEngine；为远程应用增加 scoped suppression token，不使用全局永久开关。
4. 设置拆分公开配置和 secretRef；退出账号清理内存密钥与当前选择，保留该账号加密本地缓存。
5. Run 测试与 `pnpm exec vitest run src/renderer/stores/sessionActions.test.ts src/renderer/stores/session/tools-builder.test.ts`，Expected: PASS。
6. Commit: `git commit -m "feat(sync): connect conversations tasks and settings"`

## Task 3：把生图和视频历史接入媒体同步

**Client files:**

- Modify: `src/renderer/stores/imageGenerationStore.ts`
- Modify: `src/renderer/stores/videoGenerationStore.ts`
- Modify: `src/renderer/storage/ImageGenerationStorage.ts`
- Modify: `src/renderer/storage/SQLiteImageGenerationStorage.ts`
- Create: `src/renderer/stores/media-history-sync.test.ts`

**Steps:**

1. 写失败测试：成功媒体先算 SHA-256、查 missing、上传后同步 objectId；失败记录不上传空文件；历史在另一设备可下载；删除进入回收站；账号隔离。
2. Run: `pnpm exec vitest run src/renderer/stores/media-history-sync.test.ts`
   Expected: FAIL。
3. 生图继续使用当前接口和零售站/节点路由，仅在结果持久化层接入媒体对象；视频从 `localStorage` 迁移到账号隔离 storage，并保留一次性迁移。
4. Android 下载到应用私有缓存；只有用户主动保存/分享时申请系统文件权限。
5. Run 测试与现有 image/video store 测试，Expected: PASS。
6. Commit: `git commit -m "feat(sync): synchronize image and video histories"`

## Task 4：实现移动端云沙箱适配器

**Client files:**

- Create: `src/renderer/platform/cloud-sandbox/CloudSandboxClient.ts`
- Create: `src/renderer/platform/cloud-sandbox/MobileCloudSandboxController.ts`
- Create: `src/renderer/platform/cloud-sandbox/MobileCloudSandboxController.test.ts`
- Modify: `src/renderer/platform/mobile_platform.ts`
- Modify: `src/renderer/platform/interfaces.ts`

**Backend files:**

- Create: `src/test/java/com/kod/service/CloudSandboxServiceTest.java`
- Create: `src/test/java/com/kod/controller/CloudSandboxControllerTest.java`
- Modify: `src/main/java/com/kod/service/CloudSandboxService.java`
- Modify: `src/main/java/com/kod/controller/CloudSandboxController.java`

**Steps:**

1. 客户端写失败契约测试，将 `sandboxInit/Exec/Read/Write/Edit/Ls/Grep/Find/Kill/Reset/Status` 映射到 workspace/operation/SSE/cancel；后端写失败测试覆盖所有权、资源限额、取消、超时和 worker 丢失恢复。
2. Run client test and backend tests，Expected: FAIL。
3. 实现 `MobileCloudSandboxController`，SSE 断线用 lastEventId 重连，应用退后台不自动取消；用户取消必须幂等。
4. 后端为 workspace 强制 CPU、内存、运行时间、网络域名和文件大小限额；worker 回传内容做密钥/令牌日志脱敏。
5. Run 两端测试，Expected: PASS。
6. Backend commit: `git commit -m "fix(cloud): enforce sandbox isolation and recovery"`; client commit: `git commit -m "feat(android): map sandbox operations to KOD cloud"`。

## Task 5：让 MCP 与技能通过能力路由执行

**Client files:**

- Modify: `src/renderer/packages/mcp/controller.ts`
- Modify: `src/renderer/packages/mcp/types.ts`
- Modify: `src/renderer/packages/skills/controller.ts`
- Modify: `src/renderer/stores/session/tools-builder.ts`
- Create: `src/renderer/packages/mcp/cloud-mcp.test.ts`
- Create: `src/renderer/packages/skills/cloud-skills.test.ts`
- Modify: `src/renderer/routes/settings/mcp.tsx`
- Modify: `src/renderer/routes/settings/skills.tsx`

**Steps:**

1. 写失败测试：Desktop 保持本地传输，Android 创建云 workspace；同一工具输入返回相同结构；取消传递到云操作；权限/网络失败不影响普通对话。
2. Run: `pnpm exec vitest run src/renderer/packages/mcp/cloud-mcp.test.ts src/renderer/packages/skills/cloud-skills.test.ts`
   Expected: FAIL。
3. 根据 `PlatformCapabilities` 选择本地或云 transport，不在页面写平台分支；云任务状态统一为 queued/running/succeeded/failed/cancelled/timed_out。
4. Android 页面显示用途、数据范围、进度、取消和结果；不得显示无法执行的假开关。
5. Run 测试和 `tools-builder.test.ts`，Expected: PASS。
6. Commit: `git commit -m "feat(android): execute MCP and skills through cloud adapter"`

## Task 6：完整接入移动知识库

**Client files:**

- Create: `src/renderer/packages/knowledge/KnowledgeBaseApi.ts`
- Create: `src/renderer/packages/knowledge/KnowledgeBaseApi.test.ts`
- Modify: `src/renderer/routes/settings/knowledge-base.tsx`
- Modify: `src/renderer/packages/model-calls/toolsets/knowledge-base.ts`
- Modify: `src/renderer/platform/mobile_platform.ts`

**Steps:**

1. 写失败测试覆盖创建、重命名、上传、暂停、恢复、重试、搜索、引用、删除和回收站；Android 文件选择只在点击上传时请求权限。
2. Run: `pnpm exec vitest run src/renderer/packages/knowledge/KnowledgeBaseApi.test.ts`
   Expected: FAIL。
3. 使用 `/api/knowledge-bases` 和阶段二分片媒体服务；页面在手机上用列表—详情—文件三级导航，解析状态可刷新并显示可执行错误。
4. 拒绝文件权限后保留已有知识库搜索和对话能力。
5. Run 测试与 `pnpm run check`，Expected: PASS。
6. Commit: `git commit -m "feat(android): deliver synchronized knowledge bases"`

## Task 7：跨设备内容端到端契约测试

**Files:**

- Create: `src/renderer/packages/sync/content-sync.e2e.test.ts`
- Create: `D:\watt\kod-ai-portal\backend\src\test\java\com\kod\e2e\ContentSyncE2ETest.java`
- Modify: `docs/android-feature-parity.json`

**Steps:**

1. 建立两个设备 ID 的测试：Windows 创建会话/图片/视频/设置/知识库，Android 拉取并修改，Windows 再拉取；制造并发修改验证冲突副本。
2. 验证普通同步数据不含完整密钥，媒体哈希一致，删除可恢复，跨账号不可见。
3. Run: `pnpm exec vitest run src/renderer/packages/sync/content-sync.e2e.test.ts` and `./mvnw -Dtest=ContentSyncE2ETest test`
   Expected: PASS。
4. 清单中上述模块状态改为已具备自动化证据并关联测试路径。
5. Commit client: `git commit -m "test(sync): verify cross-device content parity"`; backend: `git commit -m "test(sync): cover end-to-end content exchange"`。

## 阶段验收

- Windows 创建的会话、媒体、设置和知识库可在 Android 出现，反向修改也成立。
- 并发编辑产生可见冲突副本，没有静默覆盖。
- Android MCP、技能和任务沙箱产生真实云执行结果并可取消，不是占位入口。
- 生图和普通对话的原零售站/节点调用链未改变，回归测试通过。
