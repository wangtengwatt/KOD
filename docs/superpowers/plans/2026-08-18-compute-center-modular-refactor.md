# KOD Compute Center Modular Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在不改变 KOD 算力中心现有界面、权限、接口和业务流程的前提下，把页面、卡时业务和 API 客户端拆成可独立测试的领域模块，并修复登录失败、错误扣款、重复下单、数据泄露、页面崩溃或永久加载这六类关键问题。

**Architecture:** 采用“领域 feature + 领域 API + 兼容门面”的渐进迁移结构。`compute-center.tsx` 最终只保留身份上下文、固定顶栏、一级导航和领域错误边界；`packages/computeCenter.ts` 最终只重导出新 API 模块，保证旧调用路径在迁移期不失效。

**Tech Stack:** TypeScript、React、Mantine、TanStack Router、TanStack React Query、ofetch、Vitest、Testing Library、jsdom、Electron Vite、Capacitor。

**Spec:** `docs/superpowers/specs/2026-08-18-compute-center-modular-refactor-design.md`；正式 OpenSpec 位于 `openspec/changes/refactor-compute-center-modules/`。

## Global Constraints

- 实施前完整阅读 `docs/superpowers/specs/2026-08-18-compute-center-modular-refactor-design.md`、`openspec/changes/refactor-compute-center-modules/specs/compute-center-client-reliability/spec.md` 和 `openspec/changes/refactor-compute-center-modules/design.md`。
- 实施时使用 `.agents/skills/openspec-apply-change/SKILL.md`；每完成一个可验证任务，再勾选 `openspec/changes/refactor-compute-center-modules/tasks.md` 中对应项目。
- 不修改后端、数据库、官网钱包、登录体系、零售站/节点、对话、生图或生视频业务。
- 不改变现有界面布局、中文文案、标签顺序、角色叠加规则、请求路径、HTTP 方法、请求字段和响应解释；六类关键缺陷的明确修复除外。
- 不新增运行时依赖或全局状态框架；继续使用 React Query、Mantine、TanStack Router、`authInfoStore` 和现有 Platform/adapters。
- 普通读取终止上限为 30 秒；实名认证材料等文件读取/上传终止上限为 120 秒；写请求超时必须显示“结果尚未确认”，不得自动重试。
- 自动化测试完全使用模拟后端和虚构 fixture；默认未模拟网络请求必须立即失败。
- 真实环境冒烟仅允许现有会话下的配置、商品和账户资产读取；不得提交资金、订单、转让、提现、交付、审核、实名认证或设备写请求。
- Windows 和 Web 生产构建、Android/iOS renderer 构建必须通过；iOS 原生编译、签名和真机验收必须在 macOS/Xcode 或 macOS CI 完成。
- 每个任务执行红—绿 TDD 循环并形成独立提交；不得把不相关格式化或用户已有改动带入提交。

---

## File Map

### API 与可靠性基础层

- `src/renderer/packages/compute-center/types.ts`：现有算力中心公开类型的唯一来源。
- `src/renderer/packages/compute-center/client.ts`：鉴权、终止上限、响应解包、错误归类，不包含领域路径。
- `src/renderer/packages/compute-center/queryKeys.ts`：现有 React Query 键的唯一工厂。
- `src/renderer/packages/compute-center/{account,marketplace,cardHours,packages,reservations,supplier,notifications,admin}.ts`：领域 API。
- `src/renderer/packages/compute-center/index.ts`：新公开入口。
- `src/renderer/packages/computeCenter.ts`：旧路径兼容重导出门面。

### 页面与 feature 层

- `src/renderer/routes/compute-center.tsx`：最终页面 shell。
- `src/renderer/routes/compute-center/-components/`：Hero、反馈层、补足确认、通用表格和领域错误边界。
- `src/renderer/routes/compute-center/-hooks/`：操作控制、根查询和临时敏感值生命周期。
- `src/renderer/routes/compute-center/-utils/`：格式化、状态标签、权限/标签派生和脱敏。
- `src/renderer/routes/compute-center/-features/{market,card-hours,assets,purchases,orders,supplier,notifications,admin}/`：领域 UI 和领域查询组合。
- `src/renderer/components/compute/CardHourBusiness.tsx`：旧组件路径兼容重导出门面。
- `src/renderer/routes/compute-center/-test/`：虚构 fixture、模拟 transport 和测试 provider。

### 验证层

- `scripts/compute-center-readonly-smoke.ts`：严格 GET 白名单真实环境冒烟。
- `src/renderer/packages/compute-center/readonlySmoke.test.ts`：白名单和敏感输出测试。
- `docs/superpowers/verification/compute-center-modular-refactor.md`：最终四端证据和未执行项。

---

### Task 1: 建立隔离测试设施和角色基线

**Files:**
- Create: `src/renderer/routes/compute-center/-test/fixtures.ts`
- Create: `src/renderer/routes/compute-center/-test/mockComputeTransport.ts`
- Create: `src/renderer/routes/compute-center/-test/mockComputeTransport.test.ts`
- Create: `src/renderer/routes/compute-center/-test/renderCompute.tsx`
- Create: `src/renderer/routes/compute-center/-utils/presentation.ts`
- Create: `src/renderer/routes/compute-center/-utils/presentation.test.ts`

**Interfaces:**
- Produces: `makeComputeAccount(overrides?: Partial<ComputeAccount>): ComputeAccount`
- Produces: typed factories `makeGpuProduct`、`makeApiProduct`、`makePackagePurchase`、`makeNotification`、`makeReservation`、`makeCardHourTopUpQuote`、`makeAdminIdentity`、`makeAdminNode`、`makeAdminProduct`、`makeRedemption`.
- Produces: `installComputeFetchMock(routes: MockComputeRoute[]): MockedFunction<typeof fetch>`
- Produces: `makeQueryClient()`、`ComputeTestProvider`、`renderCompute(ui: ReactElement): RenderResult`.
- Produces: `installAdminReadRoutes`、`installCardHourPublicRoutes`、`installCardHourAuthenticatedRoutes`，都只使用虚构响应。
- Produces: `getVisibleComputeTabs(isLoggedIn: boolean): readonly ComputeTabDefinition[]`
- Produces: `getComputeRoleLabels(account?: ComputeAccount): string[]`

- [ ] **Step 1: 写模拟 transport 的失败测试**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installComputeFetchMock } from './mockComputeTransport'

afterEach(() => vi.unstubAllGlobals())

describe('installComputeFetchMock', () => {
  it('rejects every unregistered network request', async () => {
    installComputeFetchMock([])
    await expect(fetch('https://kod.invalid/api/compute/orders')).rejects.toThrow(
      'Unhandled compute test request: GET /api/compute/orders'
    )
  })

  it('returns a KOD envelope for an exact method and path', async () => {
    installComputeFetchMock([{ method: 'GET', path: '/api/compute/products', data: [] }])
    const response = await fetch('https://kod.invalid/api/compute/products')
    await expect(response.json()).resolves.toEqual({ code: 0, message: '', data: [] })
  })
})
```

- [ ] **Step 2: 运行测试并确认因模块不存在而失败**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-test/mockComputeTransport.test.ts`

Expected: FAIL，提示无法解析 `./mockComputeTransport`。

- [ ] **Step 3: 实现严格模拟 transport**

```ts
import { vi, type MockedFunction } from 'vitest'

export interface MockComputeRoute {
  method: 'GET' | 'POST' | 'PUT' | 'DELETE'
  path: string
  data?: unknown
  code?: number
  message?: string
  status?: number
}

export function installComputeFetchMock(routes: MockComputeRoute[]): MockedFunction<typeof fetch> {
  const mock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url)
    const method = String(init?.method || 'GET').toUpperCase()
    const route = routes.find((item) => item.method === method && item.path === `${url.pathname}${url.search}`)
    if (!route) throw new Error(`Unhandled compute test request: ${method} ${url.pathname}${url.search}`)
    return new Response(
      JSON.stringify({ code: route.code ?? 0, message: route.message ?? '', data: route.data ?? null }),
      { status: route.status ?? 200, headers: { 'Content-Type': 'application/json' } }
    )
  })
  vi.stubGlobal('fetch', mock)
  return mock
}
```

- [ ] **Step 4: 实现完整虚构账户 fixture 和测试 provider**

```tsx
// fixtures.ts
export function makeComputeAccount(overrides: Partial<ComputeAccount> = {}): ComputeAccount {
  return {
    userId: 10001,
    email: 'buyer@example.invalid',
    cnyBalance: 100,
    availableCardHours: 10,
    frozenCardHours: 0,
    lifetimeIncome: 0,
    lifetimeConsumption: 0,
    rentalIncome: 0,
    rentalIncomeCnyEquivalent: 0,
    commissionIncome: 0,
    pendingCommission: 0,
    totalIncomeCny: 0,
    invitedCount: 0,
    apiSalesIncome: 0,
    withdrawableCardHours: 0,
    supplierStatus: 'NONE',
    identityStatus: 'NONE',
    isAdmin: false,
    roles: ['BUYER'],
    deviceCounts: { PENDING: 0, DEPLOYING: 0, RUNNING: 0, PENDING_ACTION: 0 },
    gpuAssetCounts: {
      PENDING: 0,
      REJECTED: 0,
      RUNNING: 0,
      PENDING_DELIVERY: 0,
      ACTIVE_RENTAL: 0,
      PENDING_ACTION: 0,
      OFFLINE: 0,
    },
    cardHourCnyRate: 1.002,
    cardHourRedeemRate: 1,
    unitName: '卡时',
    currency: 'CNY',
    unreadNotifications: 0,
    ...overrides,
  }
}

// renderCompute.tsx
export function makeQueryClient() {
  return new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })
}

export function ComputeTestProvider({ children }: React.PropsWithChildren) {
  const [client] = React.useState(makeQueryClient)
  return (
    <MantineProvider>
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    </MantineProvider>
  )
}

export function renderCompute(ui: React.ReactElement) {
  return render(<ComputeTestProvider>{ui}</ComputeTestProvider>)
}
```

在同一个 `fixtures.ts` 中增加以下完整虚构工厂；测试只通过这些工厂创建业务对象：

```ts
const NOW = '2026-08-18T00:00:00Z'

export const makeGpuProduct = (overrides: Partial<ComputeProduct> = {}): ComputeProduct => ({
  id: 1, productType: 'GPU', name: 'H100 GPU 套餐', description: '隔离测试商品', region: '上海',
  status: 'PUBLISHED', gpuModel: 'H100', gpuMemoryGb: 80, gpuCount: 1, pricePerGpuHour: 1,
  packageDurationHours: 24, deliveryDeadlineHours: 12, createTime: NOW, ...overrides,
})

export const makeApiProduct = (overrides: Partial<ComputeProduct> = {}): ComputeProduct => ({
  ...makeGpuProduct(), id: 2, productType: 'API', name: 'KOD 测试 API 套餐', region: 'KAI 公司中转站',
  modelId: 'deepseek-v4-pro', packagePromptTokens: 100_000, packageCompletionTokens: 50_000,
  packagePriceCardHours: 1, gpuModel: null, gpuMemoryGb: null, gpuCount: null, pricePerGpuHour: null,
  ...overrides,
})

export const makePackagePurchase = (
  overrides: Partial<ComputePackagePurchase> = {}
): ComputePackagePurchase => ({
  id: 11, productId: 2, productName: 'KOD 测试 API 套餐', orderNo: 'PKG-TEST-11',
  modelId: 'deepseek-v4-pro', promptTokensTotal: 100_000, promptTokensRemaining: 100_000,
  completionTokensTotal: 50_000, completionTokensRemaining: 50_000, priceCardHours: 1,
  status: 'ACTIVE', keyStatus: 'ACTIVE', accessKeyLast4: 'abcd',
  baseUrl: 'https://proxy.example.invalid/v1', apiFormat: 'OpenAI',
  authenticationHeader: 'Authorization: Bearer', endpoints: ['/chat/completions'], createTime: NOW,
  ...overrides,
})

export const makeNotification = (overrides: Partial<ComputeNotification> = {}): ComputeNotification => ({
  id: 4, notificationType: 'ORDER', title: '测试通知', content: '虚构通知内容',
  referenceType: 'ORDER', referenceId: 'TEST-1', isRead: 0, createTime: NOW, ...overrides,
})
export const makeUnreadNotification = () => makeNotification({ isRead: 0 })
export const makeReadNotification = () => makeNotification({ isRead: 1, readTime: NOW })

export const makeReservation = (overrides: Partial<ComputeReservation> = {}): ComputeReservation => ({
  id: 21, orderId: 101, productId: 1, buyerUserId: 10001, supplierUserId: 10002,
  buyerEmail: 'buyer@example.invalid', supplierEmail: 'supplier@example.invalid', gpuCount: 1,
  startTime: '2026-08-18T08:00:00Z', endTime: '2026-08-19T08:00:00Z', unitRateSnapshot: 1,
  frozenCardHours: 24, settledCardHours: 0, status: 'DELIVERED', nodeId: 7, nodeName: 'H100-test',
  deliveryInfo: 'ssh -p 22022 test-user@gpu.example.invalid', deliveredAt: NOW,
  tradeMode: 'MARKETPLACE_FIXED', packageDurationHours: 24, productName: 'H100 GPU 套餐',
  gpuModel: 'H100', createTime: NOW, ...overrides,
})
export const makeDeliveredReservation = () => makeReservation({ status: 'DELIVERED' })
export const makeConfirmedReservation = () => makeReservation({ status: 'COMPLETED', buyerConfirmedAt: NOW })

export const makeCardHourTopUpQuote = (
  overrides: Partial<CardHourTopUpQuote> = {}
): CardHourTopUpQuote => ({
  requiredCardHours: 10, availableCardHours: 8, shortageCardHours: 2, purchaseCardHours: 2,
  cardHourCnyRate: 1.002, cnyCost: 2.004, cnyBalance: 100, cnyShortfall: 0, canAutoTopUp: true,
  ...overrides,
})

export const makeAdminIdentity = (overrides: Partial<ComputeIdentity> = {}): ComputeIdentity => ({
  id: 31, userId: 10002, email: 'supplier@example.invalid', verificationType: 'TEST',
  identityNoMasked: '110101********1234', realName: '内测用户甲', status: 'PENDING', createTime: NOW,
  ...overrides,
})

export const makeAdminNode = (overrides: Partial<ComputeGpuNode> = {}): ComputeGpuNode => ({
  id: 7, supplierUserId: 10002, email: 'supplier@example.invalid', nodeName: 'H100-test', region: '上海',
  gpuModel: 'H100', gpuMemoryGb: 80, gpuCount: 1, cpuDescription: 'test-cpu', ramGb: 256,
  storageGb: 2048, networkDescription: 'test-network', status: 'PENDING', isTest: true, createTime: NOW,
  ...overrides,
})

export const makeAdminProduct = (overrides: Partial<ComputeProduct> = {}) =>
  makeGpuProduct({ id: 41, supplierUserId: 10002, status: 'PENDING', ...overrides })

export const makeRedemption = (overrides: Partial<CardHourRedemption> = {}): CardHourRedemption => ({
  id: 31, redemptionNo: 'RDM-TEST-31', buyerUserId: 10001, supplierUserId: 10002,
  buyerEmail: 'buyer@example.invalid', supplierEmail: 'supplier@example.invalid', nodeId: 7,
  nodeName: 'H100-test', gpuModel: 'H100', gpuCount: 1, startTime: '2026-08-18T08:00:00Z',
  endTime: '2026-08-18T10:00:00Z', buyerPublicKey: 'ssh-ed25519 TEST_ONLY', bookedGpuHours: 2,
  rateVersion: 'v1', rateMultiplier: 1, specificHoursFrozen: 0, standardHoursFrozen: 2,
  status: 'DELIVERED', deliveryInfo: 'test delivery', createTime: NOW, ...overrides,
})
```

在 `mockComputeTransport.ts` 中提供组合路由，避免测试自行漏配或接触真实网络：

