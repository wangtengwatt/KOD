# KOD 蒜宝第一阶段产品与技术架构

> 状态：待小组评审
> 文档负责人：王腾 / KOD 蒜粒小组
> 基线日期：2026-08-03
> 适用范围：Electron Desktop、Web、iOS、Android
> 数据策略：仅本机持久化、按 KOD 账户隔离
> 相关代码：`src/renderer/components/suanbao/`、`src/renderer/routes/settings/suanbao.tsx`

## 1. 执行摘要

蒜宝第一阶段的目标不是再增加一个悬浮按钮，而是建立一个具有独立角色、独立短记忆和明确行为边界的 KOD 助手：用户点击角色后，由蒜宝通过贴近角色的气泡直接交流；复杂内容才展开 KOD 主客户端。

跨平台共同基线是“所有 KOD 页面内均可使用蒜宝”，包括图片生成页。桌面端额外提供透明独立宠物窗口，KOD 主窗口最小化或关闭到托盘后仍可驻留；Web 和移动端受操作系统限制，离开 KOD 后不承诺跨应用悬浮，后台能力由系统通知和可恢复计时提供。

第一阶段连续交付以下闭环：

- 全局应用内蒜宝与桌面独立窗口；
- 气泡短对话、独立蒜宝会话、本地意图兜底；
- 拖拽、点击、双击、摸头、状态动画、隐藏、静音和位置锁定；
- 待办、提醒、番茄钟、天气、本地日程和只读系统日历；
- 所有 AI 副作用先形成结构化确认卡，确认后执行；
- 设计期 AI 生图素材生产规范和运行时素材包格式。

本方案采用四层架构：Domain、Application Services、Platform Capabilities、Presentation Hosts。展示组件不得直接编排聊天 Store、Electron IPC 或原生插件。

---

## 2. 第一性原理与边界纠偏

### 2.1 “竞品有的都要有”不可作为验收标准

桌宠不存在统一、有限的功能全集。成熟产品还包含多年美术资产、运营内容、原生系统适配和服务端能力。如果以“竞品有的都要有”为标准，范围无法穷举，完成状态也无法判定。

**可执行改进：**将需求收敛为本文的能力矩阵、平台降级规则和可自动或人工验证的验收项。新竞品能力进入后续需求池，不改变一期完成定义。

### 2.2 全平台一致不等于全平台能力相同

- iOS 不允许普通应用任意常驻覆盖其他 App；
- Web 页面关闭后不能继续显示桌宠；
- Android 系统悬浮窗需要特殊权限和前台服务，存在应用商店政策与耗电成本；
- Linux Wayland 对透明、置顶和点击穿透的支持因桌面环境而异。

**一致性定义：**角色身份、应用内交互、助手数据模型和确认机制一致；系统级展示按平台能力增强或降级。不得用模拟效果宣称系统能力已实现。

### 2.3 “关闭主窗口”必须区分隐藏和销毁

第一阶段复用 renderer 中现有模型、会话和工具链，因此桌面关闭主窗口时采取“隐藏到托盘”，不销毁主 renderer。托盘中的“退出 KOD”才真正结束进程。若销毁主 renderer，蒜宝 AI 会失去业务宿主；把模型编排迁到主进程属于后续演进。

### 2.4 AI 生图不能直接等同于可发布动画

生成模型无法稳定保证角色比例、透明边缘、动作衔接和多帧一致性。素材必须经过固定参考图、批量生成、人工审核、修整、切图、压缩和自动校验。运行时不临时生图，避免形象漂移、成本和审核风险。

### 2.5 默认启用与“用户主动开启”冲突

当前原型的默认设置是启用，但已确认的产品原则是首次由用户主动开启、默认克制。

**迁移规则：**

- 从未保存过蒜宝偏好的用户：默认关闭，由一次性引导主动开启；
- 已存在 `suanbao-preferences-v1:*` 的本地用户：保留原选择；
- 不因版本升级强制弹出蒜宝；
- 活跃模式、随机走动、主动搭话和声音全部默认关闭。

---

## 3. 目标、非目标与成功定义

### 3.1 产品目标

1. **角色直接交流：**气泡必须锚定蒜宝，用户感知是“蒜宝在说话”，而非打开普通客户端对话框。
2. **全页面可达：**蒜宝在 KOD 的首页、聊天、任务、图片生成、设置以外的业务页面均可出现；设置弹窗、全屏敏感流程可按规则暂时隐藏。
3. **桌面常驻：**Electron 主窗口最小化或关闭到托盘后，独立蒜宝窗口继续显示并可唤回主窗口。
4. **实用闭环：**待办、提醒、番茄钟、天气和日程均包含创建/查看/执行或完成/恢复等闭环，不只提供入口。
5. **安全可控：**AI 只能提出副作用操作草案，用户确认后才能写入或启动；删除、覆盖操作需要额外确认。
6. **离线可用：**模型不可用时，常见本地命令仍可解析，固定互动台词和表单功能仍可使用。
7. **平台诚实：**每个平台明确能力和降级，不虚构 iOS、Web 或 Linux 系统级悬浮能力。

### 3.2 第一阶段非目标

- iOS 跨 App 常驻悬浮；
- Android 系统级 Overlay 和前台服务；
- 运行时 AI 生成皮肤、表情或动作；
- 云同步和多设备冲突合并；
- 写入、修改或删除系统日历；
- Outlook、Google Calendar 等第三方 OAuth；
- 未确认即由 AI 执行有副作用操作；
- 亲密度、饥饿、商城、换装、道具和每日任务等养成经济系统；
- 默认声音、随机走动或主动打扰；
- 在第一阶段把完整模型调用栈迁移到 Electron 主进程。

### 3.3 成功定义

第一阶段完成必须同时满足：

- 应用内全页面覆盖和桌面独立窗口通过验收；
- 独立蒜宝会话不进入普通聊天列表；
- 五类实用能力形成可恢复的本地闭环；
- 模型、网络或权限失败时有明确降级；
- Desktop、Web、iOS、Android 的能力矩阵逐项验证；
- 无高等级数据泄漏、任意 IPC 或未确认副作用问题；
- 空闲状态不持续轮询，动画符合性能与减少动态效果要求。

---

## 4. 当前本地实现审计

### 4.1 已有能力

当前未提交代码可作为原型基线，主要包括：

