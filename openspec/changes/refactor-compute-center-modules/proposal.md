## Why

KOD 算力中心的页面、卡时业务组件和 API 客户端分别增长到约 4,000 行、1,740 行和 1,350 行，市场、资产、订单、供应方、管理员与卡时交易职责相互耦合，缺少页面级行为测试，继续迭代很容易造成登录、资金、订单、安全或跨平台回归。现在需要先冻结现有外观和业务契约，再按领域拆分并补齐自动化保护，为后续产品优化建立可维护基础。

## What Changes

- 在不改变现有界面、导航、权限、接口路径、请求字段和业务流程的前提下，将算力中心拆分为市场、卡时、资产、购买、订单、供应方、通知和管理员领域模块。
- 将 `packages/computeCenter.ts` 拆分为共享请求客户端、统一查询键、领域 API 与领域类型，并保留原入口作为兼容门面。
- 提取统一的操作反馈、卡时不足补足、刷新、格式化和状态映射逻辑。
- 在移动代码前补充特征测试，并覆盖 API 契约、权限、资金、订单、敏感凭证和四端构建。
- 增加同一写操作的客户端重复提交保护、写请求结果未知提示、异步状态收敛和领域级错误隔离。
- 仅立即修复会导致登录失败、错误扣款、重复下单、数据泄露、页面崩溃或永久加载的问题；其他缺陷另建 OpenSpec change。
- 自动化测试使用模拟后端和隔离数据；真实 `kod` 数据库仅执行登录、商品、资产等只读冒烟检查。
- **不包含破坏性变更。** 不新增后端接口、数据库字段、状态管理框架或运行时依赖。

## Capabilities

### New Capabilities

- `compute-center-client-reliability`: 定义算力中心在模块化重构期间必须保持的外部行为、异步收敛、重复提交防护、敏感数据保护、权限隔离和四端兼容要求。

### Modified Capabilities

- 无。当前 OpenSpec 主规格中没有既有算力中心能力；本变更不改变已有产品业务规则。

## Impact

- 主要影响 `src/renderer/routes/compute-center.tsx`、`src/renderer/components/compute/CardHourBusiness.tsx` 和 `src/renderer/packages/computeCenter.ts`。
- 新增路由私有领域目录、拆分后的 `packages/compute-center/` 客户端模块，以及算力中心专用测试夹具和测试文件。
- 保持 TanStack Router、React Query、Mantine、`authInfoStore` 与 `Platform` 抽象不变。
- 后端、数据库、官网钱包、零售站/节点流程、客户端对话和生图均不在本变更的实现范围内。
- Windows、Web、Android 和 iOS 共用渲染代码；Windows 可完成桌面实测，iOS 原生编译与真机验收需要 macOS/Xcode 或 macOS CI。
