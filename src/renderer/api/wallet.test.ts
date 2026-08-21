import { afterEach, describe, expect, it, vi } from 'vitest'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import { authInfoStore } from '@/stores/authInfoStore'
import {
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
  it('accepts snake_case and camelCase card-time balances', () => {
    expect(CardTimeAccountSchema.parse({ available_card_hours: '1.25' })).toEqual({ availableCardHours: 1.25 })
    expect(CardTimeAccountSchema.parse({ availableCardHours: 2 })).toEqual({ availableCardHours: 2 })
  })
  it('parses rewarded-ad status and claim decimal wire values', () => {
    const apiOrigin = getKodApiOrigin()
    expect(
      RewardedAdStatusWireSchema.parse({
        enabled: true,
        campaign_id: 'kod-reward-2026-08',
        reward_card_hours: '0.10',
        daily_limit: '3',
        claimed_today: 1,
        remaining_today: 2,
        min_watch_seconds: '90',
        next_available_at: null,
        video_url: '/api/ads/kod-reward-2026-08.mp4',
        poster_url: '/api/ads/kod-reward-2026-08-poster.jpg',
      })
    ).toEqual({
      enabled: true,
      campaignId: 'kod-reward-2026-08',
      rewardCardHours: 0.1,
      dailyLimit: 3,
      claimedToday: 1,
      remainingToday: 2,
      minWatchSeconds: 90,
      nextAvailableAt: null,
      videoUrl: new URL('/api/ads/kod-reward-2026-08.mp4', apiOrigin).toString(),
      posterUrl: new URL('/api/ads/kod-reward-2026-08-poster.jpg', apiOrigin).toString(),
    })
    expect(
      RewardedAdClaimSchema.parse({
        duplicated: false,
        reward_card_hours: '0.10',
        available_card_hours: '2.35',
        claimed_today: 1,
        remaining_today: 2,
        next_available_at: null,
      }).availableCardHours
    ).toBe(2.35)
  })
  it('rejects impossible rewarded-ad counters and cross-origin assets', () => {
    const base = {
      enabled: true,
      campaign_id: 'kod-reward-2026-08',
      reward_card_hours: 0.1,
      daily_limit: 3,
      claimed_today: 0,
      remaining_today: 3,
      min_watch_seconds: 90,
      next_available_at: null,
      video_url: '/api/ads/kod-reward-2026-08.mp4',
      poster_url: '/api/ads/kod-reward-2026-08-poster.jpg',
    }
    expect(() => RewardedAdStatusWireSchema.parse({ ...base, claimed_today: 4, remaining_today: 0 })).toThrow()
    expect(() => RewardedAdStatusWireSchema.parse({ ...base, video_url: 'https://attacker.example/ad.mp4' })).toThrow()
  })
  it('starts and claims rewarded ads without retrying POST requests', async () => {
    authInfoStore.getState().setTokens({ accessToken: 'secret', refreshToken: 'secret' })
    const fetchMock = vi.fn((url, init) => {
      const path = new URL(String(url)).pathname
      if (path.endsWith('/start')) {
        expect(JSON.parse(String(init?.body))).toEqual({ campaign_id: 'kod-reward-2026-08' })
        return ok({
          watch_id: 'a6f57048-6eef-4c98-a561-b817bc352242',
          campaign_id: 'kod-reward-2026-08',
          reward_card_hours: 0.1,
          min_watch_seconds: 90,
          expires_at: 1787068800,
        })
      }
      expect(path).toMatch(/\/claim$/)
      expect(JSON.parse(String(init?.body))).toEqual({ watch_id: 'a6f57048-6eef-4c98-a561-b817bc352242' })
      return ok({
        duplicated: false,
        reward_card_hours: 0.1,
        available_card_hours: 2.35,
        claimed_today: 1,
        remaining_today: 2,
        next_available_at: null,
      })
    })
    vi.stubGlobal('fetch', fetchMock)
    await expect(walletApi.startRewardedAd('kod-reward-2026-08')).resolves.toMatchObject({
      watchId: 'a6f57048-6eef-4c98-a561-b817bc352242',
    })
    await expect(walletApi.claimRewardedAd('a6f57048-6eef-4c98-a561-b817bc352242')).resolves.toMatchObject({
      availableCardHours: 2.35,
    })
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
  it.each(['/api/user/compute/account', '/api/user/compute/ad-reward/status'])(
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