| 能力 | 当前实现位置 | 评价 |
| --- | --- | --- |
| 根级挂载 | `src/renderer/routes/__root.tsx` | 路由切换不卸载，但仍在主 BrowserWindow 内 |
| 角色和动画 | `src/renderer/components/suanbao/SuanbaoPet.tsx`、`suanbao.css` | CSS 蒜头可作为正式素材前的 fallback |
| 拖拽与归一化位置 | `suanbaoUtils.ts` | 可复用算法，但缺多显示器和 DPI 信息 |
| 状态映射 | `suanbaoState.ts` | 已有 `idle/thinking/executing/success/error` 纯函数 |
| 快捷动作 | `suanbaoActions.ts`、`suanbaoPrompts.ts` | 可解释代码、分析错误、继续/新建聊天、取消 |
| 偏好 | `suanbaoStore.ts` | 有账户 namespace 和容错，但直接使用 `localStorage` |
| 设置页 | `src/renderer/routes/settings/suanbao.tsx` | 有启用、隐藏、动画和重置入口 |
| 中英文文案 | renderer i18n 的中英文 `translation.json` | 基础文案已覆盖，Prompt 和错误仍有硬编码英文 |
| 埋点 | `suanbaoAnalytics.ts` | 仅上报固定动作名，未上报用户内容 |
| 单元测试 | `src/renderer/components/suanbao/*.test.ts` | 已有 5 个文件、17 个逻辑测试 |

### 4.2 当前显示范围

`isSuanbaoRoute()` 只允许：

- `/`；
- `/session/*`；
- `/task` 和 `/task/*`。

因此图片生成等页面不可见。所谓“全局”目前只是“根 React 树中的路由受限 fixed 元素”，不是应用全页面，更不是系统桌面全局。

### 4.3 当前对话体验为何像客户端对话框

现有快捷 Prompt 会创建普通聊天会话、切换到 `/session/*`，再复用普通聊天生成链路。结果是：

- 打断当前页面；
- 污染普通聊天列表；
- 回答显示在完整聊天页，而非角色气泡；
- 没有独立角色短记忆；
- 桌面宠物窗口无法独立消费流式响应。

第一阶段必须建立独立的 `SuanbaoConversationService`，而不是继续让视图组件直接创建普通聊天。

### 4.4 当前平台缺口

当前没有蒜宝专属的：

- Electron 透明窗口、托盘菜单和 IPC；
- 独立 preload 或最小权限 API；
- 跨窗口 Activity 同步；
- 系统通知和后台调度；
- 定位、天气或生产日历服务；
- Capacitor 本地通知、定位和日历适配；
- 正式动作素材 manifest。

仓库中的天气工具只是模型测试样例，不是生产天气功能。日历生产能力目前不存在。

### 4.5 已发现的正确性问题

实施时先修复以下问题：

1. 路由 ID 通过 pathname 截取，未使用 TanStack Router params；
2. “最近聊天”受缓存分页和排序影响，不保证 `updatedAt` 最新；
3. 取消生成从 `Message.cancel` 推断，不能跨窗口，也可能修改错误消息；
4. 单击 220ms timer 与双击存在竞态；
5. Pointer Up 可能持久化 React state 的旧位置；
6. 初始像素位置 `{12, 12}` 可能导致角色闪跳；
7. `animation-off` 没有显式 CSS 类；
8. Prompt 和空输入错误固定英文；
9. 状态只观察当前路由的最后一条消息，不是全局 Activity；
10. 裸 `localStorage` 绕过 Platform Storage、SQLite、迁移和主进程可见性；
11. 默认启用违反“用户主动开启”；
12. 没有组件、Electron、移动和权限降级测试。

### 4.6 可保留和迁移的资产

- 保留 `SuanbaoVisual` 的 CSS 形象作为 fallback；
- 保留归一化位置换算纯函数，扩展显示器和安全区域；
- 保留状态映射、埋点动作白名单和现有测试思想；
- 复用 KOD 当前模型配置、provider、流式生成、工具与错误处理；
- 复用 Platform 抽象、存储后端、React Query 和现有 Electron IPC 模式；
- 把动作、Prompt、状态和偏好从组件目录迁入领域/服务层，而非删除重写。

---

## 5. 产品能力矩阵

符号：`完整` 为一期完整能力，`降级` 为能力受限但有明确替代，`不支持` 为系统限制且不伪装实现。

| 能力 | Desktop Electron | Web | iOS | Android |
| --- | --- | --- | --- | --- |
| KOD 所有业务页面内显示 | 完整 | 完整 | 完整 | 完整 |
| KOD 最小化后独立宠物 | 完整 | 不支持 | 不支持 | 一期不支持 |
| 跨其他 App 悬浮 | 完整，受 Linux 环境限制 | 不支持 | 不支持 | 一期不支持 |
| 角色气泡短对话 | 完整 | 完整 | 完整 | 完整 |
| 复杂结果展开 KOD | 完整 | 完整 | 完整 | 完整 |
| 拖拽/点击/双击/摸头 | 完整 | 完整 | 完整 | 完整 |
| 随机走动 | 活跃模式可选 | 应用内可选 | 应用内可选 | 应用内可选 |
| 静音/隐藏/锁定/重置 | 完整 | 完整 | 完整 | 完整 |
| 待办 | 完整 | 完整 | 完整 | 完整 |
| 提醒 | Electron 系统通知 | Web Notification，失败时应用内 | 本地通知 | 本地通知 |
| 番茄钟后台提醒 | 主进程调度 | 页面存活时调度，关闭后降级 | 本地通知调度 | 本地通知调度 |
| Open-Meteo 天气 | 完整 | 完整 | 完整 | 完整 |
| 定位 | 系统/浏览器授权或手动城市 | 浏览器授权或手动城市 | 原生授权或手动城市 | 原生授权或手动城市 |
| 本地日程 | 完整 | 完整 | 完整 | 完整 |
| 只读系统日历 | 无统一接口，降级本地日程 | 无统一接口，降级本地日程 | 原生适配 | 原生适配 |
| 后台主动对话 | 托盘驻留时可用，默认关闭 | 不可靠，不承诺 | 不允许，通知替代 | 通知替代 |
| 数据云同步 | 不支持 | 不支持 | 不支持 | 不支持 |

### 5.1 一致交互基线

所有平台必须提供：

- 相同的角色身份和核心视觉语义；
- 点击打开锚定角色的气泡；
- 相同的待办、提醒、番茄、天气和日程数据模型；
- 相同的结构化确认卡和取消机制；
- 相同的本地意图兜底；
- 相同的设置语义、隐私说明和数据删除入口。

### 5.2 Desktop 增强原则

桌面独立窗口是平台增强，不得反向改变应用内领域模型。独立窗口与应用内宿主消费同一套 ViewModel 和命令协议，不能复制一套业务逻辑。

---

## 6. 总体架构

### 6.1 分层

```text
┌────────────────────────────────────────────────────────────┐
│ Presentation Hosts                                         │
│ InAppHost · ElectronPetWindow · Bubble · Cards · Settings  │
└───────────────────────┬────────────────────────────────────┘
                        │ commands / view models
┌───────────────────────▼────────────────────────────────────┐
│ Application Services                                       │
│ Conversation · Intent · Assistant · Scheduler · Activity   │
└───────────────────────┬────────────────────────────────────┘
                        │ domain ports
┌───────────────────────▼────────────────────────────────────┐
│ Domain                                                     │
│ Commands · Operations · Pet State · Todo · Reminder · ...  │
└───────────────────────┬────────────────────────────────────┘
                        │ capability interfaces
┌───────────────────────▼────────────────────────────────────┐
│ Platform Capabilities                                      │
│ Storage · Overlay · Notification · Location · Calendar     │
└────────────────────────────────────────────────────────────┘
```

