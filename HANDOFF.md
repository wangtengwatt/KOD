# 蒜宝第一阶段实施交接

> 交接日期：2026-08-03
> 仓库：`D:\kod`
> 分支：`suanbao_KOD`
> 面向对象：完全没有本会话上下文的新 ZCode 对话

## 1. 我们在做什么

用户是 KOD 蒜粒小组长王腾。目标是依据已经批准的蒜宝架构文档，连续实施完整第一阶段，而不是只做文档或原型。

产品目标：

- 蒜宝在所有 KOD 业务页面出现，包括图片生成页面；
- Desktop Electron 提供独立透明宠物窗口，主窗口最小化或关闭后托盘常驻；
- Web/iOS/Android 在 KOD 应用内保持一致体验，移动后台使用系统通知；
- 用户点击蒜宝后，在角色旁边的气泡中直接对话，不跳转普通聊天页面；
- 蒜宝复用用户当前 KOD 模型配置，但使用独立短记忆，不污染普通聊天记录；
- 模型不可用时，本地意图仍支持待办、提醒、番茄钟、显隐、锁定和导航；
- 所有有副作用的自然语言操作必须先显示结构化确认卡，用户确认后才执行；
- 第一阶段包括待办、提醒、番茄钟、Open-Meteo 天气、本地日程、移动只读系统日历接口及快捷打开 KOD 功能；
- 默认克制：新用户主动开启，随机走动、声音和主动搭话默认关闭；
- 素材采用设计期 AI 生图、人工审核、随客户端发布，运行时不生图。

批准的架构文档位于：

- `docs/plans/2026-08-03-suanbao-phase1-product-technical-architecture.md`

注意：早期对话曾创建 `docs/suanbao-architecture.md`，但当前仓库实际批准文档路径是上面的 `docs/plans/...`。以当前文件系统和 Git HEAD 为准。

## 2. 重要环境和仓库约束

- 工作目录：`D:\kod`
- 包管理器：pnpm
- Node 要求：>= 22.12
- 格式和 lint：Biome，单引号、无分号、2 空格缩进、120 列
- Electron + React 18 + TypeScript + TanStack Router
- renderer 状态：Jotai + Zustand + React Query
- 平台抽象：`src/renderer/platform/`
- 存储文档：`docs/storage.md`
- 未经用户要求，不 commit、不 push。

工作区进入本任务前就存在用户自己的改动：

- `docs/README.md` 被删除；
- `.zcode/` 未跟踪。

**这两项不是本任务创建的，绝对不要恢复、删除或覆盖。**

当前 `git status --short`：

```text
 D docs/README.md
 M src/renderer/components/suanbao/SuanbaoPet.tsx
 M src/renderer/components/suanbao/suanbao.css
 M src/renderer/components/suanbao/suanbaoStore.test.ts
 M src/renderer/components/suanbao/suanbaoStore.ts
 M src/renderer/components/suanbao/suanbaoUtils.ts
 M src/renderer/routes/settings/suanbao.tsx
?? .zcode/
?? src/renderer/packages/suanbao/
?? src/shared/types/suanbao.test.ts
?? src/shared/types/suanbao.ts
```

## 3. 已经完成什么

### 3.1 架构和现状审计

已对以下区域进行过非常彻底的只读审计：

- 当前蒜宝 renderer 原型；
- 普通聊天模型调用和生成链路；
- Platform/Storage；
- Electron main/preload/IPC/window/tray；
- Capacitor 移动构建、SQLite、通知、定位和日历；
- 测试和跨平台风险。

核心结论：

- 当前原型原本只是根 React 树中的路由白名单悬浮组件；
- Electron 没有蒜宝独立窗口、broker、最小 preload 或系统通知；
- Mobile 没有 Local Notifications、Geolocation、Calendar 插件；
- 仓库没有版本化 `capacitor.config.*`，也没有 `ios/`、`android/` 工程，`cap sync` 在干净检出上失败；
- Desktop/Web 没有统一系统日历读取能力，必须降级为本地日程；
- iOS 不能跨 App 常驻悬浮，Android Overlay 不在一期范围。

### 3.2 共享领域契约

新增：

