# 阶段二：跨设备同步、密钥安全、媒体和知识库

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** 建立可增量、可冲突保全、可离线重试的跨设备同步，并在 Android 接入前修正现有密钥明文返回和大文件不可续传问题。

**Architecture:** 后端同步记录与现有资金表隔离；客户端使用游标拉取和幂等 mutation 上传；敏感配置进入加密保险库，普通同步响应只返回掩码；媒体进入 S3 兼容对象存储并使用分片上传；删除进入 30 天回收站。

**Tech Stack:** Spring Boot、JUnit 5、MySQL、AWS S3 SDK、TypeScript、Zustand、SQLite、Vitest。

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

---

## Task 1：锁定并强化同步契约

**Backend files (`D:\watt\kod-ai-portal\backend`):**

- Create: `src/test/java/com/kod/service/SyncServiceTest.java`
- Create: `src/test/java/com/kod/controller/SyncControllerTest.java`
- Modify: `src/main/java/com/kod/service/SyncService.java`
- Modify: `src/main/java/com/kod/controller/SyncController.java`
- Modify: `src/main/java/com/kod/dto/SyncChange.java`
- Modify: `src/main/java/com/kod/dto/SyncMutation.java`

**Contract:** `POST /api/sync/exchange` 接受 `deviceId`、`cursor` 和含 `operationId/baseVersion/entityType/payload/deletedAt` 的 mutations，返回 `nextCursor`、逐操作结果和 changes。

**Steps:**

1. 写失败测试覆盖：同一 `operationId` 重试不重复写；旧 `baseVersion` 创建冲突副本；所有实体类型冲突都保留双方；跨用户读取返回 404/403；密钥字段永不出现在 change 明文。
2. Run: `./mvnw -Dtest=SyncServiceTest,SyncControllerTest test`
   Expected: FAIL，现有 model/skill 冲突处理和明文返回不符合契约。
3. 最小修改 `SyncService`：统一冲突副本策略、保留来源设备/时间、稳定错误码、密钥 payload 替换为 `secretRef/maskedValue`。
4. 为实体类型建立白名单：`session`、`task`、`image_generation`、`video_generation`、`model_settings`、`skill_settings`、`relay_node_settings`、`knowledge_base`；未知类型返回 `SYNC_ENTITY_UNSUPPORTED`。
5. Run: `./mvnw -Dtest=SyncServiceTest,SyncControllerTest test`
   Expected: PASS。
6. Commit in backend: `git commit -m "fix(sync): preserve conflicts and mask secrets"`

## Task 2：实现重新验证后的限时密钥查看

**Backend files:**

- Create: `src/main/java/com/kod/controller/SecretRevealController.java`
- Create: `src/main/java/com/kod/service/SecretRevealService.java`
- Create: `src/main/java/com/kod/dto/SecretReauthRequest.java`
- Create: `src/main/java/com/kod/dto/SecretReauthResponse.java`
- Create: `src/main/java/com/kod/dto/SecretRevealResponse.java`
- Create: `src/test/java/com/kod/service/SecretRevealServiceTest.java`
- Modify: `src/main/java/com/kod/service/SyncSecretVaultService.java`
- Modify: `src/main/java/com/kod/config/SyncSchemaInitializer.java`

**Produced endpoints:**

- `POST /api/secrets/reauth`：校验当前账号密码并签发 5 分钟、仅当前设备有效的 reveal grant。
- `POST /api/secrets/{secretRef}/reveal`：携带 grant 返回一次明文，并记录审计。

**Steps:**

1. 写失败测试：错误密码、过期 grant、其他设备、其他用户、重复使用、日志泄露全部拒绝；成功响应仅在 reveal endpoint 出现明文。
2. Run: `./mvnw -Dtest=SecretRevealServiceTest test`
   Expected: FAIL，服务和表不存在。
3. 新增独立表 `kod_secret_reauth_grant`，字段包含哈希 grant、user_id、device_id、expires_at、used_at；使用现有密码校验服务，不存密码。
4. reveal 成功后单次消费 grant；审计事件只记录 secretRef、用户、设备、时间和结果，不记录明文。
5. Run: `./mvnw -Dtest=SecretRevealServiceTest test`
   Expected: PASS。
6. Commit: `git commit -m "feat(security): add reauthenticated secret reveal"`

## Task 3：30 天回收站和清理任务

**Backend files:**

- Create: `src/main/java/com/kod/service/SyncRecycleBinService.java`
- Create: `src/main/java/com/kod/controller/SyncRecycleBinController.java`
- Create: `src/main/java/com/kod/config/SyncRetentionJob.java`
- Create: `src/test/java/com/kod/service/SyncRecycleBinServiceTest.java`
- Modify: `src/main/java/com/kod/config/SyncSchemaInitializer.java`
- Modify: `src/main/java/com/kod/service/SyncService.java`

**Produced endpoints:**

- `GET /api/sync/recycle-bin`
- `POST /api/sync/recycle-bin/{entityType}/{entityId}/restore`
- `DELETE /api/sync/recycle-bin/{entityType}/{entityId}`

**Steps:**

1. 写失败测试：普通删除设置 `deleted_at/purge_after`；30 天内可恢复为新版本；硬删除校验所有权并清对象引用；清理任务只删除已到期数据。
2. Run: `./mvnw -Dtest=SyncRecycleBinServiceTest test`
   Expected: FAIL。
3. 扩展独立同步表，不触碰钱包表；清理批次使用上限和游标，避免长事务。
4. Run: `./mvnw -Dtest=SyncRecycleBinServiceTest test`
   Expected: PASS。