### 6.2 依赖规则

1. Domain 只依赖共享 TypeScript 类型，不依赖 React、Electron、DOM、Capacitor 或 Store。
2. Application Services 可依赖 Domain port 和现有模型调用适配器，不依赖具体 UI。
3. Platform 实现依赖接口，不把 Electron/Capacitor 类型泄漏给 Domain。
4. Presentation 只发送 Command、订阅 ViewModel，不直接操作聊天 Store、IPC channel 或原生插件。
5. Electron 主进程是桌面多窗口 broker 和系统能力宿主，不在一期重新实现模型编排。
6. 所有跨窗口消息必须可序列化，并通过 schema 校验。

### 6.3 建议目录

```text
src/shared/types/suanbao.ts
src/renderer/packages/suanbao/
  domain/
  services/
  repositories/
  intents/
  assets/
src/renderer/components/suanbao/
  SuanbaoVisual.tsx
  SuanbaoBubble.tsx
  SuanbaoConfirmationCard.tsx
  SuanbaoInAppHost.tsx
src/main/suanbao/
  window.ts
  broker.ts
  ipc-handlers.ts
  tray.ts
  scheduler.ts
src/preload/suanbao.ts
src/renderer/suanbao-window/
  index.html
  main.tsx
  SuanbaoWindowApp.tsx
```

### 6.4 核心服务

```ts
interface SuanbaoService {
  dispatch(command: SuanbaoCommand): Promise<SuanbaoOperation>
  confirm(operationId: string): Promise<SuanbaoOperation>
  cancel(operationId: string): Promise<void>
  subscribe(listener: (viewModel: SuanbaoViewModel) => void): () => void
}

interface SuanbaoConversationService {
  send(input: string): Promise<{ operationId: string }>
  cancel(operationId: string): Promise<void>
  clear(): Promise<void>
}

interface SuanbaoAssistantService {
  createDraft(intent: AssistantIntent): Promise<SuanbaoConfirmation>
  confirm(confirmationId: string): Promise<AssistantEntity>
}
```

---

## 7. 独立蒜宝 AI 会话

### 7.1 会话边界

蒜宝沿用用户当前有效的 KOD 模型供应商和模型，但使用独立存储：

- 独立角色 Prompt；
- 独立短记忆；
- 不创建普通 `chat` session；
- 不出现在普通聊天列表；
- 不读取用户最近普通聊天内容；
- 只有用户主动“展开到 KOD”时，才生成可见的普通聊天或结果页。

默认短记忆建议：最近 12 轮或 8,000 估算 token，取较小者；30 天未使用可清理。用户可在设置中立即清空。

### 7.2 角色 Prompt 原则

- 始终使用当前界面语言回答；
- 气泡回答默认不超过 160 个中文字符或等价长度；
- 不声称操作已经完成，除非收到确定性的执行结果；
- 涉及待办、提醒、番茄或日程时只输出结构化草案；
- 天气事实来自 WeatherService，不允许模型凭空生成；
- 不读取或上传系统日历详情，除非用户在当次交互中明确选择 AI 摘要；
- 复杂解释返回摘要和“在 KOD 中展开”动作。

### 7.3 对话流程

```text
用户输入
  ├─ 本地确定性命令匹配成功 ──> 结构化确认卡/直接无副作用响应
  └─ 未匹配 ──> 当前 KOD 模型
                    ├─ 普通短答 ──> 气泡流式显示
                    ├─ 工具意图 ──> 结构化确认卡
                    └─ 复杂内容 ──> 摘要 + 展开 KOD
```

### 7.4 本地意图兜底

模型未配置、断网、超额或请求失败时，至少支持：

- “开始/暂停/继续/停止番茄钟”；
- “下午三点提醒我开会”；
- “新增待办：提交周报”；
- “显示/隐藏/锁定/解锁蒜宝”；
- “今天天气”“今天有什么安排”；
- “打开聊天/图片生成/任务/设置”；
- 问候、感谢、摸头等固定离线台词。

本地解析只生成草案；时间含糊时必须追问，不能自行假定。

### 7.5 Operation 状态

```ts
type SuanbaoOperationStatus =
  | 'draft'
  | 'awaiting-confirmation'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled'

interface SuanbaoOperation {
  id: string
  command: SuanbaoCommand
  status: SuanbaoOperationStatus
  createdAt: number
  updatedAt: number
  errorCode?: string
}
```

取消使用 `operationId` 查找权威 AbortController。不得跨 IPC 传递 `Message.cancel` 等函数。

---

## 8. 宠物交互与动作系统

### 8.1 手势状态机

```text
pointerdown
  ├─ 移动超过阈值 ──> dragging ──> 保存最终位置
  ├─ 在双击窗口内第二次释放 ──> double-click action
  └─ 超时且未移动 ──> single-click bubble
```

实现要求：

- 使用 ref 保存最新 pointer 和像素位置；
- 新建单击 timer 前清理旧 timer；
- 拖拽结束从最终 pointer 坐标计算位置；
- 使用 hit region 区分头部、身体和附件；
- 拖动时不触发摸头或打开气泡；
- 触摸端适配 safe area、滚动和软键盘；
- 提供键盘操作、菜单中的重置位置和 `aria-live` 状态。

### 8.2 角色状态

```ts
type SuanbaoPetState =
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'executing'
  | 'success'
  | 'error'
  | 'reminding'
  | 'focus'
  | 'rest'
  | 'sleeping'
```

状态优先级建议：

1. 用户直接互动；
2. 错误和确认卡；
3. 提醒；
4. 执行/思考；
5. 番茄工作/休息；
6. 活跃模式随机动作；
7. idle。

高优先级动作可打断低优先级动作。成功/错误等瞬时状态结束后回到上一个持久状态，而非一律回 idle。

### 8.3 默认克制

默认设置：

- 不随机走动；
- 不主动搭话；
- 不播放声音；
- 不抢焦点；
- 不自动请求通知、定位或日历权限；
- 仅在用户互动或已确认提醒到期时显示气泡。

活跃模式需用户主动开启，并提供主动气泡频率、勿扰时段和“今天暂停”。

### 8.4 位置模型

应用内位置继续采用归一化坐标。桌面独立窗口扩展为：

```ts
interface SuanbaoPlacement {
  mode: 'in-app' | 'desktop'
  displayId?: string
  x: number
  y: number
  anchor: 'free' | 'bottom-left' | 'bottom-right'
  scaleFactor?: number
  locked: boolean
}
```

恢复时按当前 display work area、DPI 和窗口尺寸 clamp。显示器移除后迁移到主显示器可见区域。

---

## 9. AI 生图素材生产规范

### 9.1 生产流程