```ts
export function installAdminReadRoutes(input: {
  identity?: ComputeIdentity[]
  nodes?: ComputeGpuNode[]
  products?: ComputeProduct[]
} = {}) {
  return installComputeFetchMock([
    { method: 'GET', path: '/api/compute/admin/overview', data: {} },
    { method: 'GET', path: '/api/compute/admin/identities', data: input.identity || [] },
    { method: 'GET', path: '/api/compute/admin/nodes', data: input.nodes || [] },
    { method: 'GET', path: '/api/compute/admin/suppliers', data: [] },
    { method: 'GET', path: '/api/compute/admin/products', data: input.products || [] },
    { method: 'GET', path: '/api/compute/admin/reservations', data: [] },
    { method: 'GET', path: '/api/compute/admin/transfers', data: [] },
    { method: 'GET', path: '/api/compute/admin/upstreams', data: [] },
    { method: 'GET', path: '/api/compute/admin/proxy-keys/suspended', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/admin/deposits', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/admin/redemptions', data: [] },
  ])
}

export function installCardHourPublicRoutes() {
  return installComputeFetchMock([
    { method: 'GET', path: '/api/compute/card-hours/market/listings', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/market/stats', data: {
      standardInventory: 0, specificInventory: 0, volume24h: 0, recentTrades: [],
    } },
    { method: 'GET', path: '/api/compute/card-hours/rates', data: [] },
  ])
}

export function installCardHourAuthenticatedRoutes() {
  return installComputeFetchMock([
    { method: 'GET', path: '/api/compute/card-hours/market/listings', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/market/stats', data: {
      standardInventory: 0, specificInventory: 0, volume24h: 0, recentTrades: [],
    } },
    { method: 'GET', path: '/api/compute/card-hours/rates', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/lots', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/rfqs', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/custody', data: {
      lots: [], feeEnabled: false, accruedFee: 0, rule: '',
    } },
    { method: 'GET', path: '/api/compute/card-hours/deposits', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/trades', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/listings/mine', data: [] },
    { method: 'GET', path: '/api/compute/supplier/nodes', data: [] },
    { method: 'GET', path: '/api/compute/products?type=GPU', data: [makeGpuProduct()] },
    { method: 'GET', path: '/api/compute/card-hours/redemptions?role=buyer', data: [] },
    { method: 'GET', path: '/api/compute/card-hours/redemptions?role=supplier', data: [] },
  ])
}
```

- [ ] **Step 5: 写角色、标签和公开浏览基线测试**

```ts
describe('compute center presentation', () => {
  it('keeps market and card-hour tabs public', () => {
    expect(getVisibleComputeTabs(false).map((tab) => tab.value)).toEqual(['market', 'card-hours'])
  })

  it('adds authenticated asset tabs without replacing buyer capabilities', () => {
    expect(getVisibleComputeTabs(true).map((tab) => tab.value)).toEqual([
      'market', 'card-hours', 'account', 'purchases', 'reservations', 'supplier', 'notifications',
    ])
    expect(getComputeRoleLabels(makeComputeAccount({
      supplierStatus: 'APPROVED',
      isAdmin: true,
      roles: ['BUYER', 'SUPPLIER', 'ADMIN'],
    }))).toEqual(['购买方', '已认证供应方', '算力管理员'])
  })
})
```

- [ ] **Step 6: 实现只含现有标签顺序的 presentation 纯函数**

```ts
export const COMPUTE_TABS = [
  { value: 'market', label: '算力市场', login: false },
  { value: 'card-hours', label: '卡时资产', login: false },
  { value: 'account', label: '我的资产', login: true },
  { value: 'purchases', label: '购买记录', login: true },
  { value: 'reservations', label: '我的订单', login: true },
  { value: 'supplier', label: '我的设备', login: true },
  { value: 'notifications', label: '通知', login: true },
] as const

export function getVisibleComputeTabs(isLoggedIn: boolean) {
  return COMPUTE_TABS.filter((tab) => !tab.login || isLoggedIn)
}

export function getComputeRoleLabels(account?: ComputeAccount) {
  const labels = { BUYER: '购买方', SUPPLIER: '已认证供应方', ADMIN: '算力管理员' } as const
  return (account?.roles || []).map((role) => labels[role])
}
```

- [ ] **Step 7: 运行 Task 1 测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-test/mockComputeTransport.test.ts src/renderer/routes/compute-center/-utils/presentation.test.ts`

Expected: PASS，4 个测试全部通过且没有真实网络访问。

```bash
git add src/renderer/routes/compute-center/-test src/renderer/routes/compute-center/-utils/presentation.ts src/renderer/routes/compute-center/-utils/presentation.test.ts
git commit -m "test(compute): establish isolated behavior fixtures"
```

### Task 2: 提取公开类型和冻结查询键

**Files:**
- Create: `src/renderer/packages/compute-center/types.ts`
- Create: `src/renderer/packages/compute-center/queryKeys.ts`
- Create: `src/renderer/packages/compute-center/queryKeys.test.ts`
- Create: `src/renderer/packages/compute-center/publicTypes.test.ts`
- Modify: `src/renderer/packages/computeCenter.ts:11-633`

**Interfaces:**
- Produces: 原 `computeCenter.ts` 中全部公开 type/interface，名称和字段不变。
- Produces: `ComputeConfig` replaces the old inline config response type with fields `cardHourCnyRate`、`cardHourRedeemRate`、`usdCnyRate`、`unitName`、`currency`.
- Produces: `computeQueryKeys`，所有结果都是 readonly tuple，首项固定为 `'compute'`。

- [ ] **Step 1: 写查询键和类型兼容失败测试**

```ts
import { describe, expect, expectTypeOf, it } from 'vitest'
import type { ComputeAccount as LegacyAccount } from '../computeCenter'
import { computeQueryKeys } from './queryKeys'
import type { ComputeAccount } from './types'

describe('compute query keys', () => {
  it('preserves every existing key shape', () => {
    expect(computeQueryKeys.all).toEqual(['compute'])
    expect(computeQueryKeys.account()).toEqual(['compute', 'account'])
    expect(computeQueryKeys.products()).toEqual(['compute', 'products'])
    expect(computeQueryKeys.products('GPU')).toEqual(['compute', 'products', 'GPU'])
    expect(computeQueryKeys.marketPriceHistory('H100', '24h')).toEqual([
      'compute', 'market-prices', 'history', 'H100', '24h',
    ])
    expect(computeQueryKeys.redemptions('supplier')).toEqual([
      'compute', 'card-market', 'redemptions', 'supplier',
    ])
    expect(computeQueryKeys.rfqQuotes(9)).toEqual(['compute', 'card-market', 'rfq-quotes', 9])
  })

  it('keeps the public account type assignable both ways', () => {
    expectTypeOf<ComputeAccount>().toMatchTypeOf<LegacyAccount>()
    expectTypeOf<LegacyAccount>().toMatchTypeOf<ComputeAccount>()
  })
})
```

- [ ] **Step 2: 运行测试并确认新模块不存在**

Run: `pnpm exec vitest run src/renderer/packages/compute-center/queryKeys.test.ts src/renderer/packages/compute-center/publicTypes.test.ts`

Expected: FAIL，提示 `./queryKeys` 或 `./types` 不存在。

- [ ] **Step 3: 原样移动类型并实现完整查询键工厂**

```ts
export const computeQueryKeys = {
  all: ['compute'] as const,
  config: () => ['compute', 'config'] as const,
  products: (type?: ProductType) => type ? ['compute', 'products', type] as const : ['compute', 'products'] as const,
  account: () => ['compute', 'account'] as const,
  referralPreview: (code?: string) => ['compute', 'referral-preview', code] as const,
  referralProfile: () => ['compute', 'referrals', 'me'] as const,
  referralRewards: () => ['compute', 'referrals', 'rewards'] as const,
  ledger: () => ['compute', 'ledger'] as const,
  orders: () => ['compute', 'orders'] as const,
  withdrawals: () => ['compute', 'withdrawals'] as const,
  marketPrices: () => ['compute', 'market-prices', 'latest'] as const,
  marketPriceHistory: (model: string, range: '1h' | '6h' | '24h' | '7d') =>
    ['compute', 'market-prices', 'history', model, range] as const,
  packagePurchases: () => ['compute', 'package-purchases'] as const,
  apiUsage: () => ['compute', 'api-usage'] as const,
  reservations: (role: 'buyer' | 'supplier') => ['compute', 'reservations', role] as const,
  transfers: () => ['compute', 'transfers'] as const,
  supplier: () => ['compute', 'supplier'] as const,
  identity: () => ['compute', 'identity'] as const,
  supplierNodes: () => ['compute', 'supplier-nodes'] as const,
  supplierProducts: () => ['compute', 'supplier-products'] as const,
  notifications: () => ['compute', 'notifications'] as const,
  listings: () => ['compute', 'card-market', 'listings'] as const,
  marketStats: () => ['compute', 'card-market', 'stats'] as const,
  rates: () => ['compute', 'card-market', 'rates'] as const,
  lots: () => ['compute', 'card-market', 'lots'] as const,
  custody: () => ['compute', 'card-market', 'custody'] as const,
  deposits: () => ['compute', 'card-market', 'deposits'] as const,
  trades: () => ['compute', 'card-market', 'trades'] as const,
  myListings: () => ['compute', 'card-market', 'my-listings'] as const,
  rfqs: () => ['compute', 'card-market', 'rfqs'] as const,
  rfqQuotes: (rfqId?: number) => ['compute', 'card-market', 'rfq-quotes', rfqId] as const,
  redemptions: (role: 'buyer' | 'supplier') => ['compute', 'card-market', 'redemptions', role] as const,
  adminOverview: () => ['compute', 'admin-overview'] as const,
  adminIdentities: () => ['compute', 'admin-identities'] as const,
  adminNodes: () => ['compute', 'admin-nodes'] as const,
  adminSuppliers: () => ['compute', 'admin-suppliers'] as const,
  adminProducts: () => ['compute', 'admin-products'] as const,
  adminReservations: () => ['compute', 'admin-reservations'] as const,
  adminTransfers: () => ['compute', 'admin-transfers'] as const,
  adminUpstreams: () => ['compute', 'admin-upstreams'] as const,
  adminSuspendedProxyKeys: () => ['compute', 'admin-suspended-proxy-keys'] as const,
  adminCardDeposits: () => ['compute', 'admin', 'card-deposits'] as const,
  adminCardRedemptions: () => ['compute', 'admin', 'card-redemptions'] as const,
}
```

- [ ] **Step 4: 从旧文件重导出类型并运行测试**

在 `computeCenter.ts` 顶部增加：

```ts
export * from './compute-center/types'
```

删除旧文件中已经移动的重复 type/interface 定义，但此时不移动函数。

Run: `pnpm exec vitest run src/renderer/packages/compute-center/queryKeys.test.ts src/renderer/packages/compute-center/publicTypes.test.ts`

Expected: PASS，类型双向兼容且查询键字节级相同。

- [ ] **Step 5: 执行类型检查并提交**

Run: `pnpm check`

Expected: exit 0。

```bash
git add src/renderer/packages/compute-center/types.ts src/renderer/packages/compute-center/queryKeys.ts src/renderer/packages/compute-center/queryKeys.test.ts src/renderer/packages/compute-center/publicTypes.test.ts src/renderer/packages/computeCenter.ts
git commit -m "refactor(compute): extract public types and query keys"
```

### Task 3: 建立共享 API client、错误模型和终止上限

**Files:**
- Create: `src/renderer/packages/compute-center/client.ts`
- Create: `src/renderer/packages/compute-center/client.test.ts`
- Modify: `src/renderer/packages/computeCenter.ts:615-665`

**Interfaces:**
- Produces: `computeRequest<T>(path: string, options?: ComputeRequestOptions): Promise<T>`
- Produces: `computeBlobRequest(path: string, options?: ComputeBlobRequestOptions): Promise<Blob>` for protected identity/node evidence.
- Produces: `ComputeReadOptions = { signal?: AbortSignal }` for every domain GET function.
- Produces: `ComputeCenterClientError`、`ComputeCenterApiError`、`ComputeCenterTransportError`
- Produces: `COMPUTE_READ_TIMEOUT_MS = 30_000`、`COMPUTE_MATERIAL_TIMEOUT_MS = 120_000`
- Consumes: `getKodApiOrigin()`、`authInfoStore.getState().accessToken`

- [ ] **Step 1: 写鉴权、契约、超时和不重试失败测试**

```ts
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authInfoStore } from '@/stores/authInfoStore'
import {
  COMPUTE_READ_TIMEOUT_MS,
  ComputeCenterApiError,
  ComputeCenterTransportError,
  computeRequest,
} from './client'

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  authInfoStore.getState().clearTokens()
})

