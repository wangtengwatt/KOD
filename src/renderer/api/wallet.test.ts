import { afterEach, describe, expect, it, vi } from 'vitest'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import { authInfoStore } from '@/stores/authInfoStore'
import {
  CardHourAccountSchema,
  CardTimeAccountSchema,
  PayMethodSchema,
  RewardedAdClaimSchema,
  RewardedAdStatusWireSchema,
  TopupHistorySchema,
  TopupInfoSchema,
  WalletApiError,
  walletApi,
} from './wallet'

const ok = (data: unknown) =>
  new Response(JSON.stringify({ code: 0, message: '', data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  })
afterEach(() => {
  vi.unstubAllGlobals()
  authInfoStore.getState().clearTokens()
})
describe('wallet contracts', () => {
  it('normalizes the website page_size recharge-history contract', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ items: [], total: 0, page: 1, page_size: 10 }))
    )

    await expect(walletApi.getTopupHistory(1, 10)).resolves.toEqual({
      items: [],
      total: 0,
      page: 1,
      pageSize: 10,
    })
  })

  it('parses object pay methods and epoch seconds', () => {
    expect(PayMethodSchema.parse({ name: '支付宝', type: 'alipay', min_topup: '5' }).minTopup).toBe(5)
    const history = TopupHistorySchema.parse({
      items: [
        {
          id: 1,
          user_id: 2,
          amount: 10,
          money: 9,
          trade_no: 'x',
          payment_method: 'alipay',
          payment_provider: null,
          create_time: 1720000000,
          complete_time: null,
          status: 'pending',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    })
    expect(history.items[0].completeTime).toBeNull()
  })

  it('accepts a standard successful empty page', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ items: [], total: 0, page: 1, pageSize: 10 }))
    )
    await expect(walletApi.getTopupHistory(1, 10)).resolves.toEqual({ items: [], total: 0, page: 1, pageSize: 10 })
  })

  it.each([[], null])('rejects invalid history data %j', async (data) => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok(data))
    )
    await expect(walletApi.getTopupHistory(1, 10)).rejects.toMatchObject({ kind: 'schema' })
  })
  it('parses nullable legacy fields, decimal strings, zero epoch and long IDs', () => {
    const record = TopupHistorySchema.parse({
      items: [
        {
          id: '9223372036854775807',
          user_id: '9007199254740993',
          amount: '10',
          money: '9.99',
          trade_no: null,
          payment_method: null,
          payment_provider: null,
          create_time: 1720000000,
          complete_time: 0,
          status: null,
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    }).items[0]
    expect(record).toMatchObject({
      id: '9223372036854775807',
      userId: '9007199254740993',
      amount: 10,
      money: 9.99,
      tradeNo: null,
      paymentMethod: null,
      status: null,
      completeTime: null,
    })
  })
  it.each([Infinity, NaN, '1e3', '', ' 10 ', 'Infinity'])('rejects invalid amount %s', (amount) => {
    expect(() =>
      TopupHistorySchema.parse({
        items: [
          {
            id: '1',
            user_id: '2',
            amount,
            money: 1,
            trade_no: null,
            payment_method: null,
            payment_provider: null,
            create_time: 1,
            complete_time: null,
            status: null,
          },
        ],
        total: 1,
        page: 1,
        pageSize: 10,
      })
    ).toThrow()
  })
  it('rejects negative or fractional accounting fields and invalid IDs', () => {
    const base = {
      id: '1',
      user_id: '2',
      amount: 1,
      money: 1,
      trade_no: null,
      payment_method: null,
      payment_provider: null,
      create_time: 1,
      complete_time: null,
      status: null,
    }
    for (const patch of [
      { amount: 1.5 },
      { create_time: -1 },
      { create_time: 1.5 },
      { complete_time: -1 },
      { complete_time: 1.5 },
      { id: -1 },
      { id: '1.5' },
    ]) {
      expect(() =>
        TopupHistorySchema.parse({ items: [{ ...base, ...patch }], total: 1, page: 1, pageSize: 10 })
      ).toThrow()
    }
  })
  it('accepts zero-valued accounting fields', () => {
    const item = TopupHistorySchema.parse({
      items: [
        {
          id: 0,
          user_id: 0,
          amount: 0,
          money: 0,
          trade_no: null,
          payment_method: null,
          payment_provider: null,
          create_time: 0,
          complete_time: 0,
          status: 'pending',
        },
      ],
      total: 1,
      page: 1,
      pageSize: 10,
    }).items[0]
    expect(item).toMatchObject({ id: '0', userId: '0', amount: 0, money: 0, createTime: 0, completeTime: null })
  })
  it('rejects negative record amounts and money', () => {
    const base = {
      id: '1',
      user_id: '2',
      trade_no: null,
      payment_method: null,
      payment_provider: null,
      create_time: 1,
      complete_time: null,
      status: null,
    }
    for (const [amount, money] of [
      [-1, 1],
      [1, -0.01],
    ]) {
      expect(() =>
        TopupHistorySchema.parse({ items: [{ ...base, amount, money }], total: 1, page: 1, pageSize: 10 })
      ).toThrow()
    }
  })
  it('requires total to cover returned items', () => {
    const item = {
      id: '1',
      user_id: '2',
      amount: 1,
      money: 1,
      trade_no: null,
      payment_method: null,
      payment_provider: null,
      create_time: 1,
      complete_time: null,
      status: null,
    }
    expect(() => TopupHistorySchema.parse({ items: [item], total: 0, page: 1, pageSize: 10 })).toThrow()
  })
  it('returns business failure before parsing data', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 4001, message: 'balance unavailable', data: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )
    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'business', message: 'balance unavailable' })
    expect(authInfoStore.getState()).toMatchObject({
      accessToken: 'secret',
      refreshToken: 'secret',
    })
  })
  it('clears the persisted session when a successful HTTP response carries an unauthorized result code', async () => {
    authInfoStore.getState().setTokens({
      accessToken: 'expired-access-token',
      refreshToken: 'expired-refresh-token',
      email: 'u@example.com',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 401, message: 'token 无效或已过期', data: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )

    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'auth', message: '登录状态已失效，请重新登录' })
    expect(authInfoStore.getState().accessToken).toBeNull()
    expect(authInfoStore.getState().refreshToken).toBeNull()
  })
  it('clears the persisted session when the HTTP status is unauthorized', async () => {
    authInfoStore.getState().setTokens({
      accessToken: 'expired-access-token',
      refreshToken: 'expired-refresh-token',
      email: 'u@example.com',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 401, message: 'unauthorized', data: null }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )

    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'auth' })
    expect(authInfoStore.getState().accessToken).toBeNull()
    expect(authInfoStore.getState().refreshToken).toBeNull()
  })
  it('clears the persisted session when a successful HTTP response carries a forbidden result code', async () => {
    authInfoStore.getState().setTokens({
      accessToken: 'forbidden-access-token',
      refreshToken: 'forbidden-refresh-token',
      email: 'u@example.com',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 403, message: 'forbidden', data: null }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )

    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'auth' })
    expect(authInfoStore.getState().accessToken).toBeNull()
    expect(authInfoStore.getState().refreshToken).toBeNull()
  })
  it('clears the persisted session when the HTTP status is forbidden', async () => {
    authInfoStore.getState().setTokens({
      accessToken: 'forbidden-access-token',
      refreshToken: 'forbidden-refresh-token',
      email: 'u@example.com',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ code: 403, message: 'forbidden', data: null }), {
            status: 403,
            headers: { 'Content-Type': 'application/json' },
          })
      )
    )

    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'auth' })
    expect(authInfoStore.getState().accessToken).toBeNull()
    expect(authInfoStore.getState().refreshToken).toBeNull()
  })
  it('does not clear a newer session when an older wallet request finishes unauthorized', async () => {
    authInfoStore.getState().setTokens({
      accessToken: 'old-access-token',
      refreshToken: 'old-refresh-token',
      email: 'old@example.com',
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => {
        authInfoStore.getState().setTokens({
          accessToken: 'new-access-token',
          refreshToken: 'new-refresh-token',
          email: 'new@example.com',
        })
        return new Response(JSON.stringify({ code: 401, message: 'token 无效或已过期', data: null }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        })
      })
    )

    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'auth' })
    expect(authInfoStore.getState()).toMatchObject({
      accessToken: 'new-access-token',
      refreshToken: 'new-refresh-token',
      loginEmail: 'new@example.com',
    })
  })
  it('logs only endpoint and issue path for schema failures', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret-token', refreshToken: 'secret' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ balance: 'private-value', historical_consumption: 3 }))
    )
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'schema' })
    expect(warning).toHaveBeenCalledWith('[wallet] schema endpoint=/api/user/wallet issue_path=balance')
    expect(warning.mock.calls.flat().join(' ')).not.toContain('secret-token')
    expect(warning.mock.calls.flat().join(' ')).not.toContain('private-value')
    warning.mockRestore()
  })
  it('requires bearer auth', async () => {
    await expect(walletApi.getWallet()).rejects.toMatchObject({ kind: 'auth' })
  })
  it('unwraps Result and sends bearer', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn((_url, init) => {
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret')
      return ok({ balance: 12.5, historical_consumption: 3 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(walletApi.getWallet()).resolves.toEqual({ balance: 12.5, historicalConsumption: 3 })
  })
  it('sends amount and payment_method when paying', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn((_url, init) => {
      expect(JSON.parse(String(init?.body))).toEqual({ amount: 10, payment_method: 'alipay' })
      return ok({ orderNo: 'order-1', paymentUrl: 'https://pay.example.com/order-1' })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(walletApi.pay(10, 'alipay')).resolves.toMatchObject({ orderNo: 'order-1' })
  })
  it('does not retry pay', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn(() => {
      throw new TypeError('offline')
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(walletApi.pay(10, 'alipay')).rejects.toBeInstanceOf(WalletApiError)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('keeps reward hours out of redeemable hours for snake_case and camelCase accounts', () => {
    expect(
      CardHourAccountSchema.parse({
        spendable_card_hours: '100.000',
        redeemable_card_hours: '90.000',
        reward_card_hours: '10.000',
      })
    ).toEqual({
      availableCardHours: 100,
      spendableCardHours: 100,
      redeemableCardHours: 90,
      rewardCardHours: 10,
    })
    expect(
      CardTimeAccountSchema.parse({ spendableCardHours: 2, redeemableCardHours: '1.25', rewardCardHours: '0.75' })
    ).toEqual({ availableCardHours: 2, spendableCardHours: 2, redeemableCardHours: 1.25, rewardCardHours: 0.75 })
  })
  it('keeps legacy available-only account responses compatible', () => {
    expect(CardTimeAccountSchema.parse({ available_card_hours: '1.250' })).toEqual({ availableCardHours: 1.25 })
    expect(CardTimeAccountSchema.parse({ availableCardHours: 2 })).toEqual({ availableCardHours: 2 })
    expect(CardTimeAccountSchema.parse({ available_card_hours: '1.250', availableCardHours: '1.25' })).toEqual({
      availableCardHours: 1.25,
    })
  })
  it('rejects conflicting aliases and partial qualified balance responses', () => {
    expect(() => CardTimeAccountSchema.parse({ available_card_hours: '1.250', availableCardHours: '1.251' })).toThrow()
    expect(() =>
      CardTimeAccountSchema.parse({
        availableCardHours: '2.000',
        spendable_card_hours: '2.000',
        spendableCardHours: '3.000',
        redeemable_card_hours: '1.250',
        reward_card_hours: '0.750',
      })
    ).toThrow()
    expect(() => CardTimeAccountSchema.parse({ available_card_hours: '2.000', reward_card_hours: '0.750' })).toThrow()
  })
  it('accepts only DECIMAL(20,3) values that are exact at the UI number boundary', () => {
    const boundary = CardTimeAccountSchema.parse({ available_card_hours: '8796093022207.999' })
    expect(boundary.availableCardHours.toFixed(3)).toBe('8796093022207.999')
    for (const spendable of ['1.0000', '8796093022208.001', '9007199254740.991', '99999999999999999.999']) {
      expect(() => CardTimeAccountSchema.parse({ available_card_hours: spendable })).toThrow()
    }
    expect(() => CardTimeAccountSchema.parse({ available_card_hours: Number('8796093022208.001') })).toThrow()
  })
  it('accepts frozen hours while rejecting malformed or impossible card-hour balances', () => {
    expect(
      CardHourAccountSchema.parse({
        spendable_card_hours: '95.000',
        redeemable_card_hours: '90.000',
        reward_card_hours: '10.000',
      })
    ).toEqual({ availableCardHours: 95, spendableCardHours: 95, redeemableCardHours: 90, rewardCardHours: 10 })
    expect(() =>
      CardHourAccountSchema.parse({
        spendable_card_hours: '100.000',
        redeemable_card_hours: '90,000',
        reward_card_hours: '10.000',
      })
    ).toThrow()
    expect(() =>
      CardHourAccountSchema.parse({
        spendable_card_hours: '101.000',
        redeemable_card_hours: '90.000',
        reward_card_hours: '10.000',
      })
    ).toThrow()
  })
  it('parses the server-managed rewarded-ad campaign and claim receipt', () => {
    const apiOrigin = getKodApiOrigin()
    expect(
      RewardedAdStatusWireSchema.parse({
        campaignId: 'kod-reward-2026-08',
        assetPath: '/api/compute/ad-reward/media/kod-ad.mp4',
        posterPath: '/api/ads/kod-reward-2026-08-poster.jpg',
        durationSeconds: 25,
        minimumSeconds: 25,
        rewardCardHours: '10.000',
        remainingCount: 1,
        nextEligibleDate: '2026-08-21',
        eligible: true,
      })
    ).toEqual({
      campaignId: 'kod-reward-2026-08',
      rewardCardHours: 10,
      remainingCount: 1,
      durationSeconds: 25,
      minimumSeconds: 25,
      nextEligibleDate: '2026-08-21',
      eligible: true,
      videoUrl: new URL('/api/compute/ad-reward/media/kod-ad.mp4', apiOrigin).toString(),
      posterUrl: new URL('/api/ads/kod-reward-2026-08-poster.jpg', apiOrigin).toString(),
    })
    expect(
      RewardedAdClaimSchema.parse({
        watchId: 17,
        rewardCardHours: '10.000',
        remainingCount: 0,
        nextEligibleDate: '2026-08-22',
      }).rewardCardHours
    ).toBe(10)
  })
  it('rejects impossible rewarded-ad counters and cross-origin assets', () => {
    const base = {
      campaignId: 'kod-reward-2026-08',
      assetPath: '/api/ads/kod-reward-2026-08.mp4',
      posterPath: '',
      durationSeconds: 25,
      minimumSeconds: 25,
      rewardCardHours: 10,
      remainingCount: 1,
      nextEligibleDate: '2026-08-21',
      eligible: true,
    }
    expect(() => RewardedAdStatusWireSchema.parse({ ...base, remainingCount: 2 })).toThrow()
    expect(() => RewardedAdStatusWireSchema.parse({ ...base, rewardCardHours: 11 })).toThrow()
    expect(() => RewardedAdStatusWireSchema.parse({ ...base, assetPath: 'https://attacker.example/ad.mp4' })).toThrow()
    expect(() =>
      RewardedAdClaimSchema.parse({
        watchId: 17,
        rewardCardHours: 11,
        remainingCount: 0,
        nextEligibleDate: '2026-08-22',
      })
    ).toThrow()
  })
  it('reports sequential playback, completes it, and claims without retrying POST requests', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn((url, init) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/start')) {
        expect(JSON.parse(String(init?.body))).toEqual({ campaignId: 'kod-reward-2026-08' })
        return ok({
          id: 17,
          campaignId: 'kod-reward-2026-08',
          assetPath: '/api/ads/kod-reward-2026-08.mp4',
          minimumSeconds: 25,
          startedAt: '2026-08-21T10:00:00Z',
          expiresAt: '2026-08-21T10:05:00Z',
          progressToken: 'start-token',
        })
      }
      if (path.endsWith('/progress')) {
        expect(JSON.parse(String(init?.body))).toEqual({
          watchId: 17,
          progressToken: 'start-token',
          mediaPositionSeconds: 1,
          sequence: 1,
          focused: true,
        })
        return ok({
          watchId: 17,
          mediaPositionSeconds: 1,
          sequence: 1,
          nextProgressToken: 'next-token',
          expiresAt: '2026-08-21T10:05:00Z',
        })
      }
      if (path.endsWith('/complete')) {
        expect(JSON.parse(String(init?.body))).toEqual({ watchId: 17, progressToken: 'next-token' })
        return ok({ watchId: 17, completedAt: '2026-08-21T10:00:25Z', expiresAt: '2026-08-21T10:05:00Z' })
      }
      if (path.endsWith('/abandon')) {
        expect(JSON.parse(String(init?.body))).toEqual({ watchId: 17 })
        return ok({ watchId: 17, abandonedAt: '2026-08-21T10:00:06Z' })
      }
      expect(path).toMatch(/\/claim$/)
      expect(JSON.parse(String(init?.body))).toEqual({ watchId: 17 })
      return ok({ watchId: 17, rewardCardHours: 10, remainingCount: 0, nextEligibleDate: '2026-08-22' })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(walletApi.startRewardedAd('kod-reward-2026-08')).resolves.toMatchObject({
      watchId: 17,
    })
    const progress = await walletApi.progressRewardedAd({
      watchId: 17,
      progressToken: 'start-token',
      mediaPositionSeconds: 1,
      sequence: 1,
      focused: true,
    })
    expect(progress.nextProgressToken).toBe('next-token')
    await expect(walletApi.abandonRewardedAd(17)).resolves.toMatchObject({ watchId: 17 })
    await expect(walletApi.completeRewardedAd(17, progress.nextProgressToken)).resolves.toMatchObject({ watchId: 17 })
    await expect(walletApi.claimRewardedAd(17)).resolves.toMatchObject({
      rewardCardHours: 10,
    })
    expect(fetchMock).toHaveBeenCalledTimes(5)
  })
  it('classifies an unsafe optional poster as a schema failure instead of a network failure', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        ok({
          campaignId: 'kod-reward-2026-08',
          assetPath: '/api/ads/kod-reward-2026-08.mp4',
          posterPath: 'https://attacker.example/poster.jpg',
          durationSeconds: 25,
          minimumSeconds: 25,
          rewardCardHours: 10,
          remainingCount: 1,
          nextEligibleDate: '2026-08-21',
          eligible: true,
        })
      )
    )

    await expect(walletApi.getRewardedAdStatus()).rejects.toMatchObject({ kind: 'schema' })
  })
  it('loads qualified balances from the real compute account route', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn((url) => {
      expect(new URL(String(url)).pathname).toBe('/api/compute/account')
      return ok({
        availableCardHours: '100.000',
        spendableCardHours: '100.000',
        redeemableCardHours: '90.000',
        rewardCardHours: '10.000',
      })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(walletApi.getCardTimeAccount()).resolves.toMatchObject({
      spendableCardHours: 100,
      redeemableCardHours: 90,
      rewardCardHours: 10,
    })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it('falls back to the legacy available-only route when the real account route is unavailable', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn((url) => {
      const path = new URL(String(url)).pathname
      if (path === '/api/compute/account') {
        return new Response(JSON.stringify({ message: 'No static resource /api/compute/account' }), {
          status: 404,
          headers: { 'Content-Type': 'application/json' },
        })
      }
      expect(path).toBe('/api/user/compute/account')
      return ok({ available_card_hours: '12.500' })
    })
    vi.stubGlobal('fetch', fetchMock)

    await expect(walletApi.getCardTimeAccount()).resolves.toEqual({ availableCardHours: 12.5 })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each(['/api/user/compute/account', '/api/compute/ad-reward/status'])(
    'classifies a missing feature route at %s without exposing the server exception',
    async (path) => {
      authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
      vi.stubGlobal(
        'fetch',
        vi.fn(
          async () =>
            new Response(
              JSON.stringify({
                code: 500,
                message: `No static resource ${path}; nested database diagnostics`,
                data: null,
              }),
              { status: 500, headers: { 'Content-Type': 'application/json' } }
            )
        )
      )

      const operation = path.endsWith('/account') ? walletApi.getCardTimeAccount() : walletApi.getRewardedAdStatus()
      const error = await operation.catch((caught) => caught)
      expect(error).toMatchObject({
        kind: 'unsupported',
        message: '当前服务端尚未开通卡时奖励',
        statusCode: 500,
      })
      expect(error).not.toMatchObject({ message: expect.stringContaining('database diagnostics') })
    }
  )
  it('rejects pagination responses that do not match the request', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret', email: 'u@example.com' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => ok({ items: [], total: 0, page: 1, pageSize: 10 }))
    )
    await expect(walletApi.getTopupHistory(2, 10)).rejects.toMatchObject({ kind: 'schema' })
  })
  it('validates topup configuration objects', () => {
    expect(
      TopupInfoSchema.parse({
        enable_online_topup: true,
        min_topup: 1,
        amount_options: [10],
        pay_methods: [{ name: 'A', type: 'a' }],
      }).payMethods[0].type
    ).toBe('a')
  })
  it('requires exact history pagination fields', () => {
    expect(() => TopupHistorySchema.parse({ items: [], total: 0 })).toThrow()
    expect(() => TopupHistorySchema.parse({ items: [], total: 0, page: 1, pageSize: 0 })).toThrow()
  })
  it('rejects unsafe numeric IDs but preserves long string IDs', () => {
    const base = {
      user_id: '2',
      amount: 1,
      money: 1,
      trade_no: null,
      payment_method: null,
      payment_provider: null,
      create_time: 1,
      complete_time: null,
      status: null,
    }
    expect(() =>
      TopupHistorySchema.parse({
        items: [{ ...base, id: Number.MAX_SAFE_INTEGER + 1 }],
        total: 1,
        page: 1,
        pageSize: 10,
      })
    ).toThrow()
    expect(
      TopupHistorySchema.parse({ items: [{ ...base, id: '9223372036854775807' }], total: 1, page: 1, pageSize: 10 })
        .items[0].id
    ).toBe('9223372036854775807')
  })
  it('uses p/pageSize query names and validates inputs', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret', email: 'u@example.com' })
    const fetchMock = vi.fn((url) => {
      expect(String(url)).toContain('/api/user/topup/self?p=2&pageSize=7')
      return ok({ items: [], total: 0, page: 2, pageSize: 7 })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(walletApi.getTopupHistory(2, 7)).resolves.toMatchObject({ page: 2, pageSize: 7 })
    await expect(walletApi.getTopupHistory(0, 7)).rejects.toThrow()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
