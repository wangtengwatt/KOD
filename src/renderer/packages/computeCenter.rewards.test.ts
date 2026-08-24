import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  ofetch: vi.fn(),
  prepareComputeImageUpload: vi.fn(),
  refreshKodSession: vi.fn(),
  authState: { accessToken: 'test-access-token' as string | null, accountId: 'account-7' as string | null },
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
  prepareComputeImageUpload: mocks.prepareComputeImageUpload,
}))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { getState: () => mocks.authState },
}))

import {
  ComputeAccountSchema,
  createEmailInvitation,
  createSupplierGpuProduct,
  createSupplierNode,
  EmailInvitationSchema,
  getComputeAccount,
  listEmailInvitations,
  listPlatformServerLeases,
  listPlatformServerSkus,
  PlatformServerLeaseSchema,
  PlatformServerSkuSchema,
  rentPlatformServer,
  setLeaseAutoRenew,
  submitComputeIdentity,
} from './computeCenter'

const pendingInvitation = {
  id: 101,
  inviterUserId: 7,
  email: 'friend@example.com',
  inviteCode: 'INVITE-CODE',
  inviteeUserId: null,
  status: 'PENDING',
  failureReason: '',
  createdAt: '2026-08-21T12:00:00',
  acceptedAt: null,
  expiresAt: '2026-09-20T12:00:00',
  registrationLink: '/register?email=friend%40example.com&emailInvite=INVITE-CODE',
} as const

const platformSku = {
  id: 42,
  skuCode: 'CN-A800-80G-1',
  name: 'A800 80G',
  description: 'Platform-managed monthly GPU server',
  region: 'cn-east',
  gpuModel: 'A800',
  gpuMemoryGb: 80,
  gpuCount: 1,
  cpuDescription: '32 vCPU',
  ramGb: 128,
  storageGb: 2048,
  networkDescription: '1 Gbps',
  monthlyRent: '720.000',
  platformSalePrice: '1.250',
  packageDurationHours: 720,
  deliveryDeadlineHours: 24,
  totalInventory: 4,
  availableInventory: 2,
  status: 'ACTIVE',
} as const

const platformLease = {
  id: 88,
  leaseNo: 'PL-20260821-0001',
  userId: 7,
  skuId: 42,
  requestId: 'rent-request-1',
  hostedNodeId: 501,
  productId: 601,
  monthlyRent: '720.000',
  salePrice: '1.250',
  status: 'ACTIVE',
  autoRenew: true,
  startedAt: '2026-08-21T12:00:00',
  expiresAt: '2026-09-20T12:00:00',
  stoppingAt: null,
  releasedAt: null,
  renewalCount: 0,
} as const

const computeAccount = {
  userId: '2084099947250954241',
  email: 'user@example.com',
  cnyBalance: '25.000',
  availableCardHours: '100.000',
  spendableCardHours: '100.000',
  redeemableCardHours: '90.000',
  rewardCardHours: '10.000',
  frozenCardHours: '0.000',
  lifetimeIncome: '12.000',
  lifetimeConsumption: '3.000',
  rentalIncome: '4.000',
  rentalIncomeCnyEquivalent: '4.000',
  commissionIncome: '0.000',
  pendingCommission: '0.000',
  totalIncomeCny: '4.000',
  invitedCount: 1,
  apiSalesIncome: '8.000',
  withdrawableCardHours: '90.000',
  supplierStatus: 'APPROVED',
  identityStatus: 'APPROVED',
  isAdmin: false,
  roles: ['BUYER', 'SUPPLIER'],
  deviceCounts: { PENDING: 0, DEPLOYING: 0, RUNNING: 1, PENDING_ACTION: 0 },
  gpuAssetCounts: {
    PENDING: 0,
    REJECTED: 0,
    RUNNING: 1,
    PENDING_DELIVERY: 0,
    ACTIVE_RENTAL: 0,
    PENDING_ACTION: 0,
    OFFLINE: 0,
  },
  cardHourCnyRate: '1.002',
  cardHourRedeemRate: '1.000',
  unitName: '卡时',
  currency: 'CNY',
  unreadNotifications: 0,
} as const

