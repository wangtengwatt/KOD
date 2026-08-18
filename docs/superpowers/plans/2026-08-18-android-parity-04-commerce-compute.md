# 阶段四：钱包、算力交易、供应方和管理后台

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` (recommended) or `superpowers:executing-plans` to execute this plan task by task.

**Goal:** 在 Android 跑通与 Windows 相同的钱包、卡时、Token 套餐、GPU 商品、供应方、收益、邀请、通知和管理员业务，所有金额与状态均来自现有后端账本。

**Architecture:** 共享 API/领域层处理 DTO、错误码、幂等键、余额补差和状态机；Windows 与 Android 使用同一服务；移动页面重排为列表、详情、分步表单和底部操作栏；双管理员约束和交易不变量由后端强制。

**Tech Stack:** TypeScript、React、Vitest、Spring Boot、JUnit、MySQL、Capacitor Browser/App lifecycle。

**Spec:** `docs/superpowers/specs/2026-08-18-android-full-client-parity-design.md`

**Related refactor:** `docs/superpowers/plans/2026-08-18-compute-center-modular-refactor.md`

---

## Task 1：冻结钱包与算力 API 契约

**Client files:**

- Modify: `src/renderer/api/wallet.ts`
- Modify: `src/renderer/packages/computeCenter.ts`
- Create: `src/renderer/packages/compute/contracts.ts`
- Create: `src/renderer/packages/compute/contracts.test.ts`

**Backend files:**

- Create: `src/test/java/com/kod/controller/ComputeContractTest.java`
- Modify only when contract mismatch is proven: `src/main/java/com/kod/controller/ComputeCenterController.java`
- Modify only when contract mismatch is proven: `src/main/java/com/kod/controller/ComputeCardHourMarketController.java`

**Steps:**

1. 写客户端 schema 测试和后端 MockMvc 契约测试，固定金额单位、四位卡时精度、角色、GPU/套餐/订单/收益状态、错误码和 requestId。
2. Run: `pnpm exec vitest run src/renderer/packages/compute/contracts.test.ts` and `./mvnw -Dtest=ComputeContractTest test`
   Expected: 至少一端因未统一 schema/枚举失败。
3. 用显式 decoder 将未知可选字段降级，缺少关键金额/ID 直接报 `CONTRACT_MISMATCH`；后端只做向前兼容补充，不改现有资金表。
4. Run 两端测试，Expected: PASS。
5. Commit client: `git commit -m "refactor(compute): share wallet and marketplace contracts"`; backend if changed: `git commit -m "fix(api): stabilize compute contracts"`。

## Task 2：统一官网充值返回和主动余额刷新

**Client files:**

- Modify: `src/renderer/routes/settings/wallet.tsx`
- Modify: `src/renderer/utils/wallet.utils.ts`
- Create: `src/renderer/packages/wallet/RechargeReturnCoordinator.ts`
- Create: `src/renderer/packages/wallet/RechargeReturnCoordinator.test.ts`
- Modify: `src/renderer/platform/mobile_platform.ts`

**Steps:**

1. 写失败测试：打开 `https://kod.kai.com/console/wallet`；应用回到前台后按退避刷新；余额变化显示成功，无变化不伪报；刷新失败保留旧展示并可重试。
2. Run: `pnpm exec vitest run src/renderer/packages/wallet/RechargeReturnCoordinator.test.ts`
   Expected: FAIL。
3. 使用系统浏览器和 App resume 事件；刷新从现有钱包 API 读取，绝不把 URL 回调参数当余额。
4. Android 与 Windows 的“刷新官网余额”使用同一 coordinator；退出账号取消轮询。
5. Run 测试和 `src/renderer/api/wallet.test.ts`，Expected: PASS。
6. Commit: `git commit -m "feat(wallet): refresh balance after website recharge"`

## Task 3：覆盖所有卡时消耗操作的人民币补差

**Client files:**

- Create: `src/renderer/packages/compute/CardHourPurchaseCoordinator.ts`
- Create: `src/renderer/packages/compute/CardHourPurchaseCoordinator.test.ts`
- Modify: `src/renderer/components/compute/CardHourBusiness.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`

**Backend files:**

- Extend: `src/test/java/com/kod/service/ComputeCenterTopUpQuoteTest.java`
- Modify: `src/main/java/com/kod/service/ComputeCenterService.java`

**Steps:**