1. 确定官方角色设定：正侧背面、比例、颜色、芽、五官、阴影与禁用元素；
2. 使用 KOD 现有生图能力和固定 reference/seed 批量生成动作候选；
3. 人工筛选角色一致的候选；
4. 美术修整轮廓、透明边缘、帧间比例和接触点；
5. 切图、裁边、统一画布、压缩；
6. 运行 manifest 校验器检查文件、帧数、尺寸、锚点和 hit region；
7. 在 Desktop/Web/iOS/Android 真机预览；
8. 人工审核通过后随客户端发布。

运行时不调用生图服务。

### 9.2 目录和命名

```text
src/renderer/assets/suanbao/official-v1/
  manifest.json
  idle.webp
  blink.webp
  thinking.webp
  executing.webp
  success.webp
  error.webp
  pet-head.webp
  drag.webp
  focus.webp
  rest.webp
```

命名格式：`<state>-<variant>@<scale>.<ext>`。官方包必须包含最小 fallback 集合：`idle`、`thinking`、`executing`、`success`、`error`。

### 9.3 Manifest 示例

```json
{
  "schemaVersion": 1,
  "id": "official-v1",
  "canvas": { "width": 256, "height": 256 },
  "anchor": { "x": 0.5, "y": 0.94 },
  "hitRegions": {
    "head": { "x": 0.2, "y": 0.05, "width": 0.6, "height": 0.45 },
    "body": { "x": 0.12, "y": 0.35, "width": 0.76, "height": 0.58 }
  },
  "animations": {
    "idle": { "src": "idle.webp", "fps": 12, "loop": true },
    "success": { "src": "success.webp", "fps": 18, "loop": false }
  }
}
```

### 9.4 资源要求

- 主画布建议 256×256，另提供高分屏资源或矢量可替代元素；
- 默认优先 animated WebP；兼容性不足时使用 PNG sprite sheet；
- 单个常驻动画应控制解码和内存成本；
- 所有动作提供静态首帧，支持减少动态效果和加载失败；
- 透明边缘无黑边，锚点不能在动作间漂移；
- 素材记录生成模型、许可证、参考图来源、Prompt、审核人和版本；
- 未通过版权和品牌审核的资产不得进入发行包。

---

## 10. 数据模型与本机持久化

### 10.1 偏好

```ts
type SuanbaoAnimationLevel = 'full' | 'reduced' | 'off'

type SuanbaoPreferences = {
  schemaVersion: 2
  enabled: boolean
  hidden: boolean
  activeMode: boolean
  soundEnabled: boolean
  animation: SuanbaoAnimationLevel
  desktopOverlayEnabled: boolean
  notificationsEnabled: boolean
  locationMode: 'permission' | 'manual' | 'off'
  calendarEnabled: boolean
  doNotDisturb?: { start: string; end: string }
}
```

设置偏好进入统一 Settings/Platform Storage；窗口位置是设备态，单独存储，不进入未来可能的账号同步字段。

### 10.2 业务实体

```ts
type TodoItem = {
  id: string
  title: string
  completed: boolean
  dueAt?: number
  createdAt: number
  updatedAt: number
}

type Reminder = {
  id: string
  title: string
  triggerAt: number
  timezone: string
  recurrence?: ReminderRecurrence
  status: 'scheduled' | 'fired' | 'dismissed' | 'cancelled'
  platformScheduleId?: string
}

type PomodoroSession = {
  id: string
  phase: 'work' | 'short-break' | 'long-break'
  status: 'running' | 'paused' | 'completed' | 'cancelled'
  durationMs: number
  startedAt?: number
  endsAt?: number
  remainingMs?: number
  completedWorkCycles: number
}

type LocalCalendarEvent = {
  id: string
  title: string
  startsAt: number
  endsAt: number
  timezone: string
  notes?: string
}

type SystemCalendarProjection = {
  externalId: string
  calendarName: string
  title: string
  startsAt: number
  endsAt: number
  allDay: boolean
  fetchedAt: number
}

type WeatherLocation =
  | { type: 'coordinates'; latitude: number; longitude: number; label?: string }
  | { type: 'city'; name: string; countryCode?: string; latitude: number; longitude: number }
```

系统日历投影只读，不与本地日程混用 ID，也不提供写回方法。

### 10.3 存储分层

| 数据 | 存储 | 原因 |
| --- | --- | --- |
| 用户偏好 | Settings/Platform KV | 小型、版本化、跨宿主可读 |
| 窗口位置 | 设备级 Platform KV | 与显示器和 DPI 绑定 |
| 短会话 | Platform 数据库 | 独立、可查询和清理 |
| 待办/提醒/番茄/本地日程 | Platform 数据库 | 需要事务、索引和恢复 |
| 系统日历投影 | 短期缓存 | 可重新读取，不是权威数据 |
| 天气 | TTL 缓存 | 限流和离线展示 |
| Operation | 内存 + 必要恢复字段 | 运行态不应全部长期保存 |

Desktop/Web 使用现有 IndexedDB/Storage 抽象，移动使用现有 SQLite 适配。禁止新增业务代码直接访问 `localStorage`。

### 10.4 账户隔离

所有 repository key 或记录必须带稳定的 `accountKey`。一期继续兼容当前账户 key 机制，但它只是本地 namespace，不是安全边界。登出后卸载当前数据视图和调度；登录另一账户时不得展示前一账户的待办、日程或短记忆。

### 10.5 V1 偏好迁移

启动时执行一次：

1. 检查新存储是否已有 `schemaVersion: 2`；
2. 按当前账户查找 `suanbao-preferences-v1:<accountKey>`；
3. 清洗 enabled、hidden、position 和 animation；
4. 写入新偏好和设备位置；
5. 记录迁移标记；
6. 新存储写入成功后才删除旧 key，失败则保留以便重试。

没有 V1 数据时按“默认关闭”初始化。

---

## 11. 平台能力接口

```ts
type PermissionState = 'granted' | 'denied' | 'prompt' | 'unavailable'

type SuanbaoPlatformCapabilities = {
  overlay: 'desktop-window' | 'in-app'
  notifications: boolean
  backgroundScheduling: boolean
  geolocation: boolean
  systemCalendarRead: boolean
}

interface SuanbaoPlatformService {
  getCapabilities(): Promise<SuanbaoPlatformCapabilities>
  notifications: NotificationService
  location: LocationService
  calendar: ReadonlyCalendarService
  scheduler: BackgroundScheduler
  desktopPet?: DesktopPetWindowService
}
```

### 11.1 通知

```ts
interface NotificationService {
  getPermission(): Promise<PermissionState>
  requestPermission(): Promise<PermissionState>
  schedule(input: SystemNotification): Promise<string>
  cancel(scheduleId: string): Promise<void>
}
```

通知点击使用受控 deep link，如 `kod://suanbao/reminders/<id>`。不得接受任意 URL。

### 11.2 定位

```ts
interface LocationService {
  getPermission(): Promise<PermissionState>
  requestPermission(): Promise<PermissionState>
  getCurrentPosition(): Promise<{ latitude: number; longitude: number; accuracy?: number }>
}
```