describe('computeRequest', () => {
  it('rejects authenticated calls before networking when token is absent', async () => {
    const fetchMock = vi.fn()
    vi.stubGlobal('fetch', fetchMock)
    await expect(computeRequest('/api/compute/account')).rejects.toMatchObject({ kind: 'auth' })
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('sends bearer auth and unwraps the KOD envelope', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' })
    const fetchMock = vi.fn(async (_url, init) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token')
      return new Response(JSON.stringify({ code: 0, data: { value: 1 } }))
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(computeRequest<{ value: number }>('/api/compute/account')).resolves.toEqual({ value: 1 })
  })

  it('preserves business code and safe data', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' })
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      code: 4601,
      message: '可用卡时不足',
      data: { shortageCardHours: 2 },
    }))))
    await expect(computeRequest('/api/compute/orders')).rejects.toBeInstanceOf(ComputeCenterApiError)
  })

  it('terminates a stalled read at 30 seconds', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' })
    vi.stubGlobal('fetch', vi.fn((_url, init) => new Promise((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError')))
    })))
    vi.useFakeTimers()
    const promise = computeRequest('/api/compute/account')
    const assertion = expect(promise).rejects.toMatchObject({ kind: 'transport', outcomeUnknown: false })
    await vi.advanceTimersByTimeAsync(COMPUTE_READ_TIMEOUT_MS)
    await assertion
  })

  it('marks a lost write response unknown and sends it only once', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' })
    const fetchMock = vi.fn(() => { throw new TypeError('Failed to fetch') })
    vi.stubGlobal('fetch', fetchMock)
    await expect(computeRequest('/api/compute/orders', { method: 'POST', operation: 'write', body: {} }))
      .rejects.toBeInstanceOf(ComputeCenterTransportError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reads protected evidence as a blob with bearer auth', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' })
    const fetchMock = vi.fn(async (_url, init) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer test-token')
      return new Response(new Uint8Array([1, 2, 3]), { status: 200 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(computeBlobRequest('/api/compute/admin/nodes/7/proof')).resolves.toBeInstanceOf(Blob)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 运行测试并确认 client 尚不存在**

Run: `pnpm exec vitest run src/renderer/packages/compute-center/client.test.ts`

Expected: FAIL，提示无法解析 `./client`。

- [ ] **Step 3: 实现错误类型和请求选项**

```ts
export type ComputeClientErrorKind = 'validation' | 'business' | 'auth' | 'transport' | 'unknown'
export type ComputeOperation = 'read' | 'write'
export type ComputeTimeoutClass = 'default' | 'material'

export interface ComputeRequestOptions extends FetchOptions<'json'> {
  authenticated?: boolean
  operation?: ComputeOperation
  timeoutClass?: ComputeTimeoutClass
  signal?: AbortSignal
}

export interface ComputeReadOptions { signal?: AbortSignal }

export class ComputeCenterClientError extends Error {
  constructor(
    public readonly kind: ComputeClientErrorKind,
    message: string,
    public readonly outcomeUnknown = false,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'ComputeCenterClientError'
  }
}

export class ComputeCenterApiError extends ComputeCenterClientError {
  constructor(public readonly code: number, message: string, public readonly data?: unknown) {
    super('business', message)
    this.name = 'ComputeCenterApiError'
  }
}

export class ComputeCenterTransportError extends ComputeCenterClientError {
  constructor(message: string, outcomeUnknown: boolean, cause?: unknown) {
    super('transport', message, outcomeUnknown, { cause })
    this.name = 'ComputeCenterTransportError'
  }
}
```

- [ ] **Step 4: 实现 signal 合并、终止上限和单次 ofetch**

```ts
export const COMPUTE_READ_TIMEOUT_MS = 30_000
export const COMPUTE_MATERIAL_TIMEOUT_MS = 120_000

export async function computeRequest<T>(path: string, input: ComputeRequestOptions = {}): Promise<T> {
  const { authenticated = true, operation = 'read', timeoutClass = 'default', signal, ...options } = input
  const token = authInfoStore.getState().accessToken
  if (authenticated && !token) throw new ComputeCenterClientError('auth', '请先登录 KOD 账号')

  const controller = new AbortController()
  const relayAbort = () => controller.abort(signal?.reason)
  signal?.addEventListener('abort', relayAbort, { once: true })
  const timeoutMs = timeoutClass === 'material' ? COMPUTE_MATERIAL_TIMEOUT_MS : COMPUTE_READ_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)

  try {
    const json = await ofetch<KodResult<T>>(`${getKodApiOrigin()}${path}`, {
      ...options,
      signal: controller.signal,
      headers: {
        ...(options.headers || {}),
        ...(authenticated && token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ignoreResponseError: true,
      retry: 0,
    })
    if (json.code !== 0) throw new ComputeCenterApiError(json.code, json.message || '算力中心请求失败', json.data)
    if (json.data == null) throw new ComputeCenterClientError('unknown', json.message || '算力中心响应缺少数据')
    return json.data
  } catch (error) {
    if (error instanceof ComputeCenterClientError) throw error
    throw new ComputeCenterTransportError(
      operation === 'write' ? '操作结果尚未确认，请刷新资产或记录后核对' : '算力中心连接失败，请稍后重试',
      operation === 'write',
      error
    )
  } finally {
    clearTimeout(timeoutId)
    signal?.removeEventListener('abort', relayAbort)
  }
}

export async function computeBlobRequest(
  path: string,
  input: { signal?: AbortSignal; timeoutClass?: ComputeTimeoutClass } = {}
): Promise<Blob> {
  const token = authInfoStore.getState().accessToken
  if (!token) throw new ComputeCenterClientError('auth', '请先登录 KOD 账号')
  const controller = new AbortController()
  const relayAbort = () => controller.abort(input.signal?.reason)
  input.signal?.addEventListener('abort', relayAbort, { once: true })
  const timeoutMs = input.timeoutClass === 'material' ? COMPUTE_MATERIAL_TIMEOUT_MS : COMPUTE_READ_TIMEOUT_MS
  const timeoutId = setTimeout(() => controller.abort(new Error('timeout')), timeoutMs)
  try {
    const response = await fetch(`${getKodApiOrigin()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
    if (!response.ok) throw new ComputeCenterClientError('business', '受保护材料读取失败')
    return await response.blob()
  } catch (error) {
    if (error instanceof ComputeCenterClientError) throw error
    throw new ComputeCenterTransportError('受保护材料连接失败，请稍后重试', false, error)
  } finally {
    clearTimeout(timeoutId)
    input.signal?.removeEventListener('abort', relayAbort)
  }
}
```

- [ ] **Step 5: 从旧文件重导出错误类型并运行测试**

删除旧 `request` 和旧 `ComputeCenterApiError`，临时保留兼容三参数的内部 wrapper，直到 Task 4/5 把函数全部迁走：

```ts
import { computeRequest } from './compute-center/client'
export { ComputeCenterApiError } from './compute-center/client'

function request<T>(path: string, options?: FetchOptions<'json'>, authenticated = true) {
  return computeRequest<T>(path, { ...options, authenticated })
}
```

Run: `pnpm exec vitest run src/renderer/packages/compute-center/client.test.ts src/renderer/packages/remote.auth.test.ts`

Expected: PASS；登录超时测试仍通过，算力 client 不重试写请求。

- [ ] **Step 6: 执行类型检查并提交**

Run: `pnpm check`

Expected: exit 0。

```bash
git add src/renderer/packages/compute-center/client.ts src/renderer/packages/compute-center/client.test.ts src/renderer/packages/computeCenter.ts
git commit -m "refactor(compute): add terminating request client"
```

### Task 4: 拆分市场、账户、套餐和订单 API

**Files:**
- Create: `src/renderer/packages/compute-center/marketplace.ts`
- Create: `src/renderer/packages/compute-center/account.ts`
- Create: `src/renderer/packages/compute-center/packages.ts`
- Create: `src/renderer/packages/compute-center/reservations.ts`
- Create: `src/renderer/packages/compute-center/coreDomains.contract.test.ts`
- Modify: `src/renderer/packages/computeCenter.ts:666-1039,1165-1187`

**Interfaces:**
- `marketplace.ts` owns `getComputeConfig`、`getComputeMarketPrices`、`getComputeMarketPriceHistory`、`listComputeProducts`、`getComputeProductImageUrl`。
- `account.ts` owns account、ledger、orders、withdrawals and referrals functions from the old module.
- `packages.ts` owns activate/list balance/list purchase/get credential/regenerate/authorize/list activation/list usage functions.
- `reservations.ts` owns reservation and transfer functions.

- [ ] **Step 1: 写核心领域契约失败测试**

```ts
beforeEach(() => authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' }))
afterEach(() => { authInfoStore.getState().clearTokens(); vi.unstubAllGlobals() })

describe('core compute domain contracts', () => {
  it.each([
    ['GET', '/api/compute/config', () => getComputeConfig(), undefined],
    ['GET', '/api/compute/products?type=GPU', () => listComputeProducts('GPU'), undefined],
    ['GET', '/api/compute/account', () => getComputeAccount(), undefined],
    ['POST', '/api/compute/account/purchase', () => purchaseCardHours(3), { cardHours: 3 }],
    ['POST', '/api/compute/withdrawals', () => withdrawComputeCardHours(2, 'withdraw-1'), {
      cardHours: 2, requestId: 'withdraw-1',
    }],
    ['POST', '/api/compute/products/5/purchase?autoTopUp=true', () => activateComputeApi(5, true), undefined],
    ['GET', '/api/compute/packages/purchases', () => listComputePackagePurchases(), undefined],
    ['GET', '/api/compute/packages/purchases/8/credential', () => getComputePackageCredential(8), undefined],
    ['POST', '/api/compute/reservations/9/confirm', () => confirmComputeReservation(9), undefined],
    ['POST', '/api/compute/transfers/7/accept', () => acceptComputeTransfer(7), undefined],
  ])('%s %s keeps its contract', async (method, path, invoke, body) => {
    const fetchMock = installComputeFetchMock([{ method, path, data: {} }])
    await invoke()
    const [, init] = fetchMock.mock.calls[0]
    expect(String(init?.method || 'GET').toUpperCase()).toBe(method)
    if (body) expect(JSON.parse(String(init?.body))).toEqual(body)
  })
})
```

- [ ] **Step 2: 运行测试并确认新领域导入失败**

Run: `pnpm exec vitest run src/renderer/packages/compute-center/coreDomains.contract.test.ts`

Expected: FAIL，提示领域模块不存在。

- [ ] **Step 3: 原样迁移市场和账户函数，给读取函数增加可选 signal**

```ts
export function getComputeConfig(options: ComputeReadOptions = {}) {
  return computeRequest<ComputeConfig>('/api/compute/config', {
    authenticated: false,
    signal: options.signal,
  })
}

export function listComputeProducts(type?: ProductType, options: ComputeReadOptions = {}) {
  const query = type ? `?type=${type}` : ''
  return computeRequest<ComputeProduct[]>(`/api/compute/products${query}`, {
    authenticated: false,
    signal: options.signal,
  })
}

export function purchaseCardHours(cardHours: number) {
  return computeRequest<ComputeAccount>('/api/compute/account/purchase', {
    method: 'POST', operation: 'write', body: { cardHours },
  })
}
```

市场、账户与 referral 的其他函数保持原路径和 body，仅给 GET 函数追加最后一个可选 `ComputeReadOptions` 参数。

- [ ] **Step 4: 原样迁移套餐函数并标记所有写操作**

```ts
export function activateComputeApi(productId: number, autoTopUp = false) {
  return computeRequest<{ purchased: boolean; productId: number; orderNo: string }>(
    `/api/compute/products/${productId}/purchase${autoTopUp ? '?autoTopUp=true' : ''}`,
    { method: 'POST', operation: 'write' }
  )
}

export function getComputePackageCredential(purchaseId: number, options: ComputeReadOptions = {}) {
  return computeRequest<ComputePackageCredential>(`/api/compute/packages/purchases/${purchaseId}/credential`, {
    signal: options.signal,
  })
}
```

`regenerateComputePackageKey` 和 `authorizeComputePackage` 必须使用 `operation: 'write'`；列表与用量函数使用 read。

- [ ] **Step 5: 原样迁移预订和转让函数并保留参数顺序**

```ts
export function confirmComputeReservation(reservationId: number) {
  return computeRequest<ComputeReservation>(`/api/compute/reservations/${reservationId}/confirm`, {
    method: 'POST', operation: 'write',
  })
}

export function acceptComputeTransfer(transferId: number) {
  return computeRequest<ComputeTransfer>(`/api/compute/transfers/${transferId}/accept`, {
    method: 'POST', operation: 'write',
  })
}
```

`create/cancel/deliver/confirm/dispute/settle/resolve` 类函数全部标记 write；读取买家/供应方列表使用 read 和可选 signal。

- [ ] **Step 6: 运行契约测试、类型检查并提交**

Run: `pnpm exec vitest run src/renderer/packages/compute-center/coreDomains.contract.test.ts src/renderer/packages/compute-center/client.test.ts`

Expected: PASS，所有表驱动契约只发出一次请求。

Run: `pnpm check`

Expected: exit 0。

```bash
git add src/renderer/packages/compute-center/marketplace.ts src/renderer/packages/compute-center/account.ts src/renderer/packages/compute-center/packages.ts src/renderer/packages/compute-center/reservations.ts src/renderer/packages/compute-center/coreDomains.contract.test.ts src/renderer/packages/computeCenter.ts
git commit -m "refactor(compute): split core domain APIs"
```

### Task 5: 拆分卡时、供应方、通知和管理员 API，完成兼容门面

**Files:**
- Create: `src/renderer/packages/compute-center/cardHours.ts`
- Create: `src/renderer/packages/compute-center/supplier.ts`
- Create: `src/renderer/packages/compute-center/notifications.ts`
- Create: `src/renderer/packages/compute-center/admin.ts`
- Create: `src/renderer/packages/compute-center/secondaryDomains.contract.test.ts`
- Create: `src/renderer/packages/compute-center/publicApi.test.ts`
- Create: `src/renderer/packages/compute-center/index.ts`
- Modify: `src/renderer/packages/computeCenter.ts:1-1348`

**Interfaces:**
- `cardHours.ts` owns all `CardHour*` market, RFQ, deposit and redemption functions.
- `supplier.ts` owns identity, supplier, node and supplier product functions.
- `notifications.ts` owns list and mark-read functions.
- `admin.ts` owns all admin overview, review, repair, settlement and grant functions not owned by `cardHours.ts`.
- `index.ts` and legacy `computeCenter.ts` export the same runtime function/class names.

- [ ] **Step 1: 写次级领域契约和兼容门面失败测试**

```ts
import * as legacy from '../computeCenter'
import * as modular from './index'

beforeEach(() => authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' }))
afterEach(() => { authInfoStore.getState().clearTokens(); vi.unstubAllGlobals() })

describe('secondary compute contracts', () => {
  it.each([
    ['POST', '/api/compute/card-hours/listings/4/purchase-quote', () => createCardHourPurchaseQuote(4)],
    ['POST', '/api/compute/card-hours/purchase-quotes/6/confirm?autoTopUp=true', () => confirmCardHourPurchaseQuote(6, true)],
    ['POST', '/api/compute/card-hours/redemptions/3/dispute', () => disputeCardHourRedemption(3, 'test reason')],
    ['GET', '/api/compute/supplier/nodes', () => listSupplierNodes()],
    ['GET', '/api/compute/notifications', () => listComputeNotifications()],
    ['POST', '/api/compute/notifications/7/read', () => markComputeNotificationRead(7)],
    ['POST', '/api/compute/admin/products/9/review', () => reviewAdminProduct(9, true, '')],
    ['POST', '/api/compute/admin/grants', () => grantAdminCardHours({
      recipientEmail: 'buyer@example.invalid', cardHours: 1, reason: 'test',
    })],
  ])('%s %s uses the existing route', async (method, path, invoke) => {
    const fetchMock = installComputeFetchMock([{ method, path, data: {} }])
    await invoke()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('keeps every runtime public export available through both entry points', () => {
    expect(Object.keys(legacy).sort()).toEqual(Object.keys(modular).sort())
  })
})
```

- [ ] **Step 2: 运行测试并确认领域模块或 index 缺失**

Run: `pnpm exec vitest run src/renderer/packages/compute-center/secondaryDomains.contract.test.ts src/renderer/packages/compute-center/publicApi.test.ts`

Expected: FAIL，提示新模块或导出不存在。

- [ ] **Step 3: 迁移卡时函数并明确读写属性**

```ts
export function confirmCardHourPurchaseQuote(quoteId: number, autoTopUp = false) {
  return computeRequest<CardHourTrade>(
    `/api/compute/card-hours/purchase-quotes/${quoteId}/confirm${autoTopUp ? '?autoTopUp=true' : ''}`,
    { method: 'POST', operation: 'write' }
  )
}

export function listCardHourRedemptions(role: 'buyer' | 'supplier', options: ComputeReadOptions = {}) {
  return computeRequest<CardHourRedemption[]>(
    `/api/compute/card-hours/redemptions?role=${encodeURIComponent(role)}`,
    { signal: options.signal }
  )
}
```

创建/取消/确认/报价/交付/用量/补足/争议/审核/解决全部标记 write；列表、统计、费率、批次和托管全部标记 read。

- [ ] **Step 4: 迁移供应方、通知和管理员函数**

```ts
export async function submitComputeIdentity(input: {
  realName: string
  identityNo: string
  front: File
  back: File
}) {
  const submit = async (maxBytes: number) => {
    const [front, back] = await Promise.all([
      prepareComputeImageUpload(input.front, maxBytes),
      prepareComputeImageUpload(input.back, maxBytes),
    ])
    const body = new FormData()
    body.append('realName', input.realName)
    body.append('identityNo', input.identityNo)
    body.append('front', front)
    body.append('back', back)
    return computeRequest<ComputeIdentity>('/api/compute/identity', {
      method: 'POST', operation: 'write', timeoutClass: 'material', body,
    })
  }
  try {
    return await submit(COMPUTE_IMAGE_UPLOAD_MAX_BYTES)
  } catch (error) {
    if (!isComputeUploadSizeExceeded(error)) throw error
    return submit(COMPUTE_IMAGE_UPLOAD_RETRY_BYTES)
  }
}

export async function createSupplierNode(input: ComputeNodeInput) {
  const { resourceProof, ...payload } = input
  if (!resourceProof) throw new ComputeCenterClientError('validation', '请上传 GPU 资源证明图片')
  const submit = async (maxBytes: number) => {
    const body = new FormData()
    body.append('payload', JSON.stringify(payload))
    body.append('resourceProof', await prepareComputeImageUpload(resourceProof, maxBytes))
    return computeRequest<ComputeGpuNode>('/api/compute/supplier/nodes', {
      method: 'POST', operation: 'write', timeoutClass: 'material', body,
    })
  }
  try {
    return await submit(COMPUTE_IMAGE_UPLOAD_MAX_BYTES)
  } catch (error) {
    if (!isComputeUploadSizeExceeded(error)) throw error
    return submit(COMPUTE_IMAGE_UPLOAD_RETRY_BYTES)
  }
}

export async function createSupplierGpuProduct(input: ComputeProductInput, images: File[] = []) {
  const product = await computeRequest<ComputeProduct>('/api/compute/supplier/products', {
    method: 'POST', operation: 'write', body: input,
  })
  for (const image of images) {
    const upload = async (maxBytes: number) => {
      const body = new FormData()
      body.append('image', await prepareComputeImageUpload(image, maxBytes))
      return computeRequest<{ imageId: number; productId: number }>(
        `/api/compute/supplier/products/${product.id}/images`,
        { method: 'POST', operation: 'write', timeoutClass: 'material', body }
      )
    }
    try {
      await upload(COMPUTE_IMAGE_UPLOAD_MAX_BYTES)
    } catch (error) {
      if (!isComputeUploadSizeExceeded(error)) throw error
      await upload(COMPUTE_IMAGE_UPLOAD_RETRY_BYTES)
    }
  }
  return product
}

export function getAdminIdentityDocument(
  identityId: number,
  side: 'front' | 'back',
  options: ComputeReadOptions = {}
) {
  return computeBlobRequest(`/api/compute/admin/identities/${identityId}/document/${side}`, {
    signal: options.signal,
    timeoutClass: 'material',
  })
}

export function getAdminNodeProof(nodeId: number, options: ComputeReadOptions = {}) {
  return computeBlobRequest(`/api/compute/admin/nodes/${nodeId}/proof`, {
    signal: options.signal,
    timeoutClass: 'material',
  })
}

export function markComputeNotificationRead(notificationId: number) {
  return computeRequest<{ read: boolean }>(`/api/compute/notifications/${notificationId}/read`, {
    method: 'POST', operation: 'write',
  })
}

export function reviewAdminProduct(productId: number, approved: boolean, reason = '') {
  return computeRequest<ComputeProduct>(`/api/compute/admin/products/${productId}/review`, {
    method: 'POST', operation: 'write', body: { approved, reason },
  })
}
```

文件上传沿用 `prepareComputeImageUpload` 和现有字段，使用 `operation: 'write', timeoutClass: 'material'`；证件/验机证明读取使用 `operation: 'read', timeoutClass: 'material'` 并支持 signal 取消，但不得把响应内容写日志。

- [ ] **Step 5: 建立新 index 和只有重导出的旧门面**

```ts
// compute-center/index.ts
export * from './types'
export { ComputeCenterApiError } from './client'
export * from './account'
export * from './marketplace'
export * from './cardHours'
export * from './packages'
export * from './reservations'
export * from './supplier'
export * from './notifications'
export * from './admin'

// computeCenter.ts
export * from './compute-center'
```

- [ ] **Step 6: 运行全部 API 测试并确认旧入口无回归**

Run: `pnpm exec vitest run src/renderer/packages/compute-center src/renderer/packages/computeDeliveryTime.test.ts src/renderer/packages/computeImageUpload.test.ts`

Expected: PASS，兼容门面导出集合相同且所有写请求只调用一次。

- [ ] **Step 7: 执行类型检查并提交**

Run: `pnpm check`

Expected: exit 0。

```bash
git add src/renderer/packages/compute-center src/renderer/packages/computeCenter.ts
git commit -m "refactor(compute): complete domain API facade"
```

### Task 6: 实现操作防重、卡时补足和结果未知状态机

**Files:**
- Create: `src/renderer/routes/compute-center/-hooks/computeActionEngine.ts`
- Create: `src/renderer/routes/compute-center/-hooks/computeActionEngine.test.ts`
- Create: `src/renderer/routes/compute-center/-hooks/useComputeActionController.ts`
- Create: `src/renderer/routes/compute-center/-hooks/useComputeActionController.test.tsx`

**Interfaces:**
- Produces: `RunAction` and `RunCardHourAction` with the existing call signatures.
- Produces: `ComputeActionEngine.run<T>(key, action): Promise<ComputeActionResult<T>>`.
- Produces: `useComputeActionController(queryClient): ComputeActionController`.
- Consumes: `ComputeCenterApiError` codes `4601`/`4602` and `CardHourTopUpQuote`.

- [ ] **Step 1: 写同 key 防重和不同 key 并行的失败测试**

```ts
describe('ComputeActionEngine', () => {
  it('starts the same action key once until the first call settles', async () => {
    const engine = new ComputeActionEngine()
    let release!: () => void
    const action = vi.fn(() => new Promise<void>((resolve) => { release = resolve }))
    const first = engine.run('purchase:7', action)
    await expect(engine.run('purchase:7', action)).resolves.toEqual({ status: 'duplicate' })
    expect(action).toHaveBeenCalledTimes(1)
    release()
    await expect(first).resolves.toEqual({ status: 'success', value: undefined })
  })

  it('allows unrelated keys to run concurrently', async () => {
    const engine = new ComputeActionEngine()
    await Promise.all([
      engine.run('notification:1', async () => 1),
      engine.run('notification:2', async () => 2),
    ])
    expect(engine.isRunning('notification:1')).toBe(false)
    expect(engine.isRunning('notification:2')).toBe(false)
  })
})
```

- [ ] **Step 2: 写写请求结果未知和卡时恢复判定失败测试**

```ts
it('classifies a lost write response as unknown without retrying', async () => {
  const engine = new ComputeActionEngine()
  const action = vi.fn(async () => {
    throw new ComputeCenterTransportError('结果尚未确认', true)
  })
  await expect(engine.run('order:3', action)).resolves.toMatchObject({ status: 'unknown' })
  expect(action).toHaveBeenCalledTimes(1)
})

it('accepts only valid top-up quotes from business codes 4601 and 4602', () => {
  const quote = makeCardHourTopUpQuote({ shortageCardHours: 2, canAutoTopUp: true })
  expect(readCardHourTopUpQuote(new ComputeCenterApiError(4601, '不足', quote))).toEqual(quote)
  expect(readCardHourTopUpQuote(new ComputeCenterApiError(4000, '失败', quote))).toBeNull()
  expect(readCardHourTopUpQuote(new ComputeCenterApiError(4601, '不足', { shortageCardHours: -1 }))).toBeNull()
})
```

- [ ] **Step 3: 运行测试并确认状态机不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-hooks/computeActionEngine.test.ts`

Expected: FAIL，提示无法解析 `computeActionEngine`。

- [ ] **Step 4: 实现纯状态机**

```ts
export type ComputeActionResult<T> =
  | { status: 'success'; value: T }
  | { status: 'duplicate' }
  | { status: 'failed'; error: unknown }
  | { status: 'unknown'; error: unknown }

export class ComputeActionEngine {
  private readonly running = new Set<string>()

  isRunning(key: string) { return this.running.has(key) }
  keys() { return [...this.running] }

  async run<T>(key: string, action: () => Promise<T>): Promise<ComputeActionResult<T>> {
    if (this.running.has(key)) return { status: 'duplicate' }
    this.running.add(key)
    try {
      return { status: 'success', value: await action() }
    } catch (error) {
      if (error instanceof ComputeCenterClientError && error.outcomeUnknown) {
        return { status: 'unknown', error }
      }
      return { status: 'failed', error }
    } finally {
      this.running.delete(key)
    }
  }
}
```

- [ ] **Step 5: 实现严格 CardHourTopUpQuote 守卫**

```ts
export function readCardHourTopUpQuote(error: unknown): CardHourTopUpQuote | null {
  if (!(error instanceof ComputeCenterApiError) || ![4601, 4602].includes(error.code)) return null
  const value = error.data as Partial<CardHourTopUpQuote> | null
  if (!value) return null
  const numbers = [
    value.requiredCardHours, value.availableCardHours, value.shortageCardHours, value.purchaseCardHours,
    value.cardHourCnyRate, value.cnyCost, value.cnyBalance, value.cnyShortfall,
  ]
  if (!numbers.every((number) => typeof number === 'number' && Number.isFinite(number) && number >= 0)) return null
  if ((value.shortageCardHours || 0) <= 0 || (value.purchaseCardHours || 0) <= 0) return null
  if (typeof value.canAutoTopUp !== 'boolean') return null
  return value as CardHourTopUpQuote
}
```

- [ ] **Step 6: 写 hook 的确认、取消、只续跑一次和卸载测试**

```tsx
// @vitest-environment jsdom
it('retries once with autoTopUp only after explicit confirmation', async () => {
  const action = vi.fn()
    .mockRejectedValueOnce(new ComputeCenterApiError(4601, '不足', makeCardHourTopUpQuote({ canAutoTopUp: true })))
    .mockResolvedValueOnce({})
  const { result } = renderHook(() => useComputeActionController(makeQueryClient()), { wrapper: ComputeTestProvider })
  let pending!: Promise<boolean>
  act(() => { pending = result.current.runCardHourAction('buy:1', action, '购买成功') })
  await waitFor(() => expect(result.current.cardHourPrompt).not.toBeNull())
  act(() => result.current.cardHourPrompt?.onConfirm())
  await expect(pending).resolves.toBe(true)
  expect(action.mock.calls).toEqual([[false], [true]])
})

it('performs no second call when the user cancels', async () => {
  const action = vi.fn().mockRejectedValue(
    new ComputeCenterApiError(4601, '不足', makeCardHourTopUpQuote({ canAutoTopUp: true }))
  )
  const { result } = renderHook(() => useComputeActionController(makeQueryClient()), { wrapper: ComputeTestProvider })
  let pending!: Promise<boolean>
  act(() => { pending = result.current.runCardHourAction('buy:1', action, '购买成功') })
  await waitFor(() => expect(result.current.cardHourPrompt).not.toBeNull())
  act(() => result.current.cardHourPrompt?.onCancel())
  await expect(pending).resolves.toBe(false)
  expect(action).toHaveBeenCalledTimes(1)
})

it('keeps the action key locked while the confirmation prompt is open', async () => {
  const action = vi.fn().mockRejectedValue(
    new ComputeCenterApiError(4601, '不足', makeCardHourTopUpQuote({ canAutoTopUp: true }))
  )
  const { result } = renderHook(() => useComputeActionController(makeQueryClient()), { wrapper: ComputeTestProvider })
  let first!: Promise<boolean>
  act(() => { first = result.current.runCardHourAction('buy:1', action, '购买成功') })
  await waitFor(() => expect(result.current.cardHourPrompt).not.toBeNull())
  await expect(result.current.runCardHourAction('buy:1', action, '购买成功')).resolves.toBe(false)
  expect(action).toHaveBeenCalledTimes(1)
  act(() => result.current.cardHourPrompt?.onCancel())
  await expect(first).resolves.toBe(false)
})

it('settles a pending confirmation when the component unmounts', async () => {
  const action = vi.fn().mockRejectedValue(
    new ComputeCenterApiError(4601, '不足', makeCardHourTopUpQuote({ canAutoTopUp: true }))
  )
  const hook = renderHook(() => useComputeActionController(makeQueryClient()), { wrapper: ComputeTestProvider })
  let pending!: Promise<boolean>
  act(() => { pending = hook.result.current.runCardHourAction('buy:1', action, '购买成功') })
  await waitFor(() => expect(hook.result.current.cardHourPrompt).not.toBeNull())
  hook.unmount()
  await expect(pending).resolves.toBe(false)
})
```

- [ ] **Step 7: 实现 hook 并保持原调用签名**

```ts
export type RunAction = (key: string, action: () => Promise<unknown>, success: string) => Promise<boolean>
export type RunCardHourAction = (
  key: string,
  action: (autoTopUp: boolean) => Promise<unknown>,
  success: string
) => Promise<boolean>

export interface CardHourPrompt {
  quote: CardHourTopUpQuote
  onConfirm(): void
  onCancel(): void
}

export interface ComputeActionController {
  isBusy(key: string): boolean
  feedback: { color: 'green' | 'red'; text: string } | null
  cardHourPrompt: CardHourPrompt | null
  closeFeedback(): void
  run: RunAction
  runCardHourAction: RunCardHourAction
}

export function useComputeActionController(queryClient: QueryClient): ComputeActionController {
  const engine = useRef(new ComputeActionEngine())
  const mounted = useRef(true)
  const pendingPrompt = useRef<{ key: string; resolve(value: boolean): void } | null>(null)
  const [busyKeys, setBusyKeys] = useState<Set<string>>(() => new Set())
  const [feedback, setFeedback] = useState<ComputeActionController['feedback']>(null)
  const [cardHourPrompt, setCardHourPrompt] = useState<CardHourPrompt | null>(null)

  useEffect(() => () => {
    mounted.current = false
    pendingPrompt.current?.resolve(false)
    pendingPrompt.current = null
  }, [])

  const refreshCompute = () => void queryClient.invalidateQueries({ queryKey: computeQueryKeys.all })
  const finishSuccess = (text: string) => {
    if (mounted.current) setFeedback({ color: 'green', text })
    refreshCompute()
    return true
  }
  const finishUnknown = () => {
    if (mounted.current) setFeedback({ color: 'red', text: '操作结果尚未确认，请刷新资产或记录后核对' })
    refreshCompute()
    return false
  }
  const finishFailure = (error: unknown) => {
    const text = error instanceof Error ? redactComputeText(error.message) : '操作失败'
    if (mounted.current) setFeedback({ color: 'red', text })
    return false
  }
  const settlePrompt = (value: boolean) => {
    const prompt = pendingPrompt.current
    pendingPrompt.current = null
    if (mounted.current) setCardHourPrompt(null)
    prompt?.resolve(value)
  }

  const execute = async (key: string, action: () => Promise<unknown>) => {
    if (engine.current.isRunning(key)) return { status: 'duplicate' } as const
    if (mounted.current) setBusyKeys((keys) => new Set(keys).add(key))
    try {
      return await engine.current.run(key, action)
    } finally {
      if (mounted.current) {
        setBusyKeys((keys) => { const next = new Set(keys); next.delete(key); return next })
      }
    }
  }

  const run: RunAction = async (key, action, success) => {
    if (pendingPrompt.current?.key === key) return false
    const result = await execute(key, action)
    if (result.status === 'success') return finishSuccess(success)
    if (result.status === 'unknown') return finishUnknown()
    if (result.status === 'failed') return finishFailure(result.error)
    return false
  }

  const runCardHourAction: RunCardHourAction = async (key, action, success) => {
    if (pendingPrompt.current) return false
    const first = await execute(key, () => action(false))
    if (first.status === 'success') return finishSuccess(success)
    if (first.status === 'duplicate') return false
    if (first.status === 'unknown') return finishUnknown()
    const quote = readCardHourTopUpQuote(first.error)
    if (!quote) return finishFailure(first.error)
    if (!mounted.current) return false
    return await new Promise<boolean>((resolve) => {
      pendingPrompt.current = { key, resolve }
      setCardHourPrompt({
        quote,
        onCancel: () => settlePrompt(false),
        onConfirm: () => {
          if (mounted.current) setCardHourPrompt(null)
          if (!quote.canAutoTopUp) {
            void platform.openLink('https://kod.kai.com/console/wallet')
            settlePrompt(false)
            return
          }
          void execute(key, () => action(true)).then((second) => {
            if (second.status === 'success') settlePrompt(finishSuccess(success))
            else if (second.status === 'unknown') settlePrompt(finishUnknown())
            else settlePrompt(second.status === 'failed' ? finishFailure(second.error) : false)
          })
        },
      })
    })
  }

  return {
    isBusy: (key) => busyKeys.has(key) || pendingPrompt.current?.key === key,
    feedback,
    cardHourPrompt,
    closeFeedback: () => setFeedback(null),
    run,
    runCardHourAction,
  }
}
```

`run` 将 `success` 映射为浅绿色反馈；普通失败映射浅红色；unknown 显示“操作结果尚未确认，请刷新资产或记录后核对”并只执行 `queryClient.invalidateQueries({ queryKey: computeQueryKeys.all })`。`runCardHourAction` 首次固定传 `false`，只有确认且 `canAutoTopUp` 时再传一次 `true`；`canAutoTopUp` 为 false 时，确认回调仅调用 `platform.openLink('https://kod.kai.com/console/wallet')`。

- [ ] **Step 8: 运行 hook/状态机测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-hooks/computeActionEngine.test.ts src/renderer/routes/compute-center/-hooks/useComputeActionController.test.tsx`

Expected: PASS，重复提交只有一次调用，取消零续跑，确认最多续跑一次。

```bash
git add src/renderer/routes/compute-center/-hooks
git commit -m "fix(compute): converge actions and block duplicate writes"
```

### Task 7: 建立脱敏、临时凭证和领域错误边界

**Files:**
- Create: `src/renderer/routes/compute-center/-utils/sensitive.ts`
- Create: `src/renderer/routes/compute-center/-utils/sensitive.test.ts`
- Create: `src/renderer/routes/compute-center/-hooks/useEphemeralCredential.ts`
- Create: `src/renderer/routes/compute-center/-hooks/useEphemeralCredential.test.tsx`
- Create: `src/renderer/routes/compute-center/-components/ComputeDomainBoundary.tsx`
- Create: `src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx`

**Interfaces:**
- Produces: `redactComputeText(text: string): string`.
- Produces: `reportComputeError(domain: string, error: unknown): void`，只发送错误类别和领域名。
- Produces: `useEphemeralCredential(ownerId?: number): { value; loading; reveal; clear }`.
- Produces: `ComputeDomainBoundary` with `domain`, `children`, `onRetry` props.

- [ ] **Step 1: 写敏感字符串脱敏失败测试**

```ts
it.each([
  ['Authorization: Bearer TEST_ONLY_TOKEN_123', 'Authorization: Bearer [REDACTED]'],
  ['apiKey=TEST_ONLY_API_KEY_123', 'apiKey=[REDACTED]'],
  ['identityNo=000000190001010000', 'identityNo=[REDACTED]'],
  ['password=P@ssw0rd!', 'password=[REDACTED]'],
  ['-----BEGIN OPENSSH PRIVATE KEY-----abc-----END OPENSSH PRIVATE KEY-----', '[REDACTED_PRIVATE_KEY]'],
])('redacts %s', (input, expected) => {
  expect(redactComputeText(input)).toBe(expected)
})
```

- [ ] **Step 2: 写临时凭证清理失败测试**

```tsx
// @vitest-environment jsdom
it('fetches only on reveal and clears when owner changes', async () => {
  const fetchCredential = vi.fn().mockResolvedValue({ apiKey: 'proxy-secret' })
  const { result, rerender, unmount } = renderHook(
    ({ ownerId }) => useEphemeralCredential(ownerId, fetchCredential),
    { initialProps: { ownerId: 1 } }
  )
  expect(fetchCredential).not.toHaveBeenCalled()
  await act(() => result.current.reveal())
  expect(result.current.value).toBe('proxy-secret')
  rerender({ ownerId: 2 })
  expect(result.current.value).toBeNull()
  unmount()
  expect(result.current.value).toBeNull()
})
```

- [ ] **Step 3: 写领域崩溃隔离失败测试**

```tsx
// @vitest-environment jsdom
function BrokenFeature(): never { throw new Error('apiKey=secret-value') }

it('keeps siblings mounted and emits only a redacted report', () => {
  const report = vi.fn()
  render(
    <div>
      <span>固定顶栏仍可用</span>
      <ComputeDomainBoundary domain="orders" onRetry={() => undefined} report={report}>
        <BrokenFeature />
      </ComputeDomainBoundary>
    </div>
  )
  expect(screen.getByText('固定顶栏仍可用')).toBeInTheDocument()
  expect(screen.getByText('该区域暂时无法显示')).toBeInTheDocument()
  expect(report.mock.calls.flat().join(' ')).not.toContain('secret-value')
})
```

- [ ] **Step 4: 运行测试并确认三个模块均不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-utils/sensitive.test.ts src/renderer/routes/compute-center/-hooks/useEphemeralCredential.test.tsx src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx`

Expected: FAIL，提示待创建模块不存在。

- [ ] **Step 5: 实现脱敏和安全错误上报**

```ts
const PRIVATE_KEY = /-----BEGIN [^-]*PRIVATE KEY-----[\s\S]*?-----END [^-]*PRIVATE KEY-----/g
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/=-]+/gi
const NAMED_SECRET = /\b(apiKey|token|password|identityNo|privateKey)=([^\s&,]+)/gi

export function redactComputeText(text: string) {
  return text
    .replace(PRIVATE_KEY, '[REDACTED_PRIVATE_KEY]')
    .replace(BEARER, '$1[REDACTED]')
    .replace(NAMED_SECRET, '$1=[REDACTED]')
}

export function reportComputeError(domain: string, error: unknown) {
  const kind = error instanceof ComputeCenterClientError ? error.kind : 'unknown'
  Sentry.captureMessage(`[compute-center] domain=${domain} kind=${kind}`)
}
```

- [ ] **Step 6: 实现临时凭证 hook 和错误边界**

```ts
export function useEphemeralCredential(
  ownerId: number | undefined,
  fetchCredential: (ownerId: number, signal: AbortSignal) => Promise<ComputePackageCredential>
) {
  const [value, setValue] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const mounted = useRef(true)
  const clear = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    if (mounted.current) { setValue(null); setLoading(false) }
  }, [])
  useEffect(() => {
    clear()
  }, [ownerId, clear])
  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      controller.current?.abort()
      controller.current = null
    }
  }, [])
  const reveal = useCallback(async () => {
    if (!ownerId || loading) return
    controller.current = new AbortController()
    setLoading(true)
    try {
      const credential = await fetchCredential(ownerId, controller.current.signal)
      if (mounted.current) setValue(credential.apiKey)
    } finally {
      if (mounted.current) setLoading(false)
    }
  }, [ownerId, loading, fetchCredential])
  return { value, loading, reveal, clear }
}
```

`ComputeDomainBoundary` 使用 class error boundary；正常和 fallback 根节点都设置 `data-testid={`compute-domain-${domain}`}`。fallback 文案固定为“该区域暂时无法显示”，提供“重新加载该区域”按钮，`componentDidCatch` 只调用 `report(domain, error)`，不得传递原始错误 message 给 Sentry。

- [ ] **Step 7: 运行安全/错误边界测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-utils/sensitive.test.ts src/renderer/routes/compute-center/-hooks/useEphemeralCredential.test.tsx src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx`

Expected: PASS；断言输出中不存在测试密钥、身份证号或私钥正文。

```bash
git add src/renderer/routes/compute-center/-utils/sensitive.ts src/renderer/routes/compute-center/-utils/sensitive.test.ts src/renderer/routes/compute-center/-hooks/useEphemeralCredential.ts src/renderer/routes/compute-center/-hooks/useEphemeralCredential.test.tsx src/renderer/routes/compute-center/-components/ComputeDomainBoundary.tsx src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx
git commit -m "fix(compute): isolate failures and protect credentials"
```

### Task 8: 拆分固定顶栏、反馈层和共享展示组件

**Files:**
- Create: `src/renderer/routes/compute-center/-components/Hero.tsx`
- Create: `src/renderer/routes/compute-center/-components/FeedbackToast.tsx`
- Create: `src/renderer/routes/compute-center/-components/CardHourTopUpModal.tsx`
- Create: `src/renderer/routes/compute-center/-components/common.tsx`
- Create: `src/renderer/routes/compute-center/-components/sharedComponents.test.tsx`
- Create: `src/renderer/routes/compute-center/-utils/formatters.ts`
- Create: `src/renderer/routes/compute-center/-utils/status.ts`
- Modify: `src/renderer/routes/compute-center.tsx:516-878,3767-4006`

**Interfaces:**
- Produces: `Hero`, `FeedbackToast`, `CardHourTopUpModal`, `Metric`, `Section`, `EmptyState`, `SimpleTable`, `StatusBadge`.
- Produces: `formatNumber`、`formatCardHours`、`formatTokens`、`formatDate`、`statusLabel`.

- [ ] **Step 1: 写固定资产、管理员按钮和三秒反馈失败测试**

```tsx
// @vitest-environment jsdom
it('shows fixed assets and the single admin entry for an administrator', () => {
  renderCompute(<Hero
    account={makeComputeAccount({ isAdmin: true, roles: ['BUYER', 'ADMIN'] })}
    rate={1.002}
    refreshing={false}
    onRefresh={() => undefined}
    onOpen={() => undefined}
  />)
  expect(screen.getByText('人民币余额')).toBeInTheDocument()
  expect(screen.getByText('可用卡时')).toBeInTheDocument()
  expect(screen.getByText('冻结卡时')).toBeInTheDocument()
  expect(screen.getByText('累计收益')).toBeInTheDocument()
  expect(screen.getByText('租金收益')).toBeInTheDocument()
  expect(screen.getAllByRole('button', { name: '进入算力管理后台' })).toHaveLength(1)
})

it('dismisses feedback after three seconds and by clicking the overlay', async () => {
  vi.useFakeTimers()
  const close = vi.fn()
  renderCompute(<FeedbackToast message={{ color: 'green', text: '购买成功' }} onClose={close} />)
  fireEvent.click(screen.getByTestId('compute-feedback-overlay'))
  expect(close).toHaveBeenCalledTimes(1)
  await act(() => vi.advanceTimersByTimeAsync(3000))
  expect(close).toHaveBeenCalledTimes(2)
  vi.useRealTimers()
})
```

- [ ] **Step 2: 运行测试并确认组件尚未拆出**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-components/sharedComponents.test.tsx`

Expected: FAIL，提示共享组件模块不存在。

- [ ] **Step 3: 原样移动 Hero、反馈、补足弹窗和通用表格**

`Hero` 保持资产顺序和唯一“进入算力管理后台”按钮；`FeedbackToast` 保持成功浅绿色、失败浅红色、居中自上而下弹出、3 秒关闭、× 和空白遮罩关闭；`CardHourTopUpModal` 只渲染 controller 提供的 quote 和 callbacks。

```tsx
export function FeedbackToast({ message, onClose }: Props) {
  useEffect(() => {
    if (!message) return
    const id = window.setTimeout(onClose, 3000)
    return () => window.clearTimeout(id)
  }, [message, onClose])
  if (!message) return null
  return (
    <Box data-testid="compute-feedback-overlay" onClick={onClose} className="compute-feedback-overlay">
      <Alert color={message.color} onClick={(event) => event.stopPropagation()} withCloseButton onClose={onClose}>
        {message.text}
      </Alert>
    </Box>
  )
}
```

- [ ] **Step 4: 原样移动纯格式化和状态标签映射**

`STATUS_LABELS`、GPU 资产状态、金额/卡时/Token/日期格式化必须从旧文件逐项移动，不改中文值。为 `undefined`、`null`、数字字符串、无效日期增加当前输出的表驱动测试。

- [ ] **Step 5: 用新导入替换路由中的内联定义并运行测试**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-components/sharedComponents.test.tsx src/renderer/routes/compute-center/-utils`

Expected: PASS，管理员入口恰好一个，反馈在 3 秒和手动关闭时均调用 `onClose`。

- [ ] **Step 6: 类型检查并提交**

Run: `pnpm check`

Expected: exit 0。

```bash
git add src/renderer/routes/compute-center/-components src/renderer/routes/compute-center/-utils src/renderer/routes/compute-center.tsx
git commit -m "refactor(compute): extract fixed header and shared UI"
```

### Task 9: 拆分算力市场和五秒行情

**Files:**
- Create: `src/renderer/routes/compute-center/-features/market/MarketFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/market/ProductCard.tsx`
- Create: `src/renderer/routes/compute-center/-features/market/ReservationModal.tsx`
- Create: `src/renderer/routes/compute-center/-features/market/MarketPricePanel.tsx`
- Create: `src/renderer/routes/compute-center/-features/market/marketPrice.ts`
- Create: `src/renderer/routes/compute-center/-features/market/MarketFeature.test.tsx`
- Create: `src/renderer/routes/compute-center/-features/market/marketPrice.test.ts`
- Modify: `src/renderer/routes/compute-center.tsx:879-1548`

**Interfaces:**
- Produces: `MarketFeature({ account, isLoggedIn, isBusy, runCardHourAction })`.
- Produces: `mergeLivePricePoints`、`marketPriceStatus`、`formatMarketPrice`、`formatChartTime`.
- Consumes: marketplace API, `computeQueryKeys`, shared components and action controller.

- [ ] **Step 1: 写公开市场、分类和商品卡失败测试**

```tsx
// @vitest-environment jsdom
it('allows a visitor to browse GPU, API, prices and card-hour market tabs', () => {
  installComputeFetchMock([
    { method: 'GET', path: '/api/compute/products', data: [makeGpuProduct(), makeApiProduct()] },
  ])
  renderCompute(<MarketFeature account={undefined} isLoggedIn={false} isBusy={() => false}
    run={() => Promise.resolve(true)} runCardHourAction={() => Promise.resolve(true)} />)
  expect(screen.getByRole('tab', { name: 'GPU 算力商品' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '模型 API 套餐' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '实时行情' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '卡时现货与询价' })).toBeInTheDocument()
})
```

- [ ] **Step 2: 写五秒轮询和历史点合并失败测试**

```ts
it('keeps a bounded ordered price series when live points arrive', () => {
  const result = mergeLivePricePoints(
    [{ timestamp: 1000, source: 'VAST_AI', medianPrice: 2 }],
    [{ timestamp: 2000, source: 'VAST_AI', medianPrice: 3 }],
    120
  )
  expect(result).toEqual([
    { timestamp: 1000, source: 'VAST_AI', medianPrice: 2 },
    { timestamp: 2000, source: 'VAST_AI', medianPrice: 3 },
  ])
})

// component test
vi.useFakeTimers()
renderCompute(<MarketPricePanel />)
await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1))
await act(() => vi.advanceTimersByTimeAsync(5000))
await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
vi.useRealTimers()
```

- [ ] **Step 3: 运行测试并确认 feature 不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/market`

Expected: FAIL，提示待创建模块不存在。

- [ ] **Step 4: 原样迁移市场组件并使用统一查询键**

```tsx
const productsQuery = useQuery({
  queryKey: computeQueryKeys.products(),
  queryFn: ({ signal }) => listComputeProducts(undefined, { signal }),
})

const latestQuery = useQuery({
  queryKey: computeQueryKeys.marketPrices(),
  queryFn: ({ signal }) => getComputeMarketPrices({ signal }),
  refetchInterval: 5000,
  refetchIntervalInBackground: false,
})
```

迁移 `MarketPanel`、`ProductCard`、`ProductSpec`、`ReservationModal`、`MarketPricePanel`、`MarketPriceQuoteCard`、`MarketPriceMatrix`、`MarketPriceChart` 和 chart helpers；商品字段、筛选、按钮文案、内测标记与确认弹窗保持不变。

- [ ] **Step 5: 把购买入口接入 action controller**

```tsx
onClick={() => void runCardHourAction(
  `activate-api:${product.id}`,
  (autoTopUp) => activateComputeApi(product.id, autoTopUp),
  'Token 套餐购买成功'
)}
```

GPU 固定套餐和预订使用包含 product ID、开始时间、结束时间和 GPU 数量的稳定 action key，按钮用 `isBusy(key)` 禁用；不在 UI 层重试请求。

- [ ] **Step 6: 运行市场测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/market src/renderer/packages/compute-center/coreDomains.contract.test.ts`

Expected: PASS，行情每 5000ms 刷新，访客仍能浏览，快速双击测试只产生一次写调用。

```bash
git add src/renderer/routes/compute-center/-features/market src/renderer/routes/compute-center.tsx
git commit -m "refactor(compute): isolate marketplace and live prices"
```

### Task 10: 拆分购买记录、Token 交付和通知

**Files:**
- Create: `src/renderer/routes/compute-center/-features/purchases/PurchasesFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/purchases/TokenPackageAssets.tsx`
- Create: `src/renderer/routes/compute-center/-features/purchases/PurchasesFeature.test.tsx`
- Create: `src/renderer/routes/compute-center/-features/notifications/NotificationsFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/notifications/NotificationsFeature.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx:1705-1938,2787-2841`

**Interfaces:**
- Produces: `PurchasesFeature` and `NotificationsFeature`.
- Consumes: package/notification APIs, `useEphemeralCredential`, `copyToClipboard`, query keys and action controller.

- [ ] **Step 1: 写 Token 套餐交付和凭证生命周期失败测试**

```tsx
// @vitest-environment jsdom
it('shows model and base URL but fetches the API key only after reveal', async () => {
  const fetchMock = installComputeFetchMock([
    { method: 'GET', path: '/api/compute/packages/purchases', data: [makePackagePurchase()] },
    { method: 'GET', path: '/api/compute/packages/purchases/11/credential', data: {
      purchaseId: 11,
      modelId: 'deepseek-v4-pro',
      baseUrl: 'https://proxy.example.invalid/v1',
      apiKey: 'proxy-secret',
      apiFormat: 'OpenAI',
      authenticationHeader: 'Authorization: Bearer',
      endpoints: ['/chat/completions'],
      keyStatus: 'ACTIVE',
    } },
  ])
  renderCompute(<PurchasesFeature sessionKey="session-a" />)
  expect(await screen.findByText('deepseek-v4-pro')).toBeInTheDocument()
  expect(screen.getByText('https://proxy.example.invalid/v1')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(1)
  fireEvent.click(screen.getByRole('button', { name: '显示 API Key' }))
  expect(await screen.findByText('proxy-secret')).toBeInTheDocument()
  expect(fetchMock).toHaveBeenCalledTimes(2)
})

it('removes the full key after hide, logout session change and unmount', async () => {
  const view = renderCompute(<PurchasesFeature sessionKey="session-a" />)
  fireEvent.click(await screen.findByRole('button', { name: '显示 API Key' }))
  expect(await screen.findByText('proxy-secret')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '隐藏 API Key' }))
  expect(screen.queryByText('proxy-secret')).not.toBeInTheDocument()
  view.rerender(<ComputeTestProvider><PurchasesFeature sessionKey="" /></ComputeTestProvider>)
  expect(screen.queryByText('proxy-secret')).not.toBeInTheDocument()
  view.unmount()
})
```

- [ ] **Step 2: 写通知显示、已读防重和反馈失败测试**

```tsx
it('routes notification updates through a stable action key', async () => {
  const run = vi.fn(async (_key, action) => { await action(); return true })
  const fetchMock = installComputeFetchMock([
    { method: 'GET', path: '/api/compute/notifications', data: [makeUnreadNotification()] },
    { method: 'POST', path: '/api/compute/notifications/4/read', data: makeReadNotification() },
  ])
  renderCompute(<NotificationsFeature isBusy={() => false} run={run} />)
  const button = await screen.findByRole('button', { name: '标为已读' })
  fireEvent.click(button)
  expect(run).toHaveBeenCalledWith('notification-read:4', expect.any(Function), '通知已标为已读')
  expect(fetchMock).toHaveBeenCalledWith(expect.stringContaining('/api/compute/notifications/4/read'), expect.anything())
})
```

- [ ] **Step 3: 运行测试并确认两个 feature 尚不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/purchases src/renderer/routes/compute-center/-features/notifications`

Expected: FAIL，提示 feature 模块不存在。

- [ ] **Step 4: 迁移购买记录并接入临时凭证**

```tsx
const purchases = useQuery({
  queryKey: computeQueryKeys.packagePurchases(),
  queryFn: ({ signal }) => listComputePackagePurchases({ signal }),
})

const credential = useEphemeralCredential(purchase.id, (id, signal) =>
  getComputePackageCredential(id, { signal })
)
```

保留模型、输入/输出剩余 Token、Base URL、API Key、API 格式、认证字段和两个独立复制按钮。API Key copy 只在 `credential.value` 非空时启用；Base URL 不属于秘密，可直接复制。

- [ ] **Step 5: 迁移通知并接入 query key/action controller**

```tsx
const notifications = useQuery({
  queryKey: computeQueryKeys.notifications(),
  queryFn: ({ signal }) => listComputeNotifications({ signal }),
})

const markRead = (id: number) => run(
  `notification-read:${id}`,
  () => markComputeNotificationRead(id),
  '通知已标为已读'
)
```

- [ ] **Step 6: 运行购买/通知/安全测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/purchases src/renderer/routes/compute-center/-features/notifications src/renderer/routes/compute-center/-hooks/useEphemeralCredential.test.tsx src/renderer/routes/compute-center/-utils/sensitive.test.ts`

Expected: PASS，完整 Key 只按需请求且清理后不在 DOM；通知重复点击由同一 action key 合并。

```bash
git add src/renderer/routes/compute-center/-features/purchases src/renderer/routes/compute-center/-features/notifications src/renderer/routes/compute-center.tsx
git commit -m "refactor(compute): isolate purchases and notifications"
```

### Task 11: 拆分我的资产、邀请、订单和转让

**Files:**
- Create: `src/renderer/routes/compute-center/-features/assets/AssetsFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/assets/ReferralInviteModal.tsx`
- Create: `src/renderer/routes/compute-center/-features/assets/AssetsFeature.test.tsx`
- Create: `src/renderer/routes/compute-center/-features/orders/OrdersFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/orders/ReservationCard.tsx`
- Create: `src/renderer/routes/compute-center/-features/orders/TransfersFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/orders/OrdersFeature.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx:467-515,715-878,1500-1704,1873-2205,2206-2332,3812-3899`

**Interfaces:**
- Produces: `AssetsFeature({ account, onOpen, run })` and `ReferralInviteModal`.
- Produces: `OrdersFeature({ account, isBusy, run, runCardHourAction })`.
- Consumes: account/reservation/transfer APIs, delivery-time utilities, query keys and action controller.

- [ ] **Step 1: 写资产核心呈现失败测试**

```tsx
// @vitest-environment jsdom
it('keeps all user asset and income metrics visible', () => {
  const account = makeComputeAccount({
    cnyBalance: 88,
    availableCardHours: 12,
    frozenCardHours: 2,
    lifetimeIncome: 20,
    rentalIncome: 15,
    commissionIncome: 5,
    gpuAssetCounts: {
      PENDING: 1, REJECTED: 0, RUNNING: 2, PENDING_DELIVERY: 1,
      ACTIVE_RENTAL: 1, PENDING_ACTION: 3, OFFLINE: 0,
    },
  })
  renderCompute(<AssetsFeature account={account} onOpen={() => undefined}
    isBusy={() => false} run={() => Promise.resolve(true)} />)
  for (const label of ['人民币余额', '可用卡时', '冻结卡时', '累计收益', '租金收益', '佣金收益']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
  for (const label of ['待审核', '运行中', '待交付', '待处理']) {
    expect(screen.getByText(label)).toBeInTheDocument()
  }
})
```

- [ ] **Step 2: 写订单交付和重复确认失败测试**

```tsx
it('shows GPU delivery in buyer orders and guards confirmation with one action key', async () => {
  const run = vi.fn(async (_key, action) => { await action(); return true })
  installComputeFetchMock([
    { method: 'GET', path: '/api/compute/reservations?role=buyer', data: [makeDeliveredReservation()] },
    { method: 'GET', path: '/api/compute/reservations?role=supplier', data: [] },
    { method: 'GET', path: '/api/compute/transfers', data: [] },
    { method: 'POST', path: '/api/compute/reservations/21/confirm', data: makeConfirmedReservation() },
  ])
  renderCompute(<OrdersFeature account={makeComputeAccount()} isBusy={() => false}
    run={run} runCardHourAction={() => Promise.resolve(true)} />)
  expect(await screen.findByText('H100 GPU 套餐')).toBeInTheDocument()
  expect(screen.getByText('商家交付信息')).toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
  expect(run).toHaveBeenCalledWith('reservation-confirm:21', expect.any(Function), '订单已确认完成')
})
```

- [ ] **Step 3: 运行测试并确认资产/订单 feature 不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/assets src/renderer/routes/compute-center/-features/orders`

Expected: FAIL，提示 feature 模块不存在。

- [ ] **Step 4: 迁移资产、账本、收益、提现和邀请 UI**

```tsx
const ledger = useQuery({
  queryKey: computeQueryKeys.ledger(),
  queryFn: ({ signal }) => listComputeLedger({ signal }),
})
const withdrawals = useQuery({
  queryKey: computeQueryKeys.withdrawals(),
  queryFn: ({ signal }) => listComputeWithdrawals({ signal }),
})
const referral = useQuery({
  queryKey: computeQueryKeys.referralProfile(),
  queryFn: ({ signal }) => getComputeReferralProfile({ signal }),
})
```

提现提交的 action key 使用 `withdraw:${requestId}`，`requestId` 在用户打开并确认一次提现意图时生成并贯穿该次调用，UI 重渲染不得重新生成。邀请绑定继续使用设备 UUID，不和登录邀请码字段绑定。

- [ ] **Step 5: 迁移订单、交付、争议和转让 UI**

```tsx
const buyerReservations = useQuery({
  queryKey: computeQueryKeys.reservations('buyer'),
  queryFn: ({ signal }) => listComputeReservations('buyer', { signal }),
})
const supplierReservations = useQuery({
  queryKey: computeQueryKeys.reservations('supplier'),
  queryFn: ({ signal }) => listComputeReservations('supplier', { signal }),
})
```

action key 固定为：`reservation-cancel:<id>`、`reservation-deliver:<id>`、`reservation-confirm:<id>`、`reservation-dispute:<id>`、`transfer-create:<recipient>:<amount>`、`transfer-accept:<id>`、`transfer-cancel:<id>`。交付信息仍只在“我的订单”显示给买方，供应方交付入口继续显示在其出租订单区域。

- [ ] **Step 6: 运行资产/订单/补足测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/assets src/renderer/routes/compute-center/-features/orders src/renderer/routes/compute-center/-hooks/computeActionEngine.test.ts src/renderer/packages/computeDeliveryTime.test.ts`

Expected: PASS，资产字段完整，订单交付可见，所有订单写入口使用稳定 action key。

```bash
git add src/renderer/routes/compute-center/-features/assets src/renderer/routes/compute-center/-features/orders src/renderer/routes/compute-center.tsx
git commit -m "refactor(compute): isolate assets and order delivery"
```

### Task 12: 拆分供应方认证、设备、商品和出租订单

**Files:**
- Create: `src/renderer/routes/compute-center/-features/supplier/SupplierFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/supplier/IdentityForm.tsx`
- Create: `src/renderer/routes/compute-center/-features/supplier/NodeForm.tsx`
- Create: `src/renderer/routes/compute-center/-features/supplier/ProductForm.tsx`
- Create: `src/renderer/routes/compute-center/-features/supplier/SupplierFeature.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx:2333-2786`

**Interfaces:**
- Produces: `SupplierFeature({ account, isBusy, run })`.
- Consumes: supplier API, image upload preparation, account roles, query keys and action controller.

- [ ] **Step 1: 写普通用户入驻和已认证供应方双角色失败测试**

```tsx
// @vitest-environment jsdom
it('lets a buyer start identity verification without losing buyer status', async () => {
  installComputeFetchMock([
    { method: 'GET', path: '/api/compute/identity/me', data: { status: 'NONE' } },
    { method: 'GET', path: '/api/compute/supplier', data: { status: 'NONE' } },
    { method: 'GET', path: '/api/compute/supplier/nodes', data: [] },
    { method: 'GET', path: '/api/compute/supplier/products', data: [] },
    { method: 'GET', path: '/api/compute/reservations?role=supplier', data: [] },
  ])
  renderCompute(<SupplierFeature account={makeComputeAccount({ roles: ['BUYER'] })}
    isBusy={() => false} run={() => Promise.resolve(true)} />)
  expect(await screen.findByText('实名认证')).toBeInTheDocument()
  expect(screen.getByLabelText('真实姓名')).toBeInTheDocument()
})

it('shows device, product and rental sections after supplier approval', async () => {
  renderCompute(<SupplierFeature account={makeComputeAccount({
    supplierStatus: 'APPROVED', roles: ['BUYER', 'SUPPLIER'],
  })} isBusy={() => false} run={() => Promise.resolve(true)} />)
  expect(await screen.findByText('设备与验机')).toBeInTheDocument()
  expect(screen.getByText('产品发布')).toBeInTheDocument()
  expect(screen.getByText('出租订单')).toBeInTheDocument()
})
```

- [ ] **Step 2: 写文件字段和 material 请求失败测试**

```tsx
it('submits only the supplier test files and never logs their content', async () => {
  const front = new File([new Uint8Array([1, 2])], 'front.png', { type: 'image/png' })
  const back = new File([new Uint8Array([3, 4])], 'back.png', { type: 'image/png' })
  const submit = vi.fn().mockResolvedValue({ status: 'PENDING' })
  renderCompute(<IdentityForm identity={{ status: 'NONE' }} isBusy={() => false}
    submit={submit} run={async (_key, action) => { await action(); return true }} />)
  await userEvent.type(screen.getByLabelText('真实姓名'), '内测用户甲')
  await userEvent.type(screen.getByLabelText('身份证号'), '110101199001011234')
  await userEvent.upload(screen.getByLabelText('身份证正面'), front)
  await userEvent.upload(screen.getByLabelText('身份证反面'), back)
  await userEvent.click(screen.getByRole('button', { name: '提交实名认证' }))
  expect(submit).toHaveBeenCalledWith({ realName: '内测用户甲', identityNo: '110101199001011234', front, back })
})
```

- [ ] **Step 3: 运行测试并确认供应方 feature 尚不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/supplier`

Expected: FAIL，提示待创建模块不存在。

- [ ] **Step 4: 迁移认证、设备、商品和出租订单**

```tsx
const identity = useQuery({
  queryKey: computeQueryKeys.identity(),
  queryFn: ({ signal }) => getComputeIdentity({ signal }),
})
const nodes = useQuery({
  queryKey: computeQueryKeys.supplierNodes(),
  queryFn: ({ signal }) => listSupplierNodes({ signal }),
})
const products = useQuery({
  queryKey: computeQueryKeys.supplierProducts(),
  queryFn: ({ signal }) => listSupplierProducts({ signal }),
})
```

保留真实姓名、身份证号、正反面图片字段；保留 GPU 节点硬件/连接方式与验机证明字段；保留商品图片、GPU 规格、数量、卡时价格、交付时限和 SLA 字段。提交按钮使用 `identity-submit`、`node-create`、`supplier-apply`、`product-create` 稳定 key。

- [ ] **Step 5: 确保 SSH 私钥不成为供应方或平台托管字段**

对照当前“商家自交付”业务，只保留现有买方公钥/商家交付信息流程；若旧 UI 仍展示“上传供应方 SSH 私钥或密码”，新增失败测试并删除该输入。不得新增保存卖方 root 私钥、密码或长期 SSH 凭证的客户端字段。

```ts
expect(screen.queryByLabelText('SSH 私钥')).not.toBeInTheDocument()
expect(screen.queryByLabelText('SSH 密码')).not.toBeInTheDocument()
expect(screen.getByLabelText('买方 SSH 公钥（只读）')).toBeInTheDocument()
```

- [ ] **Step 6: 运行供应方、上传和安全测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/supplier src/renderer/packages/computeImageUpload.test.ts src/renderer/routes/compute-center/-utils/sensitive.test.ts`

Expected: PASS，供应方仍是购买方；实名认证材料使用 material 上限；UI 不收集供应方私钥或密码。

```bash
git add src/renderer/routes/compute-center/-features/supplier src/renderer/routes/compute-center.tsx
git commit -m "refactor(compute): isolate supplier onboarding and delivery"
```

### Task 13: 拆分管理员审核与运营功能并封闭权限边界

**Files:**
- Create: `src/renderer/routes/compute-center/-features/admin/AdminFeature.tsx`
- Create: `src/renderer/routes/compute-center/-features/admin/AdminReviews.tsx`
- Create: `src/renderer/routes/compute-center/-features/admin/AdminOperations.tsx`
- Create: `src/renderer/routes/compute-center/-features/admin/AdminFeature.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx:2842-3766`

**Interfaces:**
- Produces: `AdminFeature({ account, isBusy, run })`.
- Consumes: admin API, query keys, domain boundary and action controller.
- Security invariant: `account.isAdmin !== true` means no admin component mount and no `/api/compute/admin/` request.

- [ ] **Step 1: 写非管理员零请求失败测试**

```tsx
// @vitest-environment jsdom
it('does not mount or request admin data for a non-admin account', async () => {
  const fetchMock = installComputeFetchMock([])
  renderCompute(<AdminFeature account={makeComputeAccount({ isAdmin: false })}
    isBusy={() => false} run={() => Promise.resolve(true)} />)
  expect(screen.queryByText('审核中心')).not.toBeInTheDocument()
  expect(fetchMock).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: 写管理员所有审核入口和另一管理员限制失败测试**

```tsx
it('shows review queues and blocks records submitted by the current administrator', async () => {
  installAdminReadRoutes({
    identity: [makeAdminIdentity({ userId: 10001 })],
    nodes: [makeAdminNode({ userId: 10001 })],
    products: [makeAdminProduct({ supplierUserId: 10001 })],
  })
  renderCompute(<AdminFeature account={makeComputeAccount({ userId: 10001, isAdmin: true, roles: ['BUYER', 'ADMIN'] })}
    isBusy={() => false} run={() => Promise.resolve(true)} />)
  expect(await screen.findByText('实名认证审核')).toBeInTheDocument()
  expect(screen.getByText('供应方审核')).toBeInTheDocument()
  expect(screen.getByText('GPU 节点验机')).toBeInTheDocument()
  expect(screen.getByText('商品审核')).toBeInTheDocument()
  expect(screen.getAllByText('请使用另一名管理员账号审核').length).toBeGreaterThan(0)
})
```

- [ ] **Step 3: 运行测试并确认管理员 feature 尚不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/admin`

Expected: FAIL，提示待创建模块不存在。

- [ ] **Step 4: 迁移管理员查询并以 enabled 做服务端数据门禁**

```tsx
const enabled = account?.isAdmin === true
const overview = useQuery({
  queryKey: computeQueryKeys.adminOverview(),
  queryFn: ({ signal }) => getComputeAdminOverview({ signal }),
  enabled,
})
const identities = useQuery({
  queryKey: computeQueryKeys.adminIdentities(),
  queryFn: ({ signal }) => listAdminIdentities({ signal }),
  enabled,
})
```

所有管理员 query 都设置同一 `enabled`；组件在非管理员时直接 `return null`。审核动作使用 `admin-identity-review:<id>`、`admin-node-review:<id>`、`admin-supplier-review:<id>`、`admin-product-review:<id>`、`admin-transfer-review:<id>`、`admin-reservation-resolve:<id>` 等唯一 key。

- [ ] **Step 5: 迁移审核、设备订单和运营设置**

移动 overview、settings、identity/node/supplier/product/transfer review、upstream assignment、proxy-key repair、reservation operations 和 grant card-hours。身份证图片和节点证明只在管理员主动查看时获取，关闭查看区域时撤销 object URL 并清理内存 Blob。

```ts
useEffect(() => () => {
  if (objectUrl) URL.revokeObjectURL(objectUrl)
}, [objectUrl])
```

- [ ] **Step 6: 运行管理员权限和安全测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/admin src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx src/renderer/routes/compute-center/-utils/sensitive.test.ts`

Expected: PASS，非管理员 0 次 admin 请求，管理员能看到全部现有审核区域，本人提交记录不可自审。

```bash
git add src/renderer/routes/compute-center/-features/admin src/renderer/routes/compute-center.tsx
git commit -m "refactor(compute): isolate and gate admin operations"
```

### Task 14: 拆分卡时现货、询价和发布市场

**Files:**
- Create: `src/renderer/routes/compute-center/-features/card-hours/CardHourMarketplace.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/ListingMarket.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/RfqMarket.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/ListingForm.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/CardHourMarketplace.test.tsx`
- Modify: `src/renderer/components/compute/CardHourBusiness.tsx:138-225,427-897`

**Interfaces:**
- Produces: `CardHourMarketplace` with existing account/login/action props.
- Consumes: card-hours API, query keys, action controller and existing fee/rate rules.

- [ ] **Step 1: 写访客、供应方发布和卡时不足确认失败测试**

```tsx
// @vitest-environment jsdom
it('keeps spot prices public and gates RFQ writes behind login', async () => {
  installCardHourPublicRoutes()
  renderCompute(<CardHourMarketplace account={undefined} isLoggedIn={false}
    isBusy={() => false} run={() => Promise.resolve(true)}
    runCardHourAction={() => Promise.resolve(true)} />)
  expect(await screen.findByText('卡时交易市场')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '卡时现货' })).toBeInTheDocument()
  fireEvent.click(screen.getByRole('tab', { name: '询价采购' }))
  expect(screen.getByText('登录后才能发布询价、查看报价或选中成交。')).toBeInTheDocument()
})

it('allows only an approved supplier to see the publishing form', async () => {
  installCardHourAuthenticatedRoutes()
  renderCompute(<CardHourMarketplace account={makeComputeAccount({ supplierStatus: 'APPROVED' })}
    isLoggedIn isBusy={() => false} run={() => Promise.resolve(true)}
    runCardHourAction={() => Promise.resolve(true)} />)
  fireEvent.click(screen.getByRole('tab', { name: '发布卡时' }))
  expect(screen.getByText('发布卡时销售商品')).toBeInTheDocument()
})
```

- [ ] **Step 2: 运行测试并确认新卡时市场 feature 不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/card-hours/CardHourMarketplace.test.tsx`

Expected: FAIL，提示待创建模块不存在。

- [ ] **Step 3: 迁移查询和 UI，保持查询键字节级一致**

```tsx
const listings = useQuery({
  queryKey: computeQueryKeys.listings(),
  queryFn: ({ signal }) => listCardHourMarketListings({ signal }),
})
const stats = useQuery({
  queryKey: computeQueryKeys.marketStats(),
  queryFn: ({ signal }) => getCardHourMarketStats({ signal }),
})
const rfqQuotes = useQuery({
  queryKey: computeQueryKeys.rfqQuotes(quotesFor?.id),
  queryFn: ({ signal }) => listCardHourRfqQuotes(quotesFor!.id, { signal }),
  enabled: Boolean(quotesFor),
})
```

现货购买和接受询价报价通过 `runCardHourAction`；创建/取消挂牌、创建询价、供应方报价通过 `run`。原 0.002 卡时交易费和双方各 0.001 的文案与服务端契约不变。

- [ ] **Step 4: 为每个市场写操作指定稳定 action key**

```ts
const keys = {
  listingCreate: (lotId: number) => `card-listing-create:${lotId}`,
  listingCancel: (id: number) => `card-listing-cancel:${id}`,
  quotePurchase: (id: number) => `card-listing-quote:${id}`,
  quoteConfirm: (id: number) => `card-listing-confirm:${id}`,
  rfqCreate: (model: string) => `card-rfq-create:${model}`,
  rfqQuote: (rfqId: number, lotId: number) => `card-rfq-quote:${rfqId}:${lotId}`,
  rfqAccept: (quoteId: number) => `card-rfq-accept:${quoteId}`,
}
```

- [ ] **Step 5: 运行卡时市场、补足和防重测试并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/card-hours/CardHourMarketplace.test.tsx src/renderer/routes/compute-center/-hooks/computeActionEngine.test.ts src/renderer/routes/compute-center/-hooks/useComputeActionController.test.tsx`

Expected: PASS，公开浏览不登录，发布受供应方认证限制，卡时不足仅确认后续跑一次。

```bash
git add src/renderer/routes/compute-center/-features/card-hours src/renderer/components/compute/CardHourBusiness.tsx
git commit -m "refactor(compute): isolate card-hour marketplace"
```

### Task 15: 拆分卡时资产、取出、记录和卡时管理员

**Files:**
- Create: `src/renderer/routes/compute-center/-features/card-hours/CardHourAssets.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/CustodyLedger.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/DepositPanel.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/RedemptionPanel.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/TradeRecords.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/CardHourAdminPanel.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/cardHourPresentation.ts`
- Create: `src/renderer/routes/compute-center/-features/card-hours/CardHourAssets.test.tsx`
- Create: `src/renderer/routes/compute-center/-features/card-hours/cardHourPresentation.test.ts`
- Modify: `src/renderer/components/compute/CardHourBusiness.tsx:226-426,898-1759`

**Interfaces:**
- Produces: `CardHourBusiness`、`CardHourAdminPanel` and exact existing public props.
- Produces: `formatCardHourAmount`、`formatCardHourMoney`、`formatCardHourDate`、`cardHourStatusLabel`、`futureDate`、`futureHours`、`localInput`、`toIso` pure helpers.

- [ ] **Step 1: 写卡时资产状态、收入和业务入口失败测试**

```tsx
// @vitest-environment jsdom
it('keeps custody, deposit, transfer and redemption tabs', async () => {
  installCardHourAuthenticatedRoutes()
  renderCompute(<CardHourBusiness account={makeComputeAccount({ supplierStatus: 'APPROVED' })}
    isLoggedIn isBusy={() => false} run={() => Promise.resolve(true)}
    runCardHourAction={() => Promise.resolve(true)} directTransferPanel={<div>定向转让表单</div>} />)
  for (const label of ['托管账本', '存入', '闲置转让', '取出', '团购', '分期', '置换']) {
    expect(await screen.findByRole('tab', { name: label })).toBeInTheDocument()
  }
})

it('keeps current status labels and formatting', () => {
  expect(cardHourStatusLabel('PENDING_DELIVERY')).toBe('待供应方交付')
  expect(cardHourStatusLabel('RUNNING')).toBe('运行中')
  expect(cardHourStatusLabel('PENDING_ACTION')).toBe('待补足/待处理')
  expect(formatCardHourAmount(1.23456)).toBe('1.235 卡时')
})
```

- [ ] **Step 2: 写取出、补足和争议操作 key 失败测试**

```tsx
it('routes redemption writes through stable action keys', async () => {
  const run = vi.fn().mockResolvedValue(true)
  const runCardHourAction = vi.fn().mockResolvedValue(true)
  renderCompute(<RedemptionPanel products={[makeGpuProduct()]} buyerEntries={[makeRedemption()]}
    supplierEntries={[]} account={makeComputeAccount()} isBusy={() => false}
    run={run} runCardHourAction={runCardHourAction} onDone={async () => undefined} />)
  fireEvent.click(screen.getByRole('button', { name: '确认完成' }))
  expect(run).toHaveBeenCalledWith('card-redemption-confirm:31', expect.any(Function), expect.any(String))
})
```

- [ ] **Step 3: 运行测试并确认待拆模块不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/card-hours/CardHourAssets.test.tsx src/renderer/routes/compute-center/-features/card-hours/cardHourPresentation.test.ts`

Expected: FAIL，提示模块不存在。

- [ ] **Step 4: 迁移卡时资产与纯展示规则**

```tsx
const buyerRedemptions = useQuery({
  queryKey: computeQueryKeys.redemptions('buyer'),
  queryFn: ({ signal }) => listCardHourRedemptions('buyer', { signal }),
  enabled: isLoggedIn,
})
const supplierRedemptions = useQuery({
  queryKey: computeQueryKeys.redemptions('supplier'),
  queryFn: ({ signal }) => listCardHourRedemptions('supplier', { signal }),
  enabled: isLoggedIn,
})
```

移动 custody、deposit、direct/idle transfer、redemption、trade/listing records 和三个 ComingSoon 面板；ComingSoon 文案保持原样，不把未开放的团购、分期或置换变成可写功能。

- [ ] **Step 5: 迁移卡时管理员并保护本人审核限制**

管理员查询使用 `computeQueryKeys.adminCardDeposits()` 和 `adminCardRedemptions()`；审核/解决 action key 固定为 `admin-card-deposit-review:<id>`、`admin-card-redemption-resolve:<id>`、`admin-card-rate-create:<version>`。本人提交的记录仍要求另一名管理员处理。

- [ ] **Step 6: 把旧 CardHourBusiness 文件收敛为兼容门面**

```ts
export { CardHourMarketplace } from '@/routes/compute-center/-features/card-hours/CardHourMarketplace'
export { CardHourBusiness } from '@/routes/compute-center/-features/card-hours/CardHourAssets'
export { CardHourAdminPanel } from '@/routes/compute-center/-features/card-hours/CardHourAdminPanel'
```

- [ ] **Step 7: 运行卡时全量测试、类型检查并提交**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-features/card-hours src/renderer/packages/compute-center/secondaryDomains.contract.test.ts`

Expected: PASS，公开市场、资产、取出、记录和管理员卡时功能均保留。

Run: `pnpm check`

Expected: exit 0。

```bash
git add src/renderer/routes/compute-center/-features/card-hours src/renderer/components/compute/CardHourBusiness.tsx
git commit -m "refactor(compute): split card-hour assets and administration"
```

### Task 16: 收敛路由为 shell 并安装全部领域错误边界

**Files:**
- Create: `src/renderer/routes/compute-center/-hooks/useComputeRootQueries.ts`
- Create: `src/renderer/routes/compute-center/-components/ComputeCenterShell.tsx`
- Create: `src/renderer/routes/compute-center/-components/ComputeCenterShell.test.tsx`
- Modify: `src/renderer/routes/compute-center.tsx:1-4006`

**Interfaces:**
- Produces: `useComputeRootQueries(isLoggedIn, inviteCode)` for config/products/account/referral-preview only.
- Produces: `ComputeCenterShell` with fixed Hero, public/login tabs and domain boundaries.
- Route keeps `validateSearch` and `Route` export unchanged.

- [ ] **Step 1: 写公开/登录 shell 和管理员固定入口失败测试**

```tsx
// @vitest-environment jsdom
it('mounts only public domains for a visitor', async () => {
  installComputeFetchMock([
    { method: 'GET', path: '/api/compute/config', data: {
      cardHourCnyRate: 1.002, cardHourRedeemRate: 1, usdCnyRate: 7, unitName: '卡时', currency: 'CNY',
    } },
    { method: 'GET', path: '/api/compute/products', data: [] },
  ])
  renderCompute(<ComputeCenterShell isLoggedIn={false} inviteCode={undefined} />)
  expect(screen.getByRole('tab', { name: '算力市场' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '卡时资产' })).toBeInTheDocument()
  expect(screen.queryByRole('tab', { name: '我的资产' })).not.toBeInTheDocument()
  expect(screen.queryByRole('button', { name: '进入算力管理后台' })).not.toBeInTheDocument()
})

it('shows authenticated tabs and one fixed admin button for an administrator', async () => {
  authInfoStore.getState().setTokens({ accessToken: 'test-token', refreshToken: 'test-token' })
  installComputeFetchMock([
    { method: 'GET', path: '/api/compute/config', data: {
      cardHourCnyRate: 1.002, cardHourRedeemRate: 1, usdCnyRate: 7, unitName: '卡时', currency: 'CNY',
    } },
    { method: 'GET', path: '/api/compute/products', data: [] },
    { method: 'GET', path: '/api/compute/account', data: makeComputeAccount({
      isAdmin: true, roles: ['BUYER', 'ADMIN'],
    }) },
  ])
  renderCompute(<ComputeCenterShell isLoggedIn inviteCode={undefined} />)
  expect(screen.getByRole('tab', { name: '我的资产' })).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '我的订单' })).toBeInTheDocument()
  expect(await screen.findAllByRole('button', { name: '进入算力管理后台' })).toHaveLength(1)
})
```

- [ ] **Step 2: 写 shell 确实安装 active domain 边界的失败测试**

```tsx
it('wraps the active market without a test-only feature injection API', () => {
  installComputeFetchMock([
    { method: 'GET', path: '/api/compute/config', data: {
      cardHourCnyRate: 1.002, cardHourRedeemRate: 1, usdCnyRate: 7, unitName: '卡时', currency: 'CNY',
    } },
    { method: 'GET', path: '/api/compute/products', data: [] },
  ])
  renderCompute(<ComputeCenterShell isLoggedIn={false} inviteCode={undefined} />)
  expect(screen.getByTestId('compute-domain-market')).toBeInTheDocument()
  expect(screen.getByRole('tab', { name: '卡时资产' })).toBeInTheDocument()
})
```

- [ ] **Step 3: 运行测试并确认 shell 尚不存在**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-components/ComputeCenterShell.test.tsx`

Expected: FAIL，提示 `ComputeCenterShell` 不存在。

- [ ] **Step 4: 实现根查询并传递 React Query signal**

```ts
export function useComputeRootQueries(isLoggedIn: boolean, inviteCode?: string) {
  return {
    config: useQuery({
      queryKey: computeQueryKeys.config(),
      queryFn: ({ signal }) => getComputeConfig({ signal }),
    }),
    products: useQuery({
      queryKey: computeQueryKeys.products(),
      queryFn: ({ signal }) => listComputeProducts(undefined, { signal }),
    }),
    account: useQuery({
      queryKey: computeQueryKeys.account(),
      queryFn: ({ signal }) => getComputeAccount({ signal }),
      enabled: isLoggedIn,
    }),
    referralPreview: useQuery({
      queryKey: computeQueryKeys.referralPreview(inviteCode),
      queryFn: ({ signal }) => previewComputeReferral(inviteCode || '', { signal }),
      enabled: isLoggedIn && Boolean(inviteCode),
      retry: false,
    }),
  }
}
```

- [ ] **Step 5: 实现 shell 并逐领域包裹 Error Boundary**

```tsx
<ComputeDomainBoundary domain="market" onRetry={() => void products.refetch()}>
  <MarketFeature account={account.data} isLoggedIn={isLoggedIn}
    isBusy={controller.isBusy} run={controller.run} runCardHourAction={controller.runCardHourAction} />
</ComputeDomainBoundary>

<ComputeDomainBoundary domain="orders" onRetry={() =>
  void queryClient.invalidateQueries({ queryKey: computeQueryKeys.reservations('buyer') })}>
  <OrdersFeature account={account.data} isBusy={controller.isBusy}
    run={controller.run} runCardHourAction={controller.runCardHourAction} />
</ComputeDomainBoundary>
```

为 market、card-hours、assets、purchases、orders、supplier、notifications、admin 分别设置独立 boundary。admin 只在 `account.data?.isAdmin === true` 时创建；固定 Hero 按钮通过 `setActiveTab('admin')` 打开后台，不在 Tabs.List 增加第二个管理员入口。

- [ ] **Step 6: 将路由文件收敛为连接 Route 与 shell 的薄入口**

```tsx
export const Route = createFileRoute('/compute-center')({
  component: ComputeCenterPage,
  validateSearch: zodValidator(computeSearchSchema),
})

export function ComputeCenterPage() {
  const search = Route.useSearch()
  const isLoggedIn = useAuthInfoStore((state) => Boolean(state.accessToken))
  return <ComputeCenterShell isLoggedIn={isLoggedIn} inviteCode={search.invite} />
}
```

删除已迁移的内联组件、类型、格式化和 API 导入；不修改 route path、搜索参数 schema 或 Sidebar 链接。

- [ ] **Step 7: 运行 shell、全部 feature 和类型检查**

Run: `pnpm exec vitest run src/renderer/routes/compute-center`

Expected: PASS，访客、购买方、供应方和管理员场景全部通过。

Run: `pnpm check`

Expected: exit 0；不存在循环导入或旧内联符号引用。

- [ ] **Step 8: 检查文件职责并提交**

Run:

```powershell
(Get-Content src/renderer/routes/compute-center.tsx).Count
Get-ChildItem src/renderer/routes/compute-center -Recurse -Include *.ts,*.tsx |
  ForEach-Object { [pscustomobject]@{ File=$_.FullName; Lines=(Get-Content $_.FullName).Count } } |
  Sort-Object Lines -Descending | Select-Object -First 20
```

Expected: 路由入口约 200–300 行；单个 feature 文件尽量不超过 500 行。超过 500 行时按展示子区域继续拆分，不改变接口或行为。

```bash
git add src/renderer/routes/compute-center.tsx src/renderer/routes/compute-center
git commit -m "refactor(compute): reduce route to domain shell"
```

### Task 17: 建立六类关键缺陷的静态和行为门禁

**Files:**
- Create: `src/renderer/routes/compute-center/-test/criticalFlows.test.ts`
- Create: `docs/superpowers/verification/compute-center-modular-refactor.md`

**Interfaces:**
- Produces: a single CI-visible test suite mapping login, deduction, ordering, secrecy, rendering and loading risks to concrete assertions.
- Consumes: existing tests and source tree; introduces no production API.

- [ ] **Step 1: 写 feature 禁止直接联网和禁止持久化密钥测试**

```ts
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

function sourceFiles(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name)
    return statSync(path).isDirectory() ? sourceFiles(path) : /\.(ts|tsx)$/.test(path) ? [path] : []
  })
}

it('keeps transport and secret persistence out of feature components', () => {
  const root = 'src/renderer/routes/compute-center/-features'
  for (const file of sourceFiles(root)) {
    const source = readFileSync(file, 'utf8')
    expect(source, file).not.toMatch(/\bfetch\s*\(/)
    expect(source, file).not.toMatch(/localStorage\.(setItem|getItem)\([^)]*(api.?key|token|private.?key)/i)
    expect(source, file).not.toMatch(/console\.(log|warn|error)\([^)]*(credential|api.?key|identityNo|privateKey)/i)
  }
})
```

- [ ] **Step 2: 写关键流程矩阵测试**

```ts
const CRITICAL_COMPUTE_TESTS = {
  loginFailure: 'src/renderer/packages/remote.auth.test.ts',
  incorrectDeduction: 'src/renderer/routes/compute-center/-hooks/useComputeActionController.test.tsx',
  duplicateOrder: 'src/renderer/routes/compute-center/-hooks/computeActionEngine.test.ts',
  dataLeak: 'src/renderer/routes/compute-center/-utils/sensitive.test.ts',
  pageCrash: 'src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx',
  permanentLoading: 'src/renderer/packages/compute-center/client.test.ts',
} as const

it.each(Object.entries(CRITICAL_COMPUTE_TESTS))('keeps %s covered by %s', (_risk, path) => {
  expect(statSync(path).isFile()).toBe(true)
  expect(readFileSync(path, 'utf8')).toContain("it('")
})
```

- [ ] **Step 3: 运行矩阵并修复任何缺失断言**

Run: `pnpm exec vitest run src/renderer/routes/compute-center/-test/criticalFlows.test.ts src/renderer/packages/remote.auth.test.ts src/renderer/routes/compute-center/-hooks src/renderer/routes/compute-center/-utils/sensitive.test.ts src/renderer/routes/compute-center/-components/ComputeDomainBoundary.test.tsx src/renderer/packages/compute-center/client.test.ts`

Expected: PASS；六个路径均被执行而不是只检查文件存在。

- [ ] **Step 4: 搜索所有算力写入口并确认 action controller 覆盖**

Run:

```powershell
rg -n "method:\s*'POST'|method:\s*'PUT'|method:\s*'DELETE'" src/renderer/packages/compute-center
rg -n "activateComputeApi|createComputeReservation|confirmComputeReservation|purchaseCardHours|withdrawComputeCardHours|createComputeTransfer|acceptComputeTransfer|createCardHour|confirmCardHour|acceptCardHour|deliverCardHour|reviewAdmin|resolveAdmin|grantAdmin" src/renderer/routes/compute-center
```

Expected: 每个 UI 写入口位于 `run` 或 `runCardHourAction` 回调内；API 写函数包含 `operation: 'write'`；不存在 feature 内直接发写请求。

- [ ] **Step 5: 记录非关键发现而不修改行为**

创建 `docs/superpowers/verification/compute-center-modular-refactor.md`，先写入本任务已执行的关键门禁命令、exit code 和执行时间。若搜索或测试发现不属于六类关键缺陷的问题，在“后续 OpenSpec 候选”表记录复现路径、影响和建议 change 名称；若未发现，则明确写入“本次定向审计未发现非关键候选”。本任务不得修复布局偏好、文案偏好、性能微调或新业务需求。

- [ ] **Step 6: 提交关键门禁**

```bash
git add src/renderer/routes/compute-center/-test/criticalFlows.test.ts docs/superpowers/verification/compute-center-modular-refactor.md
git commit -m "test(compute): enforce critical safety gates"
```

### Task 18: 添加真实环境严格只读冒烟脚本

**Files:**
- Create: `scripts/compute-center-readonly-smoke.ts`
- Create: `src/renderer/packages/compute-center/readonlySmoke.test.ts`
- Modify: `package.json:13-65`

**Interfaces:**
- Produces: `assertComputeSmokeRequest(method, path): void`.
- Produces: `assertComputeSmokeOrigin(origin): string`，只允许官网生产源和本机后端。
- Produces: command `pnpm smoke:compute-readonly`.
- Requires: `KOD_COMPUTE_SMOKE_TOKEN`; optional `KOD_COMPUTE_SMOKE_ORIGIN`, default `https://kod.kai.com`.

- [ ] **Step 1: 写 GET 白名单和敏感输出失败测试**

```ts
import { describe, expect, it, vi } from 'vitest'
import {
  assertComputeSmokeOrigin,
  assertComputeSmokeRequest,
  runComputeReadonlySmoke,
} from '../../../../scripts/compute-center-readonly-smoke'

describe('compute center read-only smoke guard', () => {
  it.each([
    ['/api/compute/config'],
    ['/api/compute/products'],
    ['/api/compute/account'],
  ])('allows GET %s', (path) => {
    expect(() => assertComputeSmokeRequest('GET', path)).not.toThrow()
  })

  it.each([
    ['POST', '/api/compute/account/purchase'],
    ['POST', '/api/compute/reservations'],
    ['POST', '/api/compute/transfers'],
    ['POST', '/api/compute/admin/products/1/review'],
    ['DELETE', '/api/compute/products/1'],
  ])('blocks %s %s', (method, path) => {
    expect(() => assertComputeSmokeRequest(method, path)).toThrow('Blocked non-read-only smoke request')
  })

  it('refuses to send the session token to an unapproved origin', () => {
    expect(() => assertComputeSmokeOrigin('https://attacker.example.invalid'))
      .toThrow('Blocked compute smoke origin')
  })

  it('reports endpoint status without printing token or response data', async () => {
    const log = vi.fn()
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ code: 0, data: { cnyBalance: 999 } })))
    await runComputeReadonlySmoke({ origin: 'http://localhost:8080', token: 'TEST_ONLY_TOKEN', fetcher, log })
    const output = log.mock.calls.flat().join(' ')
    expect(output).not.toContain('TEST_ONLY_TOKEN')
    expect(output).not.toContain('999')
    expect(output).toContain('GET /api/compute/account OK')
  })
})
```

- [ ] **Step 2: 运行测试并确认脚本不存在**

Run: `pnpm exec vitest run src/renderer/packages/compute-center/readonlySmoke.test.ts`

Expected: FAIL，提示脚本模块不存在。

- [ ] **Step 3: 实现白名单和只输出状态的冒烟脚本**

```ts
import { pathToFileURL } from 'node:url'

const ALLOWED = new Set([
  '/api/compute/config',
  '/api/compute/products',
  '/api/compute/account',
])
const ALLOWED_ORIGINS = new Set(['https://kod.kai.com', 'http://localhost:8080'])

interface Options {
  origin: string
  token: string
  fetcher?: typeof fetch
  log?: (message: string) => void
}

export function assertComputeSmokeRequest(method: string, path: string) {
  if (method !== 'GET' || !ALLOWED.has(path)) {
    throw new Error(`Blocked non-read-only smoke request: ${method} ${path}`)
  }
}

export function assertComputeSmokeOrigin(origin: string) {
  const normalized = new URL(origin).origin
  if (!ALLOWED_ORIGINS.has(normalized)) throw new Error(`Blocked compute smoke origin: ${normalized}`)
  return normalized
}

export async function runComputeReadonlySmoke({ origin, token, fetcher = fetch, log = console.log }: Options) {
  const safeOrigin = assertComputeSmokeOrigin(origin)
  for (const path of ALLOWED) {
    assertComputeSmokeRequest('GET', path)
    const response = await fetcher(`${safeOrigin}${path}`, {
      method: 'GET',
      headers: path === '/api/compute/account' ? { Authorization: `Bearer ${token}` } : {},
    })
    const envelope = await response.json() as { code?: number }
    if (!response.ok || envelope.code !== 0) throw new Error(`GET ${path} FAILED`)
    log(`GET ${path} OK`)
  }
}

async function main() {
  const token = process.env.KOD_COMPUTE_SMOKE_TOKEN
  if (!token) throw new Error('KOD_COMPUTE_SMOKE_TOKEN is required')
  await runComputeReadonlySmoke({
    origin: process.env.KOD_COMPUTE_SMOKE_ORIGIN || 'https://kod.kai.com',
    token,
  })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : 'Read-only smoke failed')
    process.exitCode = 1
  })
}
```

入口必须在缺少 `KOD_COMPUTE_SMOKE_TOKEN` 时退出并提示设置环境变量；不得回显 token。此脚本复用已有会话 token，不执行用户名/密码登录，因为登录可能写入会话或审计元数据。

- [ ] **Step 4: 添加 package script 并运行隔离测试**

```json
{
  "scripts": {
    "smoke:compute-readonly": "pnpm exec tsx scripts/compute-center-readonly-smoke.ts"
  }
}
```

Run: `pnpm exec vitest run src/renderer/packages/compute-center/readonlySmoke.test.ts`

Expected: PASS，所有 POST/DELETE 都在发网前被拒绝，输出不含 token 或响应资产值。

- [ ] **Step 5: 有明确 token 时运行真实只读冒烟，否则记录未执行原因**

Prerequisite: 仅在当前 PowerShell 会话已通过安全方式设置 `KOD_COMPUTE_SMOKE_TOKEN` 时继续；不要把 token 写入命令历史、计划、报告或仓库文件。

Run: `pnpm smoke:compute-readonly`

Expected: 仅输出三行 `GET <path> OK`；服务端访问日志中没有业务写请求。命令结束后执行 `Remove-Item Env:KOD_COMPUTE_SMOKE_TOKEN`。如果无法安全取得现有会话 token，不运行真实冒烟，并在验证报告中记录“未提供会话 token”，不得改用账号密码自动登录。

- [ ] **Step 6: 提交只读冒烟设施**

```bash
git add scripts/compute-center-readonly-smoke.ts src/renderer/packages/compute-center/readonlySmoke.test.ts package.json
git commit -m "test(compute): add guarded read-only smoke check"
```

### Task 19: 完成全量验证、四端证据和 OpenSpec 状态

**Files:**
- Modify: `docs/superpowers/verification/compute-center-modular-refactor.md`
- Modify: `openspec/changes/refactor-compute-center-modules/tasks.md`

**Interfaces:**
- Produces: auditable verification report containing command, exit code, timestamp, platform and limitations.
- Produces: checked OpenSpec tasks only where corresponding evidence exists.

- [ ] **Step 1: 运行算力中心定向测试**

Run: `pnpm exec vitest run src/renderer/packages/compute-center src/renderer/routes/compute-center src/renderer/packages/computeDeliveryTime.test.ts src/renderer/packages/computeImageUpload.test.ts src/renderer/packages/remote.auth.test.ts src/renderer/packages/compute-center/readonlySmoke.test.ts`

Expected: exit 0，0 failed，0 unhandled network requests。

- [ ] **Step 2: 运行全量测试、类型和 Biome 门禁**

Run: `pnpm test`

Expected: exit 0，0 failed。

Run: `pnpm check`

Expected: exit 0。

Run: `pnpm check:biome`

Expected: exit 0；如果存在与本变更无关的历史失败，在报告中列出原始文件和错误，本变更文件必须无新增错误。

- [ ] **Step 3: 运行 Windows/Electron 和 Web 生产构建**

Run: `pnpm build`

Expected: exit 0，Electron main/preload/renderer 构建完成。

Run: `pnpm build:web`

Expected: exit 0，Web renderer 产物生成且 sourcemap 清理完成。

- [ ] **Step 4: 运行 Android renderer 构建和 Capacitor 同步**

Run: `pnpm mobile:sync:android`

Expected: exit 0。若本机存在 Android SDK/Gradle wrapper，再运行 `.\android\gradlew.bat assembleDebug`，记录 APK 构建结果；缺少工具链时记录具体缺失项，不宣称 Android 原生验收完成。

- [ ] **Step 5: 运行 iOS renderer 构建和 Capacitor 同步**

Run: `pnpm mobile:sync:ios`

Expected: renderer 构建成功且 Capacitor sync 完成。随后在 macOS/Xcode 或 macOS CI 运行原生 build 和真机冒烟；当前 Windows 环境不得把 sync 结果写成 iOS 原生验收通过。

- [ ] **Step 6: 执行 Windows 桌面人工冒烟矩阵**

逐项记录通过/失败和截图路径：

1. 未登录能浏览 GPU、API、实时行情、卡时现货，不能看到资产和管理员数据。
2. 普通购买方能看到资产、购买记录、订单、设备入口；卡时足额购买成功。
3. 卡时不足且人民币足够时显示精确缺口；取消零扣款；确认后只补足并续跑一次。
4. 两种余额均不足时显示人民币缺口，只有确认后打开官网钱包。
5. Token 套餐显示模型、剩余输入/输出 Token、Base URL、API 格式和认证字段；完整 Key 仅主动显示并可清除。
6. GPU 订单交付只出现在对应买家“我的订单”；供应方能看到出租订单和交付入口。
7. 已认证供应方仍具备购买方功能，能管理实名认证、设备、商品和收益。
8. 管理员只有固定区域一个“进入算力管理后台”按钮；非管理员不发 admin 请求；本人资料由另一管理员审核。
9. 通知成功浅绿、失败浅红，从屏幕中间自上而下弹出，3 秒、×、空白区域均可关闭。
10. 同一购买/确认按钮快速连续点击只产生一条服务端写请求；网络断开后停止转圈并显示结果未知提示。

- [ ] **Step 7: 写验证报告并同步 OpenSpec 勾选**

报告必须包含：commit 范围、测试计数、构建命令与 exit code、真实只读冒烟结果、四端验证层级、六类关键修复、未执行项、回滚点、后续 OpenSpec 候选。只对已有证据的任务把 `- [ ]` 改成 `- [x]`。

- [ ] **Step 8: 严格验证 OpenSpec 和最终差异**

Run: `openspec.cmd validate refactor-compute-center-modules --type change --strict --json`

Expected: `passed: 1`、`failed: 0`。

Run: `git diff --check`

Expected: 无输出。

Run: `git status --short`

Expected: 只包含验证报告和 OpenSpec 勾选；不存在构建产物、真实凭证、证件图片、API Key 或数据库配置。

- [ ] **Step 9: 提交验证证据**

```bash
git add docs/superpowers/verification/compute-center-modular-refactor.md openspec/changes/refactor-compute-center-modules/tasks.md
git commit -m "docs(compute): record modular refactor verification"
```

- [ ] **Step 10: 提交后再次核对**

Run: `git status --short`

Expected: 无输出。

Run: `git log --oneline -12`

Expected: 能看到本计划产生的独立、按风险排序的算力中心提交，且没有后端或数据库提交。