- `src/shared/types/suanbao.ts`
- `src/shared/types/suanbao.test.ts`

已定义：

- `SuanbaoPreferences`
- `SuanbaoPlacement`
- `SuanbaoPetState`
- `SuanbaoCommand`
- `SuanbaoOperation`
- `SuanbaoActivity`
- `SuanbaoViewModel`
- `SuanbaoConfirmation`
- 待办、提醒、番茄钟、本地日程、系统日历投影、天气数据；
- 平台能力和权限状态；
- 受控路由 ID；
- 命令、坐标和 route runtime 校验。

### 3.3 原型正确性修复和全页面显示

修改：

- `src/renderer/components/suanbao/SuanbaoPet.tsx`
- `src/renderer/components/suanbao/suanbaoUtils.ts`
- `src/renderer/components/suanbao/suanbao.css`

已完成：

- `shouldShowSuanbao()` 改为默认所有业务页面显示；
- 设置页面和 Settings Modal 仍隐藏；
- 图片生成页面现在也在显示范围；
- 用 ref 保存最新拖拽位置，避免 Pointer Up 持久化旧 React state；
- 初始定位完成前隐藏，减少左上角闪跳；
- 创建单击 timer 前清理旧 timer，缓解单击/双击竞态；
- 增加锁定位置，锁定时禁止拖拽；
- 显式 `.suanbao-animation-off`；
- 增加 `aria-live` 和状态文本；
- 当前 CSS 蒜头保留为素材 fallback。

尚未彻底完成：

- `SuanbaoPet.tsx` 仍过大，尚未拆成 Visual/Bubble/ConfirmationCard/InAppHost；
- 双击仍使用浏览器 `onDoubleClick`，没有完整纯手势状态机；
- 当前视觉状态仍部分读取普通 chat/task 消息，而不是完全由独立 Activity 驱动。

### 3.4 偏好扩展和克制默认

修改：

- `src/renderer/components/suanbao/suanbaoStore.ts`
- `src/renderer/components/suanbao/suanbaoStore.test.ts`
- `src/renderer/routes/settings/suanbao.tsx`

已完成：

- 新用户默认 `enabled: false`；
- `activeMode: false`；
- `soundEnabled: false`；
- `locked: false`；
- 加入 desktop overlay、notifications、location mode、calendar 等 schema v2 字段；
- 设置页新增活跃模式、声音和锁定位置；
- 设置描述改为覆盖所有 KOD 页面，包括图片生成。

重要：当前 Store **仍使用裸 localStorage** 和原 V1 key：

```text
suanbao-preferences-v1:<accountKey>
```

这只是过渡实现。下一阶段必须建立 Platform repository 和幂等 V1→V2 迁移，不能继续扩大 localStorage 使用。

### 3.5 本地意图解析

新增：

- `src/renderer/packages/suanbao/intent.ts`
- `src/renderer/packages/suanbao/intent.test.ts`

当前支持：

- 待办草案；
- 提醒草案；
- 番茄钟草案；
- 显示/隐藏；
- 锁定/解锁；
- 打开图片生成；
- 打开任务；
- 打开设置；
- 新建聊天；
- 问候和摸头离线台词。

> 2026-08-04 第三批更新：下述“只生成确认草案”的历史描述已经失效。当前已实现账户级 `SuanbaoRepository`、确认事务执行、待办/提醒/番茄钟/本地日程持久化，以及设置页中的四类管理入口。应用启动会恢复待确认操作和活动番茄，前台 reminder scheduler 会协调到期记录；Electron 独立窗口也能通过受限 IPC 按 operation ID 确认或取消。完整原生后台通知、移动 SQLite/本地通知和 DST 重复提醒仍属于后续平台增强。

### 3.6 独立蒜宝短会话骨架

新增：

- `src/renderer/packages/suanbao/conversation.ts`

已完成：

- 不创建普通 Chat Session；
- 不调用 `createEmpty('chat')`；
- 不污染普通聊天列表；
- 独立维护最多 24 条内存短记忆；
- 独立角色 Prompt；
- 复用 KOD `createModel()` 和 `generateText()`；
- operation ID；
- AbortController registry；
- Activity subscribe/get/clear/cancel API；
- 模型错误时 Activity 进入 error；
- 气泡普通输入与解释代码/分析错误都已开始走独立会话。