用户可始终选择手动城市，不得把授权定位设为天气功能的强制条件。

### 11.3 只读日历

```ts
interface ReadonlyCalendarService {
  getPermission(): Promise<PermissionState>
  requestPermission(): Promise<PermissionState>
  listEvents(range: { from: number; to: number }): Promise<SystemCalendarProjection[]>
}
```

接口中不允许出现 create/update/delete 系统事件方法，确保一期从类型层面只读。

### 11.4 后台调度

调度存储绝对触发时间，而非依赖长期 `setTimeout`：

- Desktop：Electron 主进程负责调度；
- iOS/Android：本地通知插件调度；
- Web：页面存活时执行，关闭页面后不承诺，重开时进行过期补偿；
- 所有平台启动、恢复前台和时区变化时重新协调调度。

---

## 12. Electron 独立宠物窗口

### 12.1 窗口职责

独立窗口只负责：

- 渲染角色、气泡和确认卡；
- 发送可序列化命令；
- 订阅 Activity 和 ViewModel；
- 拖拽并上报位置；
- 唤回 KOD 主窗口。

它不直接读取凭据、文件系统、Sandbox、知识库或任意 IPC。

### 12.2 推荐窗口参数

```ts
new BrowserWindow({
  width: 360,
  height: 420,
  transparent: true,
  frame: false,
  resizable: false,
  show: false,
  skipTaskbar: true,
  alwaysOnTop: true,
  focusable: true,
  webPreferences: {
    contextIsolation: true,
    nodeIntegration: false,
    preload: suanbaoPreloadPath,
  },
})
```

具体尺寸随气泡状态切换。角色空闲时透明区域应点击穿透；气泡打开或指针位于角色命中区时接收输入。打开气泡不得无条件抢占其他应用焦点。

### 12.3 生命周期

```text
应用启动
  ├─ 蒜宝未启用 -> 不创建/不显示宠物窗口
  └─ 已启用 -> 创建隐藏窗口 -> ready-to-show 后显示

主窗口最小化/关闭
  -> 隐藏主窗口，保留主 renderer 和宠物窗口

托盘“退出 KOD”
  -> 标记真正退出 -> 清理调度/窗口/IPC -> app.quit()
```

macOS Dock、Windows 任务栏和 Linux 托盘行为按平台适配，但产品语义保持一致。

### 12.4 主 renderer 业务宿主

一期数据流：

```text
Pet Window -> typed IPC -> Main Broker -> Main Renderer SuanbaoService
Main Renderer -> Activity event -> Main Broker -> Pet Window
```

主窗口隐藏但 renderer 存活，因此继续复用模型调用、Store 和平台适配。后续若模型服务迁出 renderer，只替换 broker 后端，不改变 Pet Window 协议。

### 12.5 IPC 契约

建议显式 channel：

```text
suanbao:get-bootstrap
suanbao:dispatch-command
suanbao:confirm-operation
suanbao:cancel-operation
suanbao:update-placement
suanbao:set-interactive-region
suanbao:show
suanbao:hide
suanbao:open-main-window
suanbao:view-model-changed
suanbao:notification-clicked
```

要求：

- shared 类型和 runtime schema 同步定义；
- 输入文字限制长度，坐标必须为有限数并 clamp；
- operation ID、实体 ID 和 deep link 严格校验；
- 独立 preload 只暴露蒜宝 API，不复用通用 `ipcRenderer.invoke`；
- 拒绝任意 channel、文件路径、shell 命令和外部 URL；
- 高频拖拽和动画事件节流，不经 IPC 同步每一帧。

### 12.6 托盘菜单

- 显示/隐藏蒜宝；
- 打开 KOD；
- 暂停/恢复动画；
- 今天进入勿扰；
- 蒜宝设置；
- 退出 KOD。

菜单勾选状态随偏好更新。托盘“双击”保留为显示主窗口，避免与角色双击混淆。

### 12.7 多显示器和兼容性

- 保存 display ID、work area 和 scale factor；
- 拔掉显示器后迁移至主显示器可见区；
- 不覆盖任务栏、Dock 或系统安全区域；
- macOS 处理 Spaces 和全屏应用策略；
- Windows 验证透明窗口、缩放和多桌面；
- Linux 分别验证 X11 和 Wayland，Wayland 不支持的点击穿透/置顶行为允许明确降级；
- 全屏游戏或演示时默认隐藏，除非用户主动覆盖。

---

## 13. Presentation Hosts

### 13.1 应用内宿主

`SuanbaoInAppHost` 挂载在根级 UI shell，不再维护业务页面白名单。只在以下情况暂时隐藏：

- 用户禁用或隐藏；
- Settings Modal 正在配置蒜宝，避免双层交互；
- 全屏敏感流程显式声明 `suanbao: hidden`；
- Desktop 已启用独立窗口且设置为“不在主窗口重复显示”。

图片生成页面必须纳入默认显示范围。

### 13.2 气泡

气泡锚定角色，包含：

- 简短流式回复；
- 输入框和建议操作；
- 结构化确认卡；
- 当前番茄/提醒状态；
- “在 KOD 中展开”；
- 取消、重试、关闭。

气泡关闭不取消正在运行的 operation。再次打开可恢复当前状态。

### 13.3 确认卡

示例：

```text
蒜宝理解为：
  事项：开会
  时间：2026-08-03 15:00
  时区：Asia/Shanghai
[修改] [取消] [确认创建提醒]
```

确认卡必须展示所有会产生副作用的关键字段。解析不完整或时间歧义时不允许确认，必须补充信息。

### 13.4 快捷入口

至少支持打开：

- 新聊天；
- 最近聊天；
- 图片生成；
- 任务模式；
- 待办/提醒面板；
- 蒜宝设置。

路由通过受控 route ID 构建，不拼接未经校验的任意路径。

---

## 14. 实用助手设计

### 14.1 待办

能力闭环：

- 表单或自然语言创建草案；
- 用户确认后写入；
- 列表查看、完成/取消完成、编辑、删除；
- 可选截止时间；
- 到期项可生成提醒，但需单独确认；
- 删除操作二次确认；
- 应用重启和账户切换正确恢复。

### 14.2 提醒

- 支持一次性提醒；重复提醒可先支持每日/每周；
- 保存 IANA 时区和绝对触发时间；
- DST 或系统时区变化后重新计算重复规则；
- 调度成功后保存平台 schedule ID；
- 修改/删除时先取消旧调度，再以幂等事务创建新调度；
- 应用错过触发时间时按策略补发一次或标记过期，不无限补发；
- 通知点击打开对应气泡或主客户端详情。

### 14.3 番茄钟

默认 25 分钟工作、5 分钟短休息、4 轮后 15 分钟长休息，用户可配置。