1. 写失败测试覆盖 GPU 购买、Token 套餐和卡时转让：卡时足够直接确认；卡时不足但人民币足够时只兑换缺口；两者不足时显示所差人民币并询问跳转充值；取消时不扣款。
2. 后端测试同一幂等键重试不重复兑换/购买，兑换和购买同一事务完成，金额四舍五入规则固定。
3. Run client/backend tests，Expected: FAIL。
4. 实现 quote—confirm—execute 协调器；用户必须主动确认，前端不串联两个可部分成功的请求；后端事务接口原子完成补差和业务操作。
5. Run tests，Expected: PASS。
6. Commit client: `git commit -m "feat(compute): confirm RMB shortfall purchases"`; backend: `git commit -m "fix(compute): atomically exchange and purchase"`。

## Task 4：移动端算力中心完整信息架构

**Client files:**

- Split/modify: `src/renderer/routes/compute-center.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeMobileShell.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeAssetOverview.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeMarket.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeOrders.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeSupplier.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeAdmin.tsx`
- Create: `src/renderer/components/compute/mobile/ComputeMobileShell.test.tsx`

**Steps:**

1. 写失败测试：顶部固定显示邮箱、购买方/认证供应方/管理员标签、人民币、可用/冻结卡时、累计/租金/佣金收益；一级模块包含市场、卡时资产、我的资产、购买记录、我的订单、我的设备、通知。
2. 测试角色组合：普通购买方、购买方+供应方、三角色管理员；供应方仍能购买；管理员入口只在后端角色存在时显示。
3. Run: `pnpm exec vitest run src/renderer/components/compute/mobile/ComputeMobileShell.test.tsx`
   Expected: FAIL。
4. 复用共享 hooks/DTO，按手机重排而不复制数据获取；资产、GPU 状态和常用功能合入“我的资产”；管理后台入口只保留固定顶部按钮。
5. Run test and `pnpm run check`，Expected: PASS。
6. Commit: `git commit -m "feat(android): deliver complete mobile compute center"`

## Task 5：Token 套餐交付、密钥和模型限制

**Client files:**

- Create: `src/renderer/components/compute/TokenPackageAsset.tsx`
- Create: `src/renderer/components/compute/TokenPackageAsset.test.tsx`
- Modify: `src/renderer/packages/computeCenter.ts`

**Backend files:**

- Create: `src/test/java/com/kod/service/ComputePackageProxyServiceTest.java`
- Modify: `src/main/java/com/kod/service/ComputePackageProxyService.java`
- Modify: `src/main/java/com/kod/controller/ComputePackageProxyController.java`

**Steps:**

1. 写失败测试：购买记录交付到“我的资产/Token 套餐”；显示购买模型、输入/输出剩余额度、Base URL、掩码 Key、API 格式、认证字段和分别复制按钮。
2. 后端测试代理 Key 只能调用购买模型；修改 model 返回稳定错误；最后一次超额请求完整返回并记账，下一次拒绝；生图和普通对话不走套餐 Key。
3. Run client/backend tests，Expected: FAIL。
4. 客户端复制完整 Key 必须走阶段二 reauth/reveal；Base URL 可直接复制；Key 不写日志、同步 payload 或剪贴板历史控制范围外缓存。
5. Run tests，Expected: PASS。
6. Commit client: `git commit -m "feat(compute): show secure Token package delivery"`; backend: `git commit -m "fix(proxy): enforce purchased model quotas"`。

## Task 6：GPU 商品、一次性交付与 24 小时结算

**Client files:**

- Create: `src/renderer/components/compute/GpuOrderDetail.tsx`
- Create: `src/renderer/components/compute/GpuOrderDetail.test.tsx`
- Modify: `src/renderer/packages/computeDeliveryTime.ts`
- Modify: `src/renderer/packages/computeImageUpload.ts`

**Backend files:**

- Create: `src/test/java/com/kod/service/ComputeOrderLifecycleTest.java`
- Modify: `src/main/java/com/kod/service/ComputeCenterService.java`
- Modify: `src/main/java/com/kod/service/ComputeSettlementTask.java`
- Modify: `src/main/java/com/kod/util/ComputeDeliveryCrypto.java`

**Steps:**

1. 写状态机失败测试：商品含图片；买方提交 SSH 公钥；供应方填写地址/端口/用户名并安装买方公钥；平台不接收供应方私钥；买方确认或交付后 24 小时无争议自动结算。
2. 测试争议暂停结算、重复确认幂等、超时任务并发只结算一次、交付凭证 30 天删除、所有权隔离。
3. Run client/backend tests，Expected: FAIL。
4. Android 分步呈现商品详情、订单、交付、确认、争议；供应方页面明确提示“只填写自己的服务器信息，不上传私钥”。
5. Run tests，Expected: PASS。
6. Commit client: `git commit -m "feat(compute): complete GPU order delivery on mobile"`; backend: `git commit -m "fix(compute): settle one-time GPU orders safely"`。

