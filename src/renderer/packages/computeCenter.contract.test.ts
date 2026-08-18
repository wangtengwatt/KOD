import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getComputeConfig, reviewAdminIdentity } from './computeCenter'

const ofetchMock = vi.hoisted(() => vi.fn())

vi.mock('ofetch', () => ({ ofetch: ofetchMock }))

vi.mock('@/packages/remote', () => ({
  getKodApiOrigin: () => 'https://kod.example',
}))

vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: {
    getState: () => ({ accessToken: 'test-access-token' }),
  },
}))

describe('compute center API contracts', () => {
  beforeEach(() => {
    ofetchMock.mockReset()
  })

  it('reads public compute configuration without a bearer token', async () => {
    const config = {
      cardHourCnyRate: 1,
      cardHourRedeemRate: 2,
      usdCnyRate: 7,
      unitName: 'card hour',
      currency: 'CNY',
    }
    ofetchMock.mockResolvedValue({ code: 0, message: '', data: config })

    await expect(getComputeConfig()).resolves.toEqual(config)
    expect(ofetchMock).toHaveBeenCalledWith(
      'https://kod.example/api/compute/config',
      expect.objectContaining({ headers: {}, ignoreResponseError: true })
    )
  })

  it('submits an authenticated administrator identity review contract', async () => {
    const identity = { id: 17, status: 'APPROVED' }
    ofetchMock.mockResolvedValue({ code: 0, message: '', data: identity })

    await expect(reviewAdminIdentity(17, true, 'verified')).resolves.toEqual(identity)
    expect(ofetchMock).toHaveBeenCalledWith(
      'https://kod.example/api/compute/admin/identities/17/review',
      expect.objectContaining({
        method: 'POST',
        body: { approved: true, reason: 'verified' },
        headers: { Authorization: 'Bearer test-access-token' },
        ignoreResponseError: true,
      })
    )
  })
})