5. Commit: `git commit -m "feat(sync): add 30-day recycle bin"`

## Task 4：客户端增量同步引擎与离线队列

**Client files (`D:\watt\kod`):**

- Create: `src/renderer/packages/sync/types.ts`
- Create: `src/renderer/packages/sync/api.ts`
- Create: `src/renderer/packages/sync/SyncEngine.ts`
- Create: `src/renderer/packages/sync/SyncEngine.test.ts`
- Create: `src/renderer/storage/SyncQueueStorage.ts`
- Create: `src/renderer/storage/SQLiteSyncQueueStorage.ts`
- Create: `src/renderer/stores/syncStore.ts`
- Create: `src/renderer/routes/settings/sync.tsx`
- Modify: `src/renderer/routes/settings/route.tsx`

**Produced interface:**

```ts
export interface SyncEngine {
  enqueue(mutation: LocalMutation): Promise<void>
  exchange(signal?: AbortSignal): Promise<SyncSummary>
  listConflicts(): Promise<SyncConflict[]>
  retry(operationId: string): Promise<void>
}
```

**Steps:**

1. 写失败测试覆盖断网入队、依赖顺序、幂等重试、游标持久化、冲突副本、永久错误保留、资金类实体拒绝入队。
2. Run: `pnpm exec vitest run src/renderer/packages/sync/SyncEngine.test.ts`
   Expected: FAIL。
3. 实现平台无关引擎，Desktop 用 IndexedDB/storage，Android 用 SQLite；网络恢复、应用前台和用户主动刷新触发 exchange，指数退避上限 5 分钟。
4. 同步设置页显示上次成功时间、待上传数量、冲突数量和逐条重试；不能提供“清空所有失败”而丢数据。
5. Run: `pnpm exec vitest run src/renderer/packages/sync/SyncEngine.test.ts && pnpm run check`
   Expected: PASS。
6. Commit: `git commit -m "feat(sync): add offline-first client sync engine"`

## Task 5：媒体分片上传、续传与完整性校验

**Backend files:**

- Create: `src/main/java/com/kod/controller/MediaUploadSessionController.java`
- Create: `src/main/java/com/kod/service/MediaUploadSessionService.java`
- Create: `src/main/java/com/kod/dto/MediaUploadInitRequest.java`
- Create: `src/main/java/com/kod/dto/MediaUploadSessionResponse.java`
- Create: `src/test/java/com/kod/service/MediaUploadSessionServiceTest.java`
- Modify: `src/main/java/com/kod/controller/MediaObjectController.java`
- Modify: `src/main/java/com/kod/service/MediaObjectService.java`
- Modify: `src/main/java/com/kod/config/SyncSchemaInitializer.java`

**Client files:**

- Create: `src/renderer/packages/media/ResumableMediaClient.ts`
- Create: `src/renderer/packages/media/ResumableMediaClient.test.ts`

**Produced endpoints:**

- `POST /api/media/uploads`
- `PUT /api/media/uploads/{uploadId}/parts/{partNumber}`
- `GET /api/media/uploads/{uploadId}`
- `POST /api/media/uploads/{uploadId}/complete`
- `DELETE /api/media/uploads/{uploadId}`

**Steps:**

1. 后端和客户端分别写失败测试：缺片、重复片、越权、哈希不符、断线后续传、完成后幂等返回同一 objectId。
2. Run backend: `./mvnw -Dtest=MediaUploadSessionServiceTest test`; run client: `pnpm exec vitest run src/renderer/packages/media/ResumableMediaClient.test.ts`
   Expected: FAIL。
3. 以 5 MiB 分片实现会话，数据库只保存元数据和对象键，字节进入 S3 兼容存储；完成时校验总大小和 SHA-256。
4. 对小于 5 MiB 文件保留现有 multipart 兼容入口；下载继续鉴权并支持 Range。
5. Run 两端测试和现有 `MediaObjectServiceTest`，Expected: PASS。
6. Backend commit: `git commit -m "feat(media): support resumable object uploads"`; client commit: `git commit -m "feat(media): add resumable upload client"`。

## Task 6：知识库文件迁移到对象存储

**Backend files:**

- Create: `src/test/java/com/kod/service/KnowledgeBaseObjectStorageTest.java`
- Modify: `src/main/java/com/kod/controller/KnowledgeBaseController.java`
- Modify: `src/main/java/com/kod/service/KnowledgeBaseService.java`
- Modify: `src/main/java/com/kod/config/KnowledgeBaseSchemaInitializer.java`

**Steps:**

1. 写失败测试：新上传只存 object_id；旧 `LONGBLOB` 文件仍可下载并在首次访问后迁移；删除遵循 30 天回收站；跨用户不可读取。
2. Run: `./mvnw -Dtest=KnowledgeBaseObjectStorageTest test`
   Expected: FAIL，当前新文件写入数据库字节列。
3. 增加可空 `object_id` 并保持旧列向前兼容；新上传经媒体服务，解析器从受鉴权对象流读取。
4. Run: `./mvnw -Dtest=KnowledgeBaseObjectStorageTest test`
   Expected: PASS。
5. Commit: `git commit -m "refactor(knowledge): store new files as media objects"`

## 阶段验收

- 同步冲突、幂等、离线队列、回收站和跨用户隔离测试全部通过。
- 普通同步响应、日志、数据库同步 payload 和客户端缓存都不含完整 API Key。
- 100 MiB 测试视频中断上传后可从已完成分片继续，最终 SHA-256 一致。
- 旧知识库文件仍可读取；新文件不再写入数据库大字段。