## Task 7：供应方、实名、设备、收益、邀请和提现申请

**Client files:**

- Create: `src/renderer/components/compute/mobile/SupplierOnboarding.tsx`
- Create: `src/renderer/components/compute/mobile/AssetAndEarnings.tsx`
- Create: `src/renderer/components/compute/mobile/ReferralCenter.tsx`
- Create: `src/renderer/components/compute/mobile/supplier-flow.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx`

**Backend files:**

- Extend: `src/test/java/com/kod/service/ComputeReferralServiceTest.java`
- Create: `src/test/java/com/kod/service/ComputeSupplierFlowTest.java`
- Modify: `src/main/java/com/kod/service/ComputeReferralService.java`
- Modify: `src/main/java/com/kod/service/ComputeTrustService.java`

**Steps:**

1. 写失败测试覆盖实名材料、人工审核、供应方申请、设备待审核/部署中/运行中/待处理、商品发布、累计收益/租金收益、回购为人民币余额、提现申请/记录。
2. 邀请测试：邀请码与登录邀请分离；仅被邀请人首次充值按比例返一次；7 天后发人民币钱包；退款不追扣；通知双方；幂等执行。
3. Run client/backend tests，Expected: FAIL。
4. 页面在提交后把反馈显示于当前视口；敏感证件只显示脱敏状态，不在 Android 公共相册缓存。
5. Run tests，Expected: PASS。
6. Commit client: `git commit -m "feat(android): deliver supplier assets and referral flows"`; backend: `git commit -m "test(compute): enforce supplier and referral invariants"`。

## Task 8：管理员后台、双人审核与全局通知

**Client files:**

- Create: `src/renderer/components/compute/mobile/AdminDashboard.tsx`
- Create: `src/renderer/components/compute/mobile/AdminDashboard.test.tsx`
- Modify: `src/renderer/stores/toastActions.ts`
- Modify: `src/renderer/packages/toast.ts`

**Backend files:**

- Create: `src/test/java/com/kod/service/ComputeAdminAuthorizationTest.java`
- Modify: `src/main/java/com/kod/service/ComputeCenterService.java`

**Steps:**

1. 写失败测试：管理员能看实名、供应方、设备、商品、订单、争议、提现和运营设置；本人提交的数据必须由另一管理员审核；非管理员直接调 API 返回 403。
2. 写客户端反馈测试：所有成功浅绿、失败浅红、顶部居中自上而下进入、3 秒关闭、支持 × 和点击空白关闭；表单错误自动滚动/聚焦到字段。
3. Run tests，Expected: FAIL。
4. 后端基于 userId 强制双人规则；前端只负责解释原因和刷新计数，不把隐藏按钮当授权。
5. Run tests，Expected: PASS。
6. Commit client: `git commit -m "feat(android): add usable compute admin and global feedback"`; backend: `git commit -m "fix(admin): enforce dual-operator review"`。

## Task 9：蒜宝移动权限降级

**Client files:**

- Create: `src/renderer/platform/suanbao/mobile-controller.ts`
- Create: `src/renderer/platform/suanbao/mobile-controller.test.ts`
- Modify: `src/renderer/components/suanbao/SuanbaoRuntimeHost.tsx`
- Modify: `src/renderer/routes/settings/suanbao.tsx`
- Modify: `src/renderer/platform/mobile_platform.ts`

**Steps:**

1. 写失败测试：悬浮窗、无障碍、文件访问默认关闭；逐项解释用途；拒绝任一权限后对话、生图、视频、算力中心仍可进入。
2. Run: `pnpm exec vitest run src/renderer/platform/suanbao/mobile-controller.test.ts`
   Expected: FAIL。
3. 实现 Capacitor/Android 原生权限桥；只在用户点击对应能力时请求，不在首启批量索权。
4. Run 测试与 Suanbao 回归测试，Expected: PASS。
5. Commit: `git commit -m "feat(android): add opt-in Suanbao permissions"`

## 阶段验收

- 同一账号在 Windows/Android 看到一致角色、资产、收益、GPU 状态、订单和通知。
- 充值返回刷新、人民币补差、套餐购买、GPU 交付和供应方结算在隔离环境均跑通。
- 非管理员无法通过直调 API 获得后台数据；本人无法审核本人提交项。
- Android 页面无重复零售站/节点选择器，无顶部不可见反馈，无超长单页表单。