- 启动、暂停、继续、跳过、停止；
- 运行时保存 `endsAt`，不以递减计数为权威；
- 重启后根据绝对时间恢复；
- 后台到期由系统通知；
- 气泡显示当前阶段和剩余时间；
- 同一账户同一设备只允许一个活动番茄钟；
- 开始和停止均通过确认卡，暂停/继续可直接执行。

### 14.4 天气

数据源：

- Open-Meteo Geocoding API：手动城市转经纬度；
- Open-Meteo Forecast API：当前和短期预报；
- 无 API Key，不增加服务端代理。

策略：

- 首次使用时让用户选择“授权定位”或“手动城市”；
- 定位只在用户操作或缓存过期时获取，不持续追踪；
- 当前天气缓存建议 15 分钟，预报缓存 60 分钟；
- 失败时显示最后成功数据及更新时间；
- 离线且无缓存时明确提示不可用；
- WeatherService 输出结构化事实，模型只可选地转述；
- Open-Meteo 使用和署名要求在产品与法律评审中确认。

### 14.5 日程

#### 本地日程

所有平台完整支持创建、编辑、删除和提醒；数据仅本机。

#### 系统日历

- iOS/Android：经按需授权后只读未来事件；
- Desktop/Web：没有统一系统日历 API，第一阶段明确降级为本地日程；
- 系统事件不提供编辑、删除或写回；
- 默认使用本地模板生成“今天有 3 个日程”摘要；
- 若用户主动要求模型总结，确认将发送哪些字段，默认排除参与者、位置、备注和会议链接；
- 权限被拒后不重复强制弹窗，保留“去设置授权”和本地日程入口。

### 14.6 AI 操作事务

所有副作用采用两阶段：

```text
parse -> draft -> user confirm -> execute -> deterministic result
```

每个确认卡有 idempotency key。重复点击确认不得创建两条提醒或待办。执行失败时卡片显示可重试状态，不能让模型自行宣称成功。

---

## 15. 权限、隐私与安全

### 15.1 最小权限

- 启动时不批量申请权限；
- 用户首次启用通知、定位或系统日历时分别解释并申请；
- 权限被拒后对应能力降级，其他功能继续工作；
- 设置页展示每项权限状态和重新授权方法；
- 系统日历只读从接口和原生权限两层约束。

### 15.2 数据出站规则

| 数据 | 默认是否发送给模型 | 规则 |
| --- | --- | --- |
| 蒜宝普通输入 | 是 | 使用用户当前 KOD 模型配置 |
| 待办/提醒草案 | 必要时 | 本地能解析则不发送 |
| 精确位置 | 否 | 只发 Open-Meteo，不发模型 |
| 天气结构化事实 | 可选 | 仅用于用户请求的自然语言总结 |
| 系统日历详情 | 否 | 需当次明确确认后最小化发送 |
| 代码/错误内容 | 是，用户主动触发 | 沿用 KOD 模型隐私说明 |

### 15.3 埋点

可记录：动作 ID、平台、成功/失败错误码、耗时区间、入口。禁止记录：

- Prompt 和回复正文；
- 代码和错误内容；
- 经纬度和城市明文；
- 待办、提醒、日程标题；
- 系统日历详情；
- 文件路径和会议链接。

继续遵循应用统计同意开关。

### 15.4 Electron 安全

- 宠物窗口 `contextIsolation: true`、`nodeIntegration: false`；
- 使用独立最小 preload；
- 不复用通用任意 `invoke`；
- IPC payload 做 runtime schema 校验；
- 禁止宠物窗口导航到外部来源；
- 设置严格 CSP；
- deep link 使用 allowlist；
- 宠物窗口不获得文件、Shell、Sandbox、凭据和任意网络代理权限；
- 主 renderer 崩溃或未就绪时，宠物窗口进入本地离线模式，而非无限重试。

---

## 16. 设置设计

设置分组：

### 显示

- 启用蒜宝；
- 应用内显示；
- Desktop 桌面独立窗口；
- 隐藏/恢复；
- 锁定位置；
- 恢复默认位置；
- 动画：完整/简化/关闭；
- 活跃模式；
- 声音；
- 勿扰时段。

### 助手

- 默认番茄时长；
- 通知权限和开关；
- 天气位置：定位/手动城市/关闭；
- 系统日历只读权限；
- 清空蒜宝短记忆；
- 删除全部本机蒜宝数据。

### 隐私

- 当前使用的模型与供应商；
- 哪些数据可能发送给模型；
- Open-Meteo 数据请求说明；
- 系统日历默认本地摘要说明；
- 埋点开关继承应用全局设置。

不支持的能力应显示明确原因或隐藏；不得展示可点击但永远失败的开关。

---

## 17. 增量代码落点

### 17.1 新增模块

| 模块 | 职责 |
| --- | --- |
| `src/shared/types/suanbao.ts` | 可跨层序列化的领域与 IPC 类型 |
| `src/renderer/packages/suanbao/domain/` | 状态、命令、实体、纯函数 |
| `src/renderer/packages/suanbao/services/` | 对话、意图、助手、Activity、调度协调 |
| `src/renderer/packages/suanbao/repositories/` | 偏好和业务实体持久化 |
| `src/main/suanbao/window.ts` | Electron 宠物窗口生命周期 |
| `src/main/suanbao/broker.ts` | 主 renderer 与宠物窗口消息路由 |
| `src/main/suanbao/ipc-handlers.ts` | 类型化 IPC 注册和校验 |
| `src/main/suanbao/scheduler.ts` | Desktop 提醒/番茄调度 |
| `src/preload/suanbao.ts` | 宠物窗口最小 API |
| `src/renderer/suanbao-window/` | 独立窗口 renderer 入口 |

### 17.2 修改模块

- `src/renderer/routes/__root.tsx`：挂载能力驱动的 InAppHost；
- `src/renderer/components/suanbao/`：拆分纯展示、气泡、卡片和手势；
- `src/renderer/routes/settings/suanbao.tsx`：扩展设置和权限状态；
- `src/renderer/platform/interfaces.ts`：增加通知、位置、日历、调度和桌面窗口能力；
- Desktop/Web/Mobile/Test Platform：实现或明确 unavailable；
- `src/main/main.ts`：注册蒜宝模块、调整关闭到托盘生命周期；
- `src/preload/index.ts`、`src/shared/electron-types.ts`：仅为主 renderer 增加必要 broker 契约；
- `electron.vite.config.ts`：增加独立 preload/renderer 入口；
- i18n 中英文源文案和错误 key；
- Settings schema/defaults/migration；
- 移动插件与权限声明。

### 17.3 当前文件迁移策略

| 当前文件 | 策略 |
| --- | --- |
| `SuanbaoPet.tsx` | 拆为 Visual、Bubble、Host；保留现有外观逻辑 |
| `suanbao.css` | 保留 fallback，按组件拆分并补充 off/reduced-motion |
| `suanbaoUtils.ts` | 迁入 Domain，扩展 safe area 和 display placement |
| `suanbaoState.ts` | 改为消费 Activity，不再读取 Message[] |
| `suanbaoActions.ts` | 迁入 Application Services，移除视图对 Store 的直接调用 |
| `suanbaoPrompts.ts` | 迁入对话服务，支持 locale 和角色约束 |
| `suanbaoStore.ts` | 增加兼容迁移后由 Platform repository 替代 |
| `suanbaoAnalytics.ts` | 保留白名单思想，扩充无敏感字段的结果事件 |

