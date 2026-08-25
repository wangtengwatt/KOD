import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ofetch: vi.fn(),
  refreshKodSession: vi.fn(),
  authState: { accessToken: 'tenant-access-token' as string | null, accountId: '9007199254740993001' as string | null },
}))

vi.mock('ofetch', () => ({ ofetch: mocks.ofetch }))
vi.mock('@/packages/remote', () => ({
  getKodApiOrigin: () => 'https://kod.test',
  refreshKodSession: mocks.refreshKodSession,
}))
vi.mock('@/packages/computeImageUpload', () => ({
  COMPUTE_IMAGE_UPLOAD_MAX_BYTES: 800_000,
  COMPUTE_IMAGE_UPLOAD_RETRY_BYTES: 500_000,
  isComputeUploadSizeExceeded: () => false,
  prepareComputeImageUpload: vi.fn(),
}))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { getState: () => mocks.authState },
}))

import type { PlatformSkuAdminInput } from './computeCenter'
import * as computeCenter from './computeCenter'

type HostingLotteryContracts = {
  PlatformLeaseDetailsSchema: { parse: (value: unknown) => unknown }
  PlatformSkuAdminInputSchema: { parse: (value: unknown) => unknown }
  LotteryEligibilitySchema: { parse: (value: unknown) => unknown }
  LotteryDrawSchema: { parse: (value: unknown) => unknown }
  LotteryHistorySchema: { parse: (value: unknown) => unknown }
  LocalDemoCapabilitySchema: { parse: (value: unknown) => unknown }
  getPlatformLeaseDetails: (leaseId: string) => Promise<unknown>
  listAdminPlatformSkus: () => Promise<unknown>
  upsertAdminPlatformSku: (input: PlatformSkuAdminInput) => Promise<unknown>
  listLotteryEligibilities: (status?: 'PENDING' | 'DRAWN' | 'DISMISSED') => Promise<unknown>
  drawLotteryEligibility: (eligibilityId: string, requestId: string) => Promise<unknown>
  listLotteryHistory: () => Promise<unknown>
  getLocalDemoCapability: () => Promise<unknown>
  switchLocalDemoRole: (role: 'ADMIN' | 'HOSTING_TENANT' | 'GPU_BUYER') => Promise<unknown>
}

const contracts: HostingLotteryContracts = computeCenter

const ids = {
  user: '9007199254740993001',
  lease: '9007199254740993002',
  period: '9007199254740993003',
  ledger: '9007199254740993004',
  event: '9007199254740993005',
  reservation: '9007199254740993006',
  product: '9007199254740993007',
  order: '9007199254740993008',
  eligibility: '9007199254740993009',
  draw: '9007199254740993010',
} as const

const adminSku = {
  skuCode: 'KAI-H100-80G-1',
  name: 'KAI H100 80G',
  description: 'Managed monthly H100 server',
  region: 'cn-east',
  gpuModel: 'H100',
  gpuMemoryGb: 80,
  gpuCount: 1,
  cpuDescription: '32 vCPU',
  ramGb: 128,
  storageGb: 2048,
  networkDescription: '10 Gbps',
  monthlyRent: '720.000',
  platformSalePrice: '1.250',
  packageDurationHours: 720,
  deliveryDeadlineHours: 24,
  totalInventory: 4,
  status: 'ACTIVE',
} as const

const platformSku = { id: ids.product, ...adminSku, availableInventory: 3 } as const

