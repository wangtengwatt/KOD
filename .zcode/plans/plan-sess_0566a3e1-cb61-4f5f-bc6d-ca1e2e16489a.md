## 第三批实施计划

### 范围与边界
本批完成 renderer 内可落地、可恢复、按账户隔离的本地业务闭环：Repository、待办、提醒记录与前台协调、番茄钟状态机、本地日程、确认卡幂等执行。

本批不实现 Electron main 可靠通知、独立桌宠窗口或移动 SQLite 原生接线；但提醒数据和调度接口会保持未来兼容。不会触碰 `docs/README.md` 的删除或 `.zcode/`，不会 commit/push，也不会新增裸 `localStorage`。

### 1. 固化共享契约与确认草案
- 补齐 `SuanbaoAction` / `SuanbaoConfirmation` 与 CRUD、状态转换所需的结构化字段和校验。
- `intent.ts` 直接生成可执行的 `action`，不再由 UI 从展示字段反向解析。
- 每次新草案生成随机且稳定的 idempotency key；同一确认卡的双击/重试复用它，但用户之后输入完全相同的新请求仍可创建新实体。
- 补充待办、提醒、番茄、本地日程实体不变量，如非空标题、合法时间、日程结束时间晚于开始时间。

### 2. 完成 Repository 契约和两个实现
- 整理 `SuanbaoRepository`：操作记录、按幂等键查询、原子执行、四类实体 CRUD、待触发提醒查询、活动番茄查询、清理生命周期。
- 修复并加强 IndexedDB 实现：正确等待 request/transaction；安全 schema 升级；唯一 idempotency 索引；实体和 operation success 同事务；重复确认返回既有结果；索引查询提醒/日程；确定性选择活动番茄。
- 使 Memory 实现与 IndexedDB 语义一致，作为测试适配器。
- 工厂按账户缓存、初始化和释放；测试环境使用内存实现，Desktop/Web 使用 IndexedDB。Mobile SQLite 留作后续原生批次，避免在原生工程缺失时误报完成。

### 3. 实现待办、提醒和本地日程 CRUD
- 在 AssistantService 提供语义化 CRUD，组件不直接拼实体或维护时间戳。
- 待办支持创建、读取、列表、编辑、完成/取消完成和删除。
- 提醒持久化 `triggerAt`、`timezone`、`status`、`recurrence`、`platformScheduleId`、`revision`，支持更新、取消、删除及到期状态推进。
- 本地日程支持创建、范围查询、读取、更新和删除；继续与只读系统日历投影严格分离。

### 4. 实现番茄钟纯状态机和重启恢复
- 新建 `pomodoro.ts`，将 start、pause、resume、complete/skip、stop、recover 做成可测试的纯转换。
- running 以绝对 `endsAt` 为权威；paused 才保存 `remainingMs`，不持久化逐秒倒计时。
- 恢复时依据当前时间推进过期阶段并避免重复完成；工作阶段按完成周期进入短休/长休。
- Repository/AssistantService 保证一个账户仅有一个活动番茄，新启动时确定性处理既有活动会话。

### 5. 实现前台调度协调层
- 新建窄 `scheduler.ts`：管理离当前最近的一条提醒计时器，唤醒后重新读取 `Date.now()` 与 repository，而不是信任长 `setTimeout`。
- 初始化、页面重新可见、窗口 focus/show 时 reconcile；创建、更新、取消提醒后重新调度。
- 一次性过期提醒只推进一次；循环提醒推进到下一次有效时间，不重放全部错过周期。
- `platformScheduleId` 保持不透明并经调度端口保存。当前 renderer fallback 明确只保证页面存活/前台；后续 Desktop main 与 Mobile Local Notifications 可替换端口。

### 6. 实现 SuanbaoAssistantService 幂等执行
- 准备确认时先持久化 `awaiting-confirmation` operation，使卡片可在组件重挂载后恢复。
- Confirm 按 operation/confirmation ID 加载可信 action，执行 `awaiting → running → succeeded/failed` 合法转换。
- 使用 repository 持久幂等保障，并加进程内 single-flight，防止快速双击并发创建两条记录。
- 成功返回确定实体 ID 和气泡结果；失败保存稳定 error code，允许同一 operation 重试。
- Cancel 将 awaiting operation 转为 cancelled，不产生实体。

### 7. 接入确认卡 UI
- `SuanbaoPet` 解析 confirmation 后调用 AssistantService prepare，而不只保存 React 草案。
- Confirm 真正执行 action；执行中禁用按钮；重复点击复用同一 Promise/operation。
- Cancel 持久化取消状态。
- 成功显示具体结果，失败显示可重试错误；初始化恢复最新 awaiting confirmation。
- 所有业务逻辑留在 service/repository，避免继续膨胀组件。

### 8. 测试与验证
新增或扩展测试覆盖：
- Memory/IndexedDB 共享 Repository contract；
- 按账户隔离；
- 待办、提醒、本地日程完整 CRUD；
- 同一确认卡并发双击只创建一次，新的相同请求仍可再次创建；
- operation 合法转换和失败重试；
- 提醒绝对时间、循环推进、到期去重、调度 ID持久化；
- 番茄 start/pause/resume/skip/stop、长休规则、重启和时间跳跃恢复；
- 确认卡 prepare/confirm/cancel/恢复流程。

完成后运行：
1. `pnpm exec tsc --noEmit`
2. Suanbao 相关 Vitest
3. 对改动文件执行 Biome 检查或 `pnpm run lint`
4. `git diff --check`

如全量命令受仓库既有问题影响，将明确区分本批问题与既有失败并报告原始结果。