当前限制：

- 使用的是 `generateText()` 非流式调用，气泡尚未真正流式；
- AbortController 没有传入 `generateText()`，所以当前 cancel 只能在请求前后检查，不能真正中断底层网络流；
- 短记忆只在内存，尚未持久化；
- Activity 尚未完全接入 `SuanbaoPet` 视觉状态；
- 独立会话尚无 30 天 TTL/清理 repository；
- 复杂结果“在 KOD 中展开”尚未完成。

### 3.7 气泡输入和确认卡初版

`SuanbaoPet.tsx` 已加入：

- 自由输入框；
- 本地意图优先；
- 独立模型回答；
- reply/error 展示；
- 确认卡字段展示；
- Cancel/Confirm 按钮；
- 受控导航方法。

但是 Confirm 目前只显示一条“草案已准备”的文本，**尚未真正执行业务动作**。这是下一步首要工作。

## 4. 当前卡在哪里

用户运行时报告：

```text
Model provider must not be empty.
```

### 根因

最初错误地从全局 Settings 顶层读取：

```ts
globalSettings.provider
globalSettings.modelId
```

但 KOD 的 `Settings` 顶层没有这两个字段。KOD 新聊天真实的模型选择规则是：

1. `settings.defaultChatModel`；
2. 否则 `lastUsedModelStore.getState().chat`；
3. 两者都没有才是未配置。

### 已修复

`src/renderer/packages/suanbao/conversation.ts` 现在使用：

```ts
const selectedModel = globalSettings.defaultChatModel
  ? {
      provider: globalSettings.defaultChatModel.provider,
      modelId: globalSettings.defaultChatModel.model,
    }
  : lastUsedModelStore.getState().chat
```

然后：

```ts
SessionSettingsSchema.parse({ ...globalSettings, ...selectedModel })
```

如果两者都没有，抛出：

```text
SUANBAO_MODEL_NOT_CONFIGURED
```

UI 会转换为友好提示，本地命令仍可用。

### 当前验证状态

修复后已运行：

```bash
pnpm exec tsc --noEmit
```

结果：通过。

```bash
pnpm exec vitest run src/renderer/packages/suanbao src/renderer/components/suanbao src/shared/types/suanbao.test.ts
```

结果：

- 7 个测试文件通过；
- 23 个测试通过；
- 0 个失败。

`git diff --check` 在近期改动中也已通过。

当前没有已知编译阻断。真正“卡点”是功能只完成到第二批骨架，确认卡尚不能执行，Repository/Electron/天气/移动能力尚未实现。

## 5. 下一步计划

严格按以下顺序继续，不要直接跳到桌面窗口把业务逻辑复制过去。

### 第一步：完成本地 Repository 和业务执行层

建立：

```text
src/renderer/packages/suanbao/repository.ts
src/renderer/packages/suanbao/assistant.ts
src/renderer/packages/suanbao/pomodoro.ts
src/renderer/packages/suanbao/scheduler.ts
```

目标：

- 一个按账户隔离的 `SuanbaoRepository`；
- Desktop/Web 基于现有 Platform Storage/IndexedDB；
- Test 使用内存实现；
- Mobile 后续实现 SQLite adapter；
- 待办 CRUD；
- 提醒 CRUD；
- 番茄状态机；
- 本地日程 CRUD；
- operation confirmation 以 idempotency key 执行；
- Confirm 按钮真正调用 AssistantService；
- 重复点击不得创建两条记录；
- 番茄使用 `endsAt` 绝对时间，支持重启恢复；
- 提醒保存 timezone/triggerAt/status/platformScheduleId。

### 第二步：迁移偏好和独立短记忆

- 偏好从裸 localStorage 迁到 Platform Storage；
- V1 只在专项 migration adapter 中读取；
- 新存储成功后才删除旧 key；
- 偏好、设备位置、业务实体和短记忆分层；
- hydration 完成前不显示蒜宝；
- 短记忆按账户隔离，最多 12 轮/24 条，30 天 TTL；
- 设置页“清空短记忆”和“删除全部本机蒜宝数据”。