所有现有未提交修改视为基线，实施只做增量修正；删除或替换前先完成等价迁移和测试。

---

## 18. 实施里程碑

“一次性交付”表示第一阶段最终范围不拆成多个产品版本，不表示采用不可验证的大爆炸开发。工程上按以下依赖顺序连续推进，每一步保持可运行。

### M1：原型正确性与全页面宿主

- 修复手势、拖拽、路由和 i18n 问题；
- 移除业务页面白名单，图片生成页可见；
- 默认关闭与 V1 偏好兼容；
- 增加组件测试和能力开关。

**退出条件：**所有 KOD 业务页面可稳定显示；现有能力无回归。

### M2：领域层、独立会话和 Activity

- 建立 shared 类型、Command、Operation、Activity；
- 建立独立短会话和角色 Prompt；
- 使用 operation ID 取消；
- 完成本地意图兜底和确认卡；
- 复杂结果展开主客户端。

**退出条件：**气泡可独立短聊，不产生普通聊天记录；模型失败时本地命令可用。

### M3：统一存储和实用助手核心

- V1 偏好迁移；
- Platform repository；
- 待办、提醒、本地日程 CRUD；
- 番茄状态机和重启恢复；
- 幂等确认事务。

**退出条件：**四类本地业务功能通过重启、账户切换和重复确认测试。

### M4：天气、权限与系统日历

- Open-Meteo Geocoding/Forecast 和缓存；
- 定位/手动城市；
- 移动只读系统日历；
- Desktop/Web 明确降级；
- 权限设置和隐私提示。

**退出条件：**天气和日程在所有平台按矩阵工作，权限拒绝不阻塞其他功能。

### M5：Electron 独立窗口和托盘

- 独立 renderer/preload；
- 窗口、broker、IPC schema；
- 透明、置顶、点击穿透、位置和多显示器；
- 关闭到托盘；
- 宠物窗口气泡和主窗口唤回。

**退出条件：**Windows/macOS/Linux 支持环境达到验收；主窗口隐藏后蒜宝和 AI 宿主继续运行。

### M6：系统通知和后台协调

- Electron Notification 和主进程调度；
- Web Notification 降级；
- iOS/Android 本地通知；
- 通知点击 deep link；
- 过期补偿、时区变化和权限拒绝。

**退出条件：**提醒和番茄在各平台按能力矩阵触达，并可从通知恢复上下文。

### M7：正式素材、质量与发布开关

- 素材 manifest 和 fallback；
- 动作状态机、摸头和活跃模式；
- 性能、无障碍、隐私和真机测试；
- 灰度/功能开关和回滚策略。

**退出条件：**满足第 19 节全部验收，不存在阻断发布问题。

---

## 19. 验收标准

### 19.1 通用验收

- [ ] 用户未主动开启时蒜宝不自动出现；
- [ ] 开启后，首页、聊天、任务、图片生成及其他业务页面均可见；
- [ ] 点击蒜宝直接打开锚定角色的气泡，不自动跳转聊天页；
- [ ] 普通短答在气泡中流式显示，复杂回答提供“在 KOD 中展开”；
- [ ] 蒜宝对话不出现在普通聊天列表；
- [ ] 拖拽、单击、双击和摸头不会互相误触；
- [ ] 完整、简化和关闭动画均生效，系统减少动态效果优先；
- [ ] 隐藏、锁定、重置位置、静音和勿扰设置可恢复；
- [ ] 活跃模式默认关闭；
- [ ] 模型不可用时，本地番茄、待办、提醒、显隐和导航命令可用；
- [ ] AI 不能在未确认时创建、修改、删除或启动有副作用功能；
- [ ] 重复确认不会产生重复实体；
- [ ] 账户切换后不泄漏上一账户数据；
- [ ] 清空短记忆和删除全部本机蒜宝数据有效。

### 19.2 实用助手验收

- [ ] 待办可创建、查看、编辑、完成、取消完成和删除；
- [ ] 提醒可创建、修改、取消、触发并从通知打开；
- [ ] 番茄可启动、暂停、继续、跳过、停止，重启后时间正确；
- [ ] 天气支持授权定位和手动城市，离线显示缓存及更新时间；
- [ ] Open-Meteo 失败时不由模型虚构天气；
- [ ] 本地日程在所有平台可写；
- [ ] iOS/Android 经授权只读系统日历；
- [ ] Desktop/Web 明确提示系统日历不可用并提供本地日程；
- [ ] 日历权限拒绝后不循环索权；
- [ ] 默认不向模型发送系统日历详情。

### 19.3 Desktop 验收

- [ ] 独立窗口透明、无边框、置顶且不在任务栏出现；
- [ ] 主窗口最小化或关闭后隐藏到托盘，蒜宝继续显示；
- [ ] 仅托盘“退出 KOD”或明确退出操作终止进程；
- [ ] 角色空白透明区域不阻挡其他应用操作；
- [ ] 气泡打开时可正常输入，不无故抢焦点；
- [ ] 多显示器、DPI 变化和显示器拔插后角色保持可见；
- [ ] 托盘可显示/隐藏蒜宝、打开 KOD、暂停动画和退出；
- [ ] 宠物窗口无通用 IPC、文件系统或 Sandbox 权限；
- [ ] Windows 与 macOS 完整验证；Linux X11 完整验证，Wayland 不支持项有明确降级说明。

### 19.4 Web 验收

- [ ] 应用内交互与通用基线一致；
- [ ] 浏览器通知支持时可授权触达；
- [ ] 不支持或拒绝通知时使用应用内提醒；
- [ ] 关闭页面后不宣称提醒必达；
- [ ] 重开页面后正确处理过期提醒和番茄；
- [ ] 多标签页不重复触发同一提醒。

### 19.5 iOS/Android 验收

- [ ] 应用内交互与通用基线一致；
- [ ] 横竖屏、safe area、软键盘和返回导航正常；
- [ ] 本地通知权限按需申请；
- [ ] App 后台时提醒和番茄由系统通知触达；
- [ ] 通知点击恢复正确的蒜宝上下文；
- [ ] 定位和只读日历分别授权、分别降级；
- [ ] iOS 不显示或宣传跨 App 悬浮；
- [ ] Android 一期不请求系统 Overlay 权限。

### 19.6 性能与无障碍

- [ ] 空闲时无高频 JS timer、网络轮询或 IPC；
- [ ] 动画关闭时空闲 CPU 接近无蒜宝基线；
- [ ] 独立窗口内存和启动耗时满足发布预算；
- [ ] 拖拽 IPC 节流；
- [ ] 角色和气泡可由键盘操作；
- [ ] 状态通过 `aria-live` 可读；
- [ ] 200% 缩放、高对比度和减少动态效果可用；
- [ ] 触摸目标符合移动端可用尺寸。