const leaseDetails = {
  lease: {
    id: ids.lease,
    leaseNo: 'PL-20260825-0001',
    userId: ids.user,
    skuId: ids.product,
    requestId: 'rent-request-1',
    hostedNodeId: ids.product,
    productId: ids.product,
    monthlyRent: '720.000',
    salePrice: '1.250',
    status: 'ACTIVE',
    autoRenew: true,
    startedAt: '2026-08-25T12:00:00',
    expiresAt: '2026-09-25T12:00:00',
    stoppingAt: null,
    releasedAt: null,
    renewalCount: 0,
  },
  periods: [
    {
      id: ids.period,
      leaseId: ids.lease,
      periodNo: 1,
      rentCardHours: '720.000',
      startedAt: '2026-08-25T12:00:00',
      endsAt: '2026-09-25T12:00:00',
      paymentLedgerId: ids.ledger,
      status: 'ACTIVE',
      completedAt: null,
    },
  ],
  incomeEvents: [
    {
      id: ids.event,
      leaseId: ids.lease,
      reservationId: ids.reservation,
      productId: ids.product,
      orderId: ids.order,
      orderNo: 'ORDER-1',
      buyerUserId: ids.user,
      beneficiaryUserId: ids.user,
      grossCardHours: '12.000',
      platformFeeCardHours: '1.200',
      netIncomeCardHours: '10.800',
      supplierIncomeLedgerId: ids.ledger,
      settlementStatus: 'SETTLED',
      serviceStartedAt: '2026-08-25T12:00:00',
      serviceEndedAt: '2026-08-25T13:00:00',
      settledAt: '2026-08-25T13:00:00',
    },
  ],
  totalCost: '720.000',
  totalPendingIncome: '0.000',
  totalSettledIncome: '12.000',
  totalFee: '1.200',
  totalNetIncome: '10.800',
} as const

const lotteryEligibility = {
  id: ids.eligibility,
  beneficiaryUserId: ids.user,
  sourceType: 'GPU_RESERVATION',
  sourceId: ids.reservation,
  rewardBase: '12.000',
  status: 'PENDING',
  ruleVersion: 1,
  createdAt: '2026-08-25T13:00:00',
  drawnAt: null,
  dismissedAt: null,
} as const

const lotteryDraw = {
  id: ids.draw,
  eligibilityId: ids.eligibility,
  ruleVersion: 1,
  rateBasisPoints: 500,
  rewardAmount: '0.600',
  requestId: 'draw-request-1',
  rewardLedgerId: ids.ledger,
  drawnAt: '2026-08-25T13:01:00',
} as const

const lotteryHistory = {
  eligibilityId: ids.eligibility,
  drawId: ids.draw,
  sourceType: 'GPU_RESERVATION',
  sourceId: ids.reservation,
  rewardBase: '12.000',
  rewardAmount: '0.600',
  rewardLedgerId: null,
  ruleVersion: 1,
  rateBasisPoints: 500,
  drawnAt: '2026-08-25T13:01:00',
} as const