### 第三步：让 Activity 成为唯一状态源

- `SuanbaoPet` 不再读取普通聊天/任务消息映射；
- 视觉完全订阅 `suanbaoConversationService`/Assistant Activity；
- Activity 覆盖 idle/listening/thinking/executing/success/error/reminding/focus/rest/sleeping；
- cancel 使用 operation ID；
- 把底层模型调用改为 `model.chatStream()`，把 AbortSignal 真正传入；
- 气泡流式更新；
- 复杂结果提供受控“在 KOD 中展开”。

### 第四步：天气和平台能力

- 增加聚合的 Suanbao capability service；
- Open-Meteo Geocoding + Forecast；
- 手动城市优先可用；
- 当前天气 15 分钟 TTL，预报 60 分钟；
- 离线展示最后成功数据和更新时间；
- Web Geolocation/Notification，明确 foreground-only；
- Desktop 调度放 main；
- Mobile notification/geolocation adapter 等原生工程具备后再接线；
- Desktop/Web 系统日历返回 unavailable；本地日程全平台可写。

### 第五步：Electron 主窗口生命周期和独立桌宠

顺序必须是：

1. `isQuitting`/统一真正退出；
2. 主窗口普通 close 改为 hide 到托盘，保留 renderer；
3. 拆分确定性的 show/hide/toggle；
4. 修 `kod://` 冷启动与旧 `chatbox://` 残留；
5. shared typed IPC + runtime schema；
6. main broker；
7. 独立最小 preload；
8. electron-vite 多 renderer/preload 入口；
9. 独立透明 window；
10. 点击穿透、焦点、动态 bounds、多显示器/DPI；
11. 扩展 Tray；
12. Electron Notification 和可靠 scheduler。

建议文件：

```text
src/main/suanbao/window.ts
src/main/suanbao/broker.ts
src/main/suanbao/ipc-handlers.ts
src/main/suanbao/scheduler.ts
src/preload/suanbao.ts
src/renderer/suanbao-window/
```

### 第六步：移动原生能力

当前仓库阻断：

- 没有 `capacitor.config.*`；
- 没有 `ios/`；
- 没有 `android/`；
- `cap sync ios/android` 会失败。

因此先修复可复现移动工程，再安装与 Capacitor 7 匹配的：

- `@capacitor/local-notifications`
- `@capacitor/geolocation`

系统日历若没有可靠的 Capacitor 7 社区插件，应自建窄插件：

- iOS EventKit 只读；
- Android CalendarContract，只请求 `READ_CALENDAR`；
- JS 只暴露 check/request/listEvents；
- 绝不请求 `WRITE_CALENDAR`。

## 6. 绝对不要再踩的坑

### 6.1 不要从 Settings 顶层读取 provider/modelId

错误：

```ts
globalSettings.provider
globalSettings.modelId
```

正确优先级：

```text
defaultChatModel -> lastUsedModelStore.chat -> 未配置
```

`defaultChatModel` 字段是 `{ provider, model }`，要映射成 `{ provider, modelId }`。

### 6.2 不要让蒜宝创建普通聊天来“伪装独立会话”

旧代码 `startSuanbaoPrompt()` 会调用：

```ts
createEmpty('chat')
submitNewUserMessage(...)
```

这会跳页并污染普通聊天列表。新功能必须走独立 conversation service。旧 action 目前还在文件中供旧测试/其他按钮使用，但不要再从蒜宝气泡调用它。

### 6.3 不要让独立桌宠窗口复用主 preload

主 preload 当前暴露：

```ts
invoke: ipcRenderer.invoke
```

这意味着能访问 Sandbox、MCP、Skills、文件和其他高权限 IPC。独立蒜宝窗口必须使用独立、最小、命名方法 preload，并校验 sender 和 payload。

### 6.4 不要在独立窗口里复制业务逻辑

一期正确数据流：

```text
Pet Window -> typed IPC -> Main Broker -> Main Renderer SuanbaoService
Main Renderer -> ViewModel -> Main Broker -> Pet Window
```

主进程 broker 只转发、鉴权、校验和管理 readiness，不编排 AI；Pet Window 只展示和发命令。

### 6.5 不要销毁主 renderer 后还宣称蒜宝 AI 可用