describe('reward referral and platform hosting contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
    mocks.authState.accessToken = 'test-access-token'
    mocks.authState.accountId = 'account-7'
    mocks.refreshKodSession.mockImplementation(() => {
      mocks.authState.accessToken = 'fresh-access-token'
      return Promise.resolve({
        accessToken: 'fresh-access-token',
        refreshToken: 'fresh-refresh-token',
        accountId: 'account-7',
      })
    })
  })

  it('parses complete pending and accepted invitation records', () => {
    expect(EmailInvitationSchema.parse(pendingInvitation)).toMatchObject({
      id: '101',
      email: 'friend@example.com',
      status: 'PENDING',
      acceptedAt: null,
    })
    expect(
      EmailInvitationSchema.parse({
        ...pendingInvitation,
        inviteeUserId: 9,
        status: 'ACCEPTED',
        acceptedAt: '2026-08-22T08:30:00',
      })
    ).toMatchObject({ inviteeUserId: '9', status: 'ACCEPTED', acceptedAt: '2026-08-22T08:30:00' })
  })

  it('rejects impossible local date-times from invitation and lease records', () => {
    expect(() => EmailInvitationSchema.parse({ ...pendingInvitation, createdAt: '2026-02-30T12:00:00' })).toThrow()
    expect(() => PlatformServerLeaseSchema.parse({ ...platformLease, expiresAt: 'not-a-date' })).toThrow()
  })

  it('parses qualified balances from the real compute account response', async () => {
    expect(ComputeAccountSchema.parse(computeAccount)).toMatchObject({
      availableCardHours: 100,
      spendableCardHours: 100,
      redeemableCardHours: 90,
      rewardCardHours: 10,
    })
    expect(() => ComputeAccountSchema.parse({ ...computeAccount, email: undefined })).toThrow()
    mocks.ofetch.mockResolvedValueOnce({ code: 0, data: computeAccount })
    await expect(getComputeAccount()).resolves.toMatchObject({ rewardCardHours: 10 })
    expect(mocks.ofetch).toHaveBeenCalledWith(
      'https://kod.test/api/compute/account',
      expect.objectContaining({ headers: { Authorization: 'Bearer test-access-token' } })
    )
  })

  it('refreshes one rejected session and retries the card-hour account with the fresh access token', async () => {
    mocks.ofetch
      .mockResolvedValueOnce({ code: 401, message: 'token expired', data: null })
      .mockResolvedValueOnce({ code: 0, data: computeAccount })

    await expect(getComputeAccount()).resolves.toMatchObject({ availableCardHours: 100, rewardCardHours: 10 })
    expect(mocks.refreshKodSession).toHaveBeenCalledTimes(1)
    expect(mocks.refreshKodSession).toHaveBeenCalledWith('test-access-token', 'account-7')
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      2,
      'https://kod.test/api/compute/account',
      expect.objectContaining({ headers: { Authorization: 'Bearer fresh-access-token' } })
    )
  })

  it('does not loop when the retried card-hour account request is still unauthorized', async () => {
    mocks.ofetch
      .mockResolvedValueOnce({ code: 401, message: 'token expired', data: null })
      .mockResolvedValueOnce({ code: 401, message: 'still unauthorized', data: null })

    await expect(getComputeAccount()).rejects.toThrow('still unauthorized')
    expect(mocks.refreshKodSession).toHaveBeenCalledTimes(1)
    expect(mocks.ofetch).toHaveBeenCalledTimes(2)
  })

  it('compares qualified balances as integer thousandths', () => {
    expect(
      ComputeAccountSchema.parse({
        ...computeAccount,
        availableCardHours: '0.800',
        spendableCardHours: '0.800',
        redeemableCardHours: '0.700',
        rewardCardHours: '0.100',
      })
    ).toMatchObject({ spendableCardHours: 0.8, redeemableCardHours: 0.7, rewardCardHours: 0.1 })
    expect(() =>
      ComputeAccountSchema.parse({
        ...computeAccount,
        availableCardHours: '0.801',
        spendableCardHours: '0.801',
        redeemableCardHours: '0.700',
        rewardCardHours: '0.100',
      })
    ).toThrow()
  })

  it('parses four-place commission money without relaxing its exact range', () => {
    const account = ComputeAccountSchema.parse({
      ...computeAccount,
      commissionIncome: '1.2345',
      pendingCommission: '0.0001',
    })
    expect(account.commissionIncome.toFixed(4)).toBe('1.2345')
    expect(account.pendingCommission.toFixed(4)).toBe('0.0001')
    for (const commissionIncome of ['1.23456', '900719925474.0992']) {
      expect(() => ComputeAccountSchema.parse({ ...computeAccount, commissionIncome })).toThrow()
    }
    expect(() =>
      ComputeAccountSchema.parse({ ...computeAccount, commissionIncome: Number('549755813888.0001') })
    ).toThrow()
  })

  it('validates and transforms every platform-controlled decimal', () => {
    expect(PlatformServerSkuSchema.parse(platformSku)).toMatchObject({
      id: '42',
      monthlyRent: 720,
      platformSalePrice: 1.25,
    })
    expect(PlatformServerLeaseSchema.parse(platformLease)).toMatchObject({
      id: '88',
      skuId: '42',
      monthlyRent: 720,
      salePrice: 1.25,
      autoRenew: true,
    })
    expect(() => PlatformServerSkuSchema.parse({ ...platformSku, monthlyRent: '720,000' })).toThrow()
    expect(() => PlatformServerLeaseSchema.parse({ ...platformLease, salePrice: '-1.000' })).toThrow()
    expect(() => PlatformServerSkuSchema.parse({ ...platformSku, monthlyRent: '720.0000' })).toThrow()
    expect(() => PlatformServerLeaseSchema.parse({ ...platformLease, salePrice: '8796093022208.001' })).toThrow()
    expect(() => PlatformServerLeaseSchema.parse({ ...platformLease, salePrice: '9007199254740.992' })).toThrow()
    expect(() =>
      PlatformServerLeaseSchema.parse({ ...platformLease, salePrice: Number('8796093022208.001') })
    ).toThrow()
  })

  it('rejects SKU inventory above the server-controlled total', () => {
    expect(() => PlatformServerSkuSchema.parse({ ...platformSku, availableInventory: 5 })).toThrow()
  })

  it('uses the backend invitation range and JSON contract', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0))
    mocks.ofetch
      .mockResolvedValueOnce({ code: 0, data: { acknowledgment: 'Invitation request received.' } })
      .mockResolvedValueOnce({ code: 0, data: [pendingInvitation] })

    await expect(createEmailInvitation('friend@example.com')).resolves.toEqual({
      acknowledgment: 'Invitation request received.',
    })
    await expect(listEmailInvitations(30)).resolves.toMatchObject([{ id: '101', status: 'PENDING' }])

    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      1,
      'https://kod.test/api/compute/referrals/email-invites',
      expect.objectContaining({
        method: 'POST',
        body: { email: 'friend@example.com' },
        retry: 0,
        headers: { Authorization: 'Bearer test-access-token' },
      })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      2,
      'https://kod.test/api/compute/referrals/email-invites?from=2026-07-22T12%3A00%3A00.000&to=2026-08-21T12%3A00%3A00.000',
      expect.any(Object)
    )
  })

  it('uses platform hosting paths, real mutation bodies, and no POST retries', async () => {
    mocks.ofetch
      .mockResolvedValueOnce({ code: 0, data: [platformSku] })
      .mockResolvedValueOnce({ code: 0, data: [platformLease] })
      .mockResolvedValueOnce({ code: 0, data: platformLease })
      .mockResolvedValueOnce({ code: 0, data: { ...platformLease, autoRenew: false } })

    await expect(listPlatformServerSkus()).resolves.toMatchObject([{ id: '42', monthlyRent: 720 }])
    await expect(listPlatformServerLeases()).resolves.toMatchObject([{ id: '88', autoRenew: true }])
    await expect(rentPlatformServer('42', 'rent-request-1')).resolves.toMatchObject({ id: '88', autoRenew: true })
    await expect(setLeaseAutoRenew('88', false)).resolves.toMatchObject({
      id: '88',
      autoRenew: false,
    })

    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      1,
      'https://kod.test/api/compute/platform-hosting/skus',
      expect.objectContaining({ headers: {}, ignoreResponseError: true })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      2,
      'https://kod.test/api/compute/platform-hosting/leases',
      expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer test-access-token' }) })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      3,
      'https://kod.test/api/compute/platform-hosting/leases',
      expect.objectContaining({ method: 'POST', body: { skuId: '42', requestId: 'rent-request-1' }, retry: 0 })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      4,
      'https://kod.test/api/compute/platform-hosting/leases/88/auto-renew',
      expect.objectContaining({
        method: 'POST',
        body: { enabled: false },
        retry: 0,
        headers: { Authorization: 'Bearer test-access-token' },
      })
    )
  })
})