describe('hosting, lottery, and local demo contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.ofetch.mockReset()
    mocks.authState.accessToken = 'tenant-access-token'
    mocks.authState.accountId = ids.user
  })

  it('exposes all planned authenticated contract APIs', () => {
    expect(contracts.getPlatformLeaseDetails).toBeTypeOf('function')
    expect(contracts.listAdminPlatformSkus).toBeTypeOf('function')
    expect(contracts.upsertAdminPlatformSku).toBeTypeOf('function')
    expect(contracts.listLotteryEligibilities).toBeTypeOf('function')
    expect(contracts.drawLotteryEligibility).toBeTypeOf('function')
    expect(contracts.listLotteryHistory).toBeTypeOf('function')
    expect(contracts.getLocalDemoCapability).toBeTypeOf('function')
    expect(contracts.switchLocalDemoRole).toBeTypeOf('function')
  })

  it('decodes persistent lottery history without coercing IDs or decimals', () => {
    expect(contracts.LotteryHistorySchema.parse(lotteryHistory)).toEqual(lotteryHistory)
    expect(contracts.LotteryHistorySchema.parse({ ...lotteryHistory, rewardLedgerId: ids.ledger })).toMatchObject({
      rewardLedgerId: ids.ledger,
    })
    for (const field of ['eligibilityId', 'drawId', 'sourceId', 'rewardLedgerId'] as const) {
      expect(() =>
        contracts.LotteryHistorySchema.parse({
          ...lotteryHistory,
          [field]: Number(lotteryHistory[field] ?? ids.ledger),
        })
      ).toThrow()
    }
    for (const field of ['rewardBase', 'rewardAmount'] as const) {
      expect(() =>
        contracts.LotteryHistorySchema.parse({ ...lotteryHistory, [field]: Number(lotteryHistory[field]) })
      ).toThrow()
    }
    expect(() => contracts.LotteryHistorySchema.parse({ ...lotteryHistory, sourceType: 'GPU_ORDER' })).toThrow()
    expect(() => contracts.LotteryHistorySchema.parse({ ...lotteryHistory, ruleVersion: 1.5 })).toThrow()
    expect(() => contracts.LotteryHistorySchema.parse({ ...lotteryHistory, rateBasisPoints: 500.5 })).toThrow()
    expect(() => contracts.LotteryHistorySchema.parse({ ...lotteryHistory, unexpected: true })).toThrow()
  })

  it('accepts blank optional SKU descriptions and rejects every zero-valued positive field before requesting', () => {
    expect(
      contracts.PlatformSkuAdminInputSchema.parse({
        ...adminSku,
        cpuDescription: '',
        networkDescription: '',
        packageDurationHours: 8_760,
        deliveryDeadlineHours: 720,
      })
    ).toMatchObject({ cpuDescription: '', networkDescription: '' })

    const invalidInputs = [
      { ...adminSku, gpuMemoryGb: 0 },
      { ...adminSku, gpuCount: 0 },
      { ...adminSku, ramGb: 0 },
      { ...adminSku, storageGb: 0 },
      { ...adminSku, packageDurationHours: 0 },
      { ...adminSku, deliveryDeadlineHours: 0 },
      { ...adminSku, monthlyRent: '0.000' },
      { ...adminSku, platformSalePrice: '0.000' },
    ]

    for (const input of invalidInputs) {
      expect(() => contracts.upsertAdminPlatformSku(input as PlatformSkuAdminInput)).toThrow()
    }
    expect(() => contracts.PlatformSkuAdminInputSchema.parse({ ...adminSku, packageDurationHours: 8_761 })).toThrow()
    expect(() => contracts.PlatformSkuAdminInputSchema.parse({ ...adminSku, deliveryDeadlineHours: 721 })).toThrow()
    expect(() => contracts.PlatformSkuAdminInputSchema.parse({ ...adminSku, status: 'PAUSED' })).toThrow()
    expect(mocks.ofetch).not.toHaveBeenCalled()
  })

  it('rejects an invalid lottery status before sending a request', () => {
    mocks.ofetch.mockResolvedValue({ code: 0, data: [] })

    expect(() =>
      contracts.listLotteryEligibilities('INVALID' as Parameters<typeof contracts.listLotteryEligibilities>[0])
    ).toThrow()
    expect(mocks.ofetch).not.toHaveBeenCalled()
  })

  it('reads persistent lottery history from its authoritative route', async () => {
    mocks.ofetch.mockResolvedValueOnce({ code: 0, data: [lotteryHistory] })

    await expect(contracts.listLotteryHistory()).resolves.toEqual([lotteryHistory])
    expect(mocks.ofetch).toHaveBeenCalledWith(
      'https://kod.test/api/compute/lottery/history',
      expect.objectContaining({ headers: { Authorization: 'Bearer tenant-access-token' } })
    )
  })

  it('keeps 19-digit identifiers and decimal values as strings while rejecting numeric coercion and invalid enums', () => {
    expect(contracts.PlatformLeaseDetailsSchema.parse(leaseDetails)).toMatchObject({
      totalNetIncome: '10.800',
      periods: [{ id: ids.period, rentCardHours: '720.000' }],
      incomeEvents: [{ reservationId: ids.reservation, netIncomeCardHours: '10.800' }],
    })
    expect(contracts.PlatformSkuAdminInputSchema.parse(adminSku)).toMatchObject({ monthlyRent: '720.000' })
    expect(contracts.LotteryEligibilitySchema.parse(lotteryEligibility)).toMatchObject({ rewardBase: '12.000' })
    expect(contracts.LotteryDrawSchema.parse(lotteryDraw)).toMatchObject({ rewardAmount: '0.600' })
    expect(
      contracts.LocalDemoCapabilitySchema.parse({ enabled: true, roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'] })
    ).toEqual({
      enabled: true,
      roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'],
    })

    expect(() => contracts.PlatformLeaseDetailsSchema.parse({ ...leaseDetails, totalCost: 720 })).toThrow()
    expect(() =>
      contracts.PlatformLeaseDetailsSchema.parse({
        ...leaseDetails,
        lease: { ...leaseDetails.lease, id: Number(ids.lease) },
      })
    ).toThrow()
    expect(() => contracts.PlatformSkuAdminInputSchema.parse({ ...adminSku, monthlyRent: '720.0000' })).toThrow()
    expect(() => contracts.LotteryEligibilitySchema.parse({ ...lotteryEligibility, sourceType: 'GPU_ORDER' })).toThrow()
    expect(() => contracts.LotteryDrawSchema.parse({ ...lotteryDraw, rateBasisPoints: 400 })).toThrow()
    expect(() => contracts.LocalDemoCapabilitySchema.parse({ enabled: true, roles: ['OPERATOR'] })).toThrow()
  })

  it('uses exact routes, methods, bodies, and the captured authenticated identity', async () => {
    mocks.ofetch
      .mockResolvedValueOnce({ code: 0, data: leaseDetails })
      .mockResolvedValueOnce({ code: 0, data: [platformSku] })
      .mockResolvedValueOnce({ code: 0, data: platformSku })
      .mockResolvedValueOnce({ code: 0, data: [lotteryEligibility] })
      .mockResolvedValueOnce({ code: 0, data: lotteryDraw })
      .mockResolvedValueOnce({ code: 0, data: { enabled: true, roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'] } })
      .mockResolvedValueOnce({
        code: 0,
        data: { token: 'demo-access-token', refreshToken: 'demo-refresh-token', accountId: ids.user },
      })

    await expect(contracts.getPlatformLeaseDetails(ids.lease)).resolves.toMatchObject({ totalCost: '720.000' })
    await expect(contracts.listAdminPlatformSkus()).resolves.toMatchObject([
      { id: ids.product, monthlyRent: '720.000' },
    ])
    await expect(contracts.upsertAdminPlatformSku(adminSku)).resolves.toMatchObject({
      id: ids.product,
      status: 'ACTIVE',
    })
    await expect(contracts.listLotteryEligibilities('PENDING')).resolves.toMatchObject([{ id: ids.eligibility }])
    await expect(contracts.drawLotteryEligibility(ids.eligibility, 'draw-request-1')).resolves.toMatchObject({
      id: ids.draw,
    })
    await expect(contracts.getLocalDemoCapability()).resolves.toEqual({
      enabled: true,
      roles: ['ADMIN', 'HOSTING_TENANT', 'GPU_BUYER'],
    })
    await expect(contracts.switchLocalDemoRole('HOSTING_TENANT')).resolves.toMatchObject({ accountId: ids.user })

    const authenticated = { Authorization: 'Bearer tenant-access-token' }
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      1,
      `https://kod.test/api/compute/platform-hosting/leases/${ids.lease}`,
      expect.objectContaining({ headers: authenticated })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      2,
      'https://kod.test/api/compute/admin/platform-hosting/skus',
      expect.objectContaining({ headers: authenticated })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      3,
      'https://kod.test/api/compute/admin/platform-hosting/skus',
      expect.objectContaining({ method: 'POST', body: adminSku, retry: 0, headers: authenticated })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      4,
      'https://kod.test/api/compute/lottery/eligibilities?status=PENDING',
      expect.objectContaining({ headers: authenticated })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      5,
      `https://kod.test/api/compute/lottery/eligibilities/${ids.eligibility}/draw`,
      expect.objectContaining({
        method: 'POST',
        body: { requestId: 'draw-request-1' },
        retry: 0,
        headers: authenticated,
      })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      6,
      'https://kod.test/api/compute/local-demo/capability',
      expect.objectContaining({ headers: authenticated })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      7,
      'https://kod.test/api/compute/local-demo/session/HOSTING_TENANT',
      expect.objectContaining({ method: 'POST', retry: 0, headers: authenticated })
    )
  })

  it('rejects a response that arrives after the authenticated account changes', async () => {
    let resolveResponse: ((value: unknown) => void) | undefined
    mocks.ofetch.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveResponse = resolve
        })
    )

    const pending = contracts.getPlatformLeaseDetails(ids.lease)
    mocks.authState.accountId = '9007199254740993999'
    resolveResponse?.({ code: 0, data: leaseDetails })

    await expect(pending).rejects.toThrow('账户已切换')
  })
})