---

## 20. 测试矩阵

### 20.1 单元测试

- Command/Intent parser；
- 时间、时区、重复提醒计算；
- Operation 状态和幂等；
- 宠物动作优先级和手势状态机；
- Placement clamp 和多显示器迁移；
- V1 偏好迁移及损坏数据；
- Activity reducer；
- Open-Meteo 映射与缓存 TTL；
- 权限和 capability gating；
- IPC runtime schema；
- 数据脱敏和埋点白名单。

### 20.2 Renderer 组件与集成测试

- 全路由显示、设置弹窗隐藏；
- 单击/双击/拖拽/摸头；
- 气泡流式、关闭后恢复、取消和重试；
- 确认卡修改、取消、重复确认；
- 独立会话不污染普通聊天；
- 模型成功、未配置、断网、超额和异常；
- 账户切换、重启恢复和数据删除；
- 天气/日历权限拒绝和离线降级。

### 20.3 Electron 测试

- Window manager 纯逻辑单测；
- IPC broker 和权限边界；
- 创建、显示、隐藏、销毁；
- 关闭到托盘和真正退出；
- 点击穿透、焦点和气泡 resize；
- 多显示器和 DPI；
- 通知调度和点击；
- 主 renderer 尚未就绪或崩溃；
- 单实例和应用更新期间的生命周期。

少量关键路径使用 Playwright Electron E2E，并在 Windows、macOS、Linux CI/真机分别验证。

### 20.4 移动真机测试

- iOS 当前与最低支持版本；
- Android 13+ 通知权限及最低支持版本；
- 前后台、进程恢复、系统时区改变；
- 权限拒绝、永久拒绝、去设置后返回；
- 本地通知点击和重复调度；
- 系统日历空数据、大量数据和取消授权；
- 低电量、网络切换、横竖屏和软键盘。

### 20.5 安全与隐私测试

- IPC fuzz 和未授权 channel；
- deep link 注入；
- 宠物窗口外部导航；
- Prompt、位置、日程和待办不进入埋点；
- 日历最小字段发送确认；
- 账户隔离和删除数据；
- Open-Meteo 请求不携带账户和聊天内容。

---

## 21. 风险与缓解

| 风险 | 等级 | 缓解 |
| --- | --- | --- |
| 多窗口状态不一致 | 高 | 主进程 broker、单一业务宿主、operation ID、全量 bootstrap + 增量事件 |
| Electron 透明窗口跨 OS 差异 | 高 | 分平台实现和真机矩阵；Wayland 明确降级 |
| 移动后台限制 | 高 | 使用本地通知和绝对时间恢复，不承诺常驻 JS |
| 日历隐私 | 高 | 默认本地摘要、只读接口、当次明确授权、字段最小化 |
| AI 误操作 | 高 | 草案—确认—执行两阶段，幂等键，确定性结果 |
| 提醒重复/丢失 | 高 | 权威本地记录、平台 schedule ID、启动协调、重复消费幂等 |
| 现有聊天链路耦合 | 中 | 独立 ConversationService，复用模型适配而非普通聊天实体 |
| 素材风格漂移 | 中 | 固定 reference/seed、人工修整、manifest 校验和版本审核 |
| 默认打扰用户 | 中 | 新用户默认关闭，活跃/声音默认关闭，勿扰和当日暂停 |
| Open-Meteo 可用性 | 中 | TTL 缓存、最后成功数据、超时和离线降级 |
| 本地存储迁移失败 | 中 | 写新后删旧、迁移标记、可重试、损坏数据清洗 |
| 性能和耗电 | 中 | 无轮询、动画预算、后台交给系统、IPC 节流 |

---

## 22. 架构决策记录

### ADR-001：应用内一致、桌面增强

**决定：**所有平台提供应用内蒜宝；Desktop 增加独立窗口。
**原因：**这是操作系统约束下唯一诚实、可维护的一致性模型。

### ADR-002：一期主 renderer 作为 AI 业务宿主

**决定：**主窗口关闭时隐藏而不销毁，模型编排继续在主 renderer。
**原因：**最大化复用现有模型、会话和工具链，降低一期重构风险。
**代价：**主 renderer 崩溃时 AI 不可用；后续可迁往独立服务宿主。

### ADR-003：独立蒜宝短会话

**决定：**不复用当前普通聊天，不污染普通会话列表。
**原因：**建立清晰角色边界，支持气泡交互和短记忆。

### ADR-004：所有副作用确认后执行

**决定：**AI 只生成草案，用户确认后由确定性服务执行。
**原因：**自然语言解析存在不确定性，提醒和日程误操作会直接伤害信任。

### ADR-005：业务数据仅本机

**决定：**一期不做账号云同步。
**原因：**避免服务端依赖、冲突合并和隐私扩张，先验证产品价值。

### ADR-006：系统日历只读

**决定：**本地日程可写，系统日历只读；Desktop/Web 降级。
**原因：**降低权限、误改和平台适配风险。

### ADR-007：设计期生图、人工审核后发布

**决定：**运行时不临时生成角色资产。
**原因：**保证品牌一致、性能、审核和成本可控。

### ADR-008：新用户默认关闭

**决定：**用户主动开启后才显示，已有 V1 选择迁移保留。
**原因：**符合克制默认，避免升级惊扰。

---

## 23. 后续演进，不纳入一期验收

- 将模型编排迁入主进程或独立本地服务，使主 renderer 可真正销毁；
- Android 系统 Overlay 和前台服务可行性/商店政策专项；
- iOS Widget 和 Live Activity；
- 第三方日历 OAuth；
- 可选的端到端加密云同步；
- 换装、道具、亲密度和每日任务；
- 用户自定义离线素材包；
- 多角色与团队角色包；
- 语音输入、TTS 和唤醒词；
- 基于用户明确授权的工作状态自适应。

这些能力必须单独立项，不能以“竞品有”直接加入一期范围。

---

## 24. 小组实施检查清单

开始编码前：

- [ ] 确认产品能力矩阵和平台降级文案；
- [ ] 确认移动端日历插件的维护状态与只读权限；
- [ ] 确认通知、定位的 iOS/Android 权限声明；
- [ ] 确认 Electron 独立入口与 CSP 方案；
- [ ] 确认独立短会话是否需要数据导出入口；
- [ ] 确认 Open-Meteo 署名和隐私文案；
- [ ] 美术确认角色设定和素材 manifest；
- [ ] 测试确认各平台真机和 CI 矩阵；
- [ ] 安全评审 IPC、deep link 和日历数据出站；
- [ ] 为每个里程碑建立可回滚 feature flag。

完成定义：只有第 19 节验收项全部满足，或由负责人明确记录平台豁免及原因，第一阶段才能标记完成。
