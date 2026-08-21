import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ ofetch: vi.fn() }))

vi.mock('ofetch', () => ({ ofetch: mocks.ofetch }))
vi.mock('@/packages/remote', () => ({ getKodApiOrigin: () => 'https://kod.test' }))
vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: { getState: () => ({ accessToken: 'test-access-token' }) },
}))

import {
  createEmailInvitation,
  EmailInvitationSchema,
  listEmailInvitations,
  listPlatformServerSkus,
  PlatformServerLeaseSchema,
  PlatformServerSkuSchema,
  rentPlatformServer,
  setLeaseAutoRenew,
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

describe('reward referral and platform hosting contracts', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useRealTimers()
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
  })

  it('uses the backend invitation range and JSON contract', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 7, 21, 12, 0, 0))
    mocks.ofetch
      .mockResolvedValueOnce({ code: 0, data: { acknowledgment: 'Invitation request received.' } })
      .mockResolvedValueOnce({ code: 0, data: [pendingInvitation] })

    await expect(createEmailInvitation('friend@example.com', 'invite-request-1')).resolves.toEqual({
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
        headers: expect.objectContaining({
          Authorization: 'Bearer test-access-token',
          'Idempotency-Key': 'invite-request-1',
        }),
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
      .mockResolvedValueOnce({ code: 0, data: platformLease })
      .mockResolvedValueOnce({ code: 0, data: { ...platformLease, autoRenew: false } })

    await expect(listPlatformServerSkus()).resolves.toMatchObject([{ id: '42', monthlyRent: 720 }])
    await expect(rentPlatformServer('42', 'rent-request-1')).resolves.toMatchObject({ id: '88', autoRenew: true })
    await expect(setLeaseAutoRenew('88', false, 'renew-request-1')).resolves.toMatchObject({
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
      expect.objectContaining({ method: 'POST', body: { skuId: '42', requestId: 'rent-request-1' }, retry: 0 })
    )
    expect(mocks.ofetch).toHaveBeenNthCalledWith(
      3,
      'https://kod.test/api/compute/platform-hosting/leases/88/auto-renew',
      expect.objectContaining({
        method: 'POST',
        body: { enabled: false },
        retry: 0,
        headers: expect.objectContaining({ 'Idempotency-Key': 'renew-request-1' }),
      })
    )
  })
})