一期模型和业务仍在主 renderer。关闭主窗口必须 hide 到 tray，而不是 destroy。真正退出时才销毁。

必须使用 `isQuitting` 避免 close handler 阻止 `app.quit()`、更新安装或 relaunch。

### 6.6 不要用 toggle 处理通知点击或“在 KOD 中展开”

通知点击需要确定性 `showMainWindow()`。如果调用 toggle，而窗口已经显示，会反而隐藏。

### 6.7 不要继续扩大裸 localStorage

当前 localStorage 只是过渡。业务实体、提醒、番茄、天气、日程和短记忆不得写新的裸 localStorage key。通过 Platform repository 实现。

### 6.8 不要把长期 setTimeout 当作可靠提醒

- Desktop：主进程 + 绝对 triggerAt + 启动/唤醒 reconcile；
- Mobile：系统 Local Notifications；
- Web：只保证页面存活，重开后补偿；
- 番茄以 `endsAt` 为权威，不是递减计数器。

### 6.9 不要声称系统日历全平台一致

- Desktop/Web 没有统一系统日历读取接口；
- iOS/Android 才做只读适配；
- 本地日程全平台可写；
- 系统日历接口中不能出现 create/update/delete；
- 不请求 WRITE_CALENDAR。

### 6.10 不要在移动原生工程不存在时宣称插件已完成

安装 npm 包不等于 iOS/Android 能运行。必须有：

- capacitor config；
- 原生工程；
- cap sync 成功；
- Manifest/Info.plist 权限；
- emulator/真机验证。

如果缺少这些，必须诚实报告“adapter 已写但原生接线未验证”。

### 6.11 不要把 AI 生图直接当可发布动画

必须设计期离线生成、固定 reference/seed、人工审核修整、manifest 校验和版本化发布。运行时不生图。

### 6.12 不要覆盖用户原有工作区改动

特别是：

- `docs/README.md` 删除；
- `.zcode/`。

这两项不属于本任务。

### 6.13 不要只跑测试不跑 TypeScript

Vitest 可通过而 TypeScript 仍失败。本会话曾出现测试全通过但类型报错。每批至少同时运行：

```bash
pnpm exec tsc --noEmit
pnpm exec vitest run <相关路径>
git diff --check
```

最终还需：

```bash
pnpm run check
pnpm run build
```

## 7. 当前测试清单

最近通过：

```bash
pnpm exec tsc --noEmit
```

```bash
pnpm exec vitest run \
  src/renderer/packages/suanbao \
  src/renderer/components/suanbao \
  src/shared/types/suanbao.test.ts
```

结果：7 files / 23 tests 全通过。

下一位应先再次运行这两条，确认交接文件之外没有环境漂移，然后开始 Repository/AssistantService。

## 8. 当前 Todo 状态

```text
[completed] 建立共享领域契约并修正全页面原型
[in_progress] 实现独立会话、Activity 和本地意图
[pending] 实现统一存储与助手业务闭环
[pending] 接入天气及平台能力降级
[pending] 实现 Electron 托盘常驻和独立窗口
[pending] 完善素材动作和设置体验
[pending] 运行全量验证并报告平台限制
```

第二项只能算“核心骨架完成，尚未完全完成”：非流式调用、持久化短记忆、Activity 唯一状态源、真实取消和复杂结果展开仍待处理。

## 9. 建议新对话的第一条行动

1. 读取本文件；
2. 读取批准架构文档；
3. 查看 `git status`，确认不碰用户原改动；
4. 运行当前 tsc 和 23 个测试；
5. 阅读：
   - `src/renderer/packages/suanbao/conversation.ts`
   - `src/renderer/packages/suanbao/intent.ts`
   - `src/renderer/components/suanbao/SuanbaoPet.tsx`
   - `src/renderer/components/suanbao/suanbaoStore.ts`
   - `src/renderer/platform/interfaces.ts`
   - `src/renderer/storage/BaseStorage.ts`
6. 设计并实现 `SuanbaoRepository + SuanbaoAssistantService`；
7. 将确认卡 Confirm 接到幂等业务执行；
8. 完成后再推进流式 Activity 和 Electron，不要反过来。
