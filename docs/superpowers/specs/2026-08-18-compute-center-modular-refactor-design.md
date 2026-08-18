# KOD 算力中心模块化重构设计

日期：2026-08-18

状态：待用户书面审阅

OpenSpec 变更：[`refactor-compute-center-modules`](../../../openspec/changes/refactor-compute-center-modules/)

## 1. 目标与验收口径

本次不是重新设计产品，而是在保留现有功能、界面和业务契约的前提下，把算力中心从难以验证的超大文件拆成可维护、可测试、可逐步回滚的领域模块。第一阶段只处理算力中心，同时拆分页面、卡时业务组件和 API 客户端。

验收成功必须同时满足：

1. 未登录浏览、购买方、已认证供应方、管理员和叠加角色看到的页面、入口与权限和重构前一致。
2. 商品、卡时、资产、购买记录、订单、设备、供应方、通知、管理员等现有流程继续调用相同后端路径和字段。
3. 同一写操作在未结束前不会由客户端重复提交；结果未知时不会自动重发资金或订单请求。
4. 所有异步操作均能结束加载状态，单个领域崩溃不会拖垮整个算力中心。
5. Token 套餐 API Key 等敏感信息不进入持久缓存、日志、通知、URL 或测试产物。
6. 自动化测试完全使用模拟后端；真实环境仅做经白名单约束的非业务写入冒烟检查。
7. Windows、Web、Android、iOS 共享 renderer 均能构建；iOS 原生编译和真机验收在 macOS/Xcode 或 macOS CI 完成。

## 2. 第一性原理审视

### 2.1 “不改变任何行为”与“立即修复关键缺陷”存在天然冲突

如果错误扣款、重复下单、敏感数据泄露、永久加载本身就是当前行为，那么修复它们必然改变行为。因此准确边界不是“零行为变化”，而是：除明确允许的六类关键缺陷外，用户可见行为和后端契约保持不变。每个允许变化都必须先有失败测试和复现证据，最终在交付报告中逐项列出。

### 2.2 客户端防重不能等价于资金和订单的“恰好一次”

禁用按钮、action lock 和禁止自动重试可以显著降低重复请求，但网络断开时客户端无法知道服务端是否已经提交。真正的资金级恰好一次需要服务端幂等键、唯一约束和事务共同保障，而本变更明确不修改后端和数据库。因此本阶段承诺的是“客户端不主动重复提交 + 结果未知先核对”，不能承诺绝对不会出现服务端重复订单。后端幂等应作为独立变更评估。

### 2.3 “真实数据库只读验证”与实际登录可能不完全兼容

商品和资产查询可以严格限制为读取，但一次真实登录可能创建会话、更新最后登录时间或写入审计日志。除非后端实现被证明确实无写入，否则不能把“提交用户名和密码登录”称为严格只读。真实冒烟默认复用现有会话，只验证登录状态；如必须验证凭证登录，应明确标记为“无业务数据变更但可能写会话/审计元数据”，并先审查后端实现。

### 2.4 一台 Windows 机器无法完成四端同等级原生验收

共享 TypeScript renderer 可以在 Windows 上为四种目标构建，Android 也可在工具链齐备时原生编译；但 iOS 原生编译、签名与真机运行需要 macOS/Xcode。任何只执行 `mobile:sync:ios` 后声称“iOS 已完整验证”的结论都不成立。交付报告必须拆分“renderer 构建”“Capacitor 同步”“原生编译”“真机验收”四种证据。

## 3. 选择的方案

采用“领域模块 + 兼容门面”方案，不进行大爆炸式重写。

```text
compute-center route shell
  ├─ shared page components
  ├─ shared hooks / pure utils
  └─ feature modules
      ├─ market
      ├─ card-hours
      ├─ assets
      ├─ purchases
      ├─ orders
      ├─ supplier
      ├─ notifications
      └─ admin
              │
              ▼
       domain API modules
              │
              ▼
 shared client / query keys / types
              │
              ▼
        existing KOD backend
```

原 `src/renderer/packages/computeCenter.ts` 保留为兼容门面，只重导出拆分后的符号。这样每个领域可以独立迁移、测试和回滚，不要求一次改完所有调用方。

未选择的方案：

- 继续在三个超大文件内做局部函数提取：短期改动少，但查询、权限、交互和渲染仍相互耦合，不能解决测试隔离问题。
- 一次性重写算力中心：代码最终可能更整洁，但难以证明没有丢失已有业务规则，资金和权限风险过高。
- 引入新全局状态或微前端：会同时增加运行时依赖、跨端差异和迁移面，与本阶段“行为冻结”目标相反。

## 4. 目标代码结构

### 4.1 页面层

```text
src/renderer/routes/
├── compute-center.tsx
└── compute-center/
    ├── -components/
    ├── -hooks/
    ├── -utils/
    └── -features/
        ├── market/
        ├── card-hours/
        ├── assets/
        ├── purchases/
        ├── orders/
        ├── supplier/
        ├── notifications/
        └── admin/
```

路由入口只负责身份上下文、固定资产顶栏、一级导航和领域 Error Boundary。每个 feature 对自己的查询组合、加载/空/错误态和交互负责，但不得导入其他 feature 的私有实现。

### 4.2 API 层

```text
src/renderer/packages/compute-center/
├── client.ts
├── queryKeys.ts
├── account.ts
├── marketplace.ts
├── cardHours.ts
├── packages.ts
├── reservations.ts
├── supplier.ts
├── notifications.ts
├── admin.ts
├── types.ts
└── index.ts
```

依赖方向固定为：路由 shell → feature → feature hook → 领域 API → shared client。API 不依赖 React，纯工具不依赖 store、浏览器全局或网络，领域模块不从兼容门面反向导入。