describe('multi-stage compute uploads remain account-owned', () => {
  beforeEach(() => {
    mocks.ofetch.mockReset()
    mocks.prepareComputeImageUpload.mockReset()
  })

  it.each([
    [
      'identity',
      2,
      (file: File, isCurrentOwner: () => boolean) =>
        submitComputeIdentity({ realName: 'A', identityNo: 'ID-A', front: file, back: file }, isCurrentOwner),
    ],
    [
      'supplier node',
      1,
      (file: File, isCurrentOwner: () => boolean) =>
        createSupplierNode(
          {
            nodeName: 'A node',
            region: 'cn',
            gpuModel: 'H100',
            gpuMemoryGb: 80,
            gpuCount: 1,
            cpuDescription: 'cpu',
            ramGb: 64,
            storageGb: 1024,
            networkDescription: 'network',
            resourceProof: file,
          },
          isCurrentOwner
        ),
    ],
  ])(
    'does not submit %s material after the owner changes during image preparation',
    async (_name, prepareCount, submit) => {
      const releases: Array<(file: File) => void> = []
      mocks.prepareComputeImageUpload.mockImplementation(
        () =>
          new Promise<File>((resolve) => {
            releases.push(resolve)
          })
      )
      let current = true
      const file = new File(['a'], 'a.png', { type: 'image/png' })

      const pending = submit(file, () => current)
      await vi.waitFor(() => expect(mocks.prepareComputeImageUpload).toHaveBeenCalledTimes(prepareCount))
      current = false
      releases.forEach((release) => release(file))

      await expect(pending).rejects.toThrow('账户已切换')
      expect(mocks.ofetch).not.toHaveBeenCalled()
    }
  )

  it('does not upload product images with a new owner after product creation', async () => {
    mocks.ofetch.mockResolvedValueOnce({ code: 0, data: { id: 77 } })
    let release: ((file: File) => void) | undefined
    mocks.prepareComputeImageUpload.mockImplementation(
      () =>
        new Promise<File>((resolve) => {
          release = resolve
        })
    )
    let current = true
    const file = new File(['a'], 'a.png', { type: 'image/png' })

    const pending = createSupplierGpuProduct(
      { name: 'A product', description: '', region: 'cn' },
      [file],
      () => current
    )
    await vi.waitFor(() => expect(mocks.prepareComputeImageUpload).toHaveBeenCalledTimes(1))
    current = false
    release?.(file)

    await expect(pending).rejects.toThrow('账户已切换')
    expect(mocks.ofetch).toHaveBeenCalledTimes(1)
  })
})