## 5. 数据与交互设计

### 5.1 查询与缓存

现有 React Query 键先由测试冻结，再集中到 `queryKeys.ts`。迁移早期保持原键形状和失效语义，避免新旧组件读取不同缓存。过宽失效只有在测试证明安全后才能收窄。

### 5.2 防止重复操作

`useComputeActionController` 以稳定 action key 管理执行中状态。例如购买套餐使用商品 ID，GPU 预订还包含时段。相同 key 运行中只允许一个请求，不同商品或安全的只读操作仍可并行。

写响应丢失或达到终止上限时进入“结果未知”：停止转圈，不自动重发，提示用户先刷新资产、购买记录或订单。若已有接口支持请求标识，则人工确认重试复用原标识；不支持时不虚构幂等能力。

### 5.3 卡时不足的补足流程

所有现有卡时消费入口走同一控制器：

```text
卡时足够 ──────────────→ 执行原操作
卡时不足、人民币足够 ─→ 显示精确缺口 → 用户确认 → 精确补足 → 原操作续跑一次
卡时不足、用户取消 ───→ 零写入并结束
两种余额均不足 ───────→ 显示人民币缺口 → 用户确认后打开官网钱包
```

补足成功后原操作失败不会触发第二次自动补足。取消或关闭确认框不得兑换、扣款或下单。

### 5.4 错误和超时

错误归为本地校验、业务拒绝、认证、传输和未知程序错误。归类不改写服务端业务错误码，只决定反馈、脱敏和重试策略。普通读取使用 30 秒客户端终止上限，材料读取/上传使用 120 秒；写请求超时只判为结果未知，不判为业务失败。

所有用户操作必须在成功、失败、取消、超时或卸载时释放加载状态。市场、资产、订单、供应方和管理员等区域由独立 Error Boundary 隔离。

## 6. 安全设计

- 完整 Token 套餐 API Key 只在用户主动显示时获取，只存在于当前组件内存。
- 隐藏、切换套餐、离开页面、退出登录或卸载时立即清空完整 Key。
- API Key、登录令牌、身份证号、证件图片 URL、SSH 密码/私钥、上游密钥和数据库凭证统一脱敏。
- 这些值不得进入 React Query 持久缓存、localStorage、通知文案、URL、错误上报和测试 fixture。
- 非管理员既不显示管理员入口，也不得发送管理员数据请求；供应方权限继续与购买方权限叠加。
- 外链、剪贴板、文件和平台识别只通过现有 Platform/adapters，不在业务组件中直接调用 Electron/Capacitor 专属 API。

## 7. 测试策略

按风险从底向上建立四层保护：

1. API 契约：路径、方法、字段、鉴权头、响应解析、错误码和兼容导出。
2. Hook 与业务规则：角色派生、查询键、失效范围、防重、补足一次、结果未知、卸载清理。
3. 组件特征：标签、导航、角色入口、商品、资产、购买记录、订单交付和错误边界。
4. 安全回归：凭证按需显示、生命周期清理、日志/错误脱敏和非管理员不请求管理数据。

自动化环境默认禁止真实网络，未模拟请求直接失败。真实环境冒烟是独立命令，需显式配置并由路径/方法白名单拦截任何资金、订单、转让、提现、交付、审核或资料写入。

四端验证证据分开记录：

| 平台 | 本地门禁 | 额外门禁 |
|---|---|---|
| Windows | `pnpm build`、桌面人工冒烟 | 无 |
| Web | `pnpm build:web`、浏览器关键流程 | 无 |
| Android | `pnpm mobile:sync:android` | 工具链可用时 Gradle 编译/模拟器冒烟 |
| iOS | `pnpm mobile:sync:ios` | macOS/Xcode 或 macOS CI 原生编译和真机验收 |

## 8. 迁移顺序与回滚

1. 记录现有检查结果，先写特征测试和模拟 transport。
2. 移动类型、client、query keys，再按领域拆 API；旧文件作为兼容门面。
3. 提取错误、脱敏、状态映射、卡时补足和 action controller。
4. 按行情/市场 → 通知 → 购买记录 → 资产 → 订单 → 供应方 → 管理员 → 卡时业务顺序迁移。
5. 将路由收敛为 shell，安装领域 Error Boundary。
6. 做关键缺陷定向审计；仅六类关键缺陷允许随本变更最小修复，其他问题创建独立 OpenSpec change。
7. 执行静态检查、测试、四端构建和真实环境受限冒烟。

每个领域单独提交。如果某一步回归，可回退该领域提交并继续走兼容门面，不涉及数据库和后端回滚。

## 9. 实施阶段的硬边界

- 不改数据库、不补表、不迁移真实数据。
- 不更改官网钱包、登录、零售站/节点、对话、生图、生视频的业务实现。
- 不改变页面布局、文案、标签顺序或用户流程，关键缺陷的明确修复除外。
- 不把真实数据库用于自动化写入测试。
- 不因“顺手优化”处理非关键缺陷。
- 不在缺少 macOS/Xcode 证据时宣称 iOS 原生验收通过。

## 10. 对应 OpenSpec 产物

- [变更提案](../../../openspec/changes/refactor-compute-center-modules/proposal.md)
- [可靠性规格](../../../openspec/changes/refactor-compute-center-modules/specs/compute-center-client-reliability/spec.md)
- [技术设计](../../../openspec/changes/refactor-compute-center-modules/design.md)
- [实施任务清单](../../../openspec/changes/refactor-compute-center-modules/tasks.md)

用户批准本书面设计后，下一步才是使用 Superpowers `writing-plans` 生成逐文件、逐测试、带验证命令的实施计划；在批准前不开始修改业务代码。
