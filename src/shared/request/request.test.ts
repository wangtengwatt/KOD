import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, ChatboxAIAPIError } from '../models/errors'
import { createAfetch, createAuthenticatedAfetch } from './request'

const platformInfo = {
  type: 'desktop',
  platform: 'darwin',
  os: 'macos',
  version: '1.0.0',
}

describe('createAfetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores request id from Chatbox error body on known Chatbox errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            error: {
              code: 'token_quota_exhausted',
              request_id: 'req-from-body',
            },
          }),
          { status: 429 }
        )
      )
    )

    const afetch = createAfetch(platformInfo)

    await expect(
      afetch('https://api.chatboxai.app/gateway/openai/v1/chat/completions', {}, { parseChatboxRemoteError: true })
    ).rejects.toMatchObject({
      code: 10004,
      requestId: 'req-from-body',
    } satisfies Partial<ChatboxAIAPIError>)
  })

  it('stores request id from response headers on generic API errors', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ error: { code: 'not_a_real_code', request_id: 'req-from-body' } }), {
          status: 500,
          headers: { 'x-request-id': 'req-from-header' },
        })
      )
    )

    const afetch = createAfetch(platformInfo)

    await expect(
      afetch('https://api.chatboxai.app/gateway/openai/v1/chat/completions', {}, { parseChatboxRemoteError: true })
    ).rejects.toMatchObject({
      code: 10001,
      statusCode: 500,
      requestId: 'req-from-header',
    } satisfies Partial<ApiError>)
  })
})

describe('createAuthenticatedAfetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('reuses credentials refreshed by a concurrent request when an original 401 arrives late', async () => {
    let tokens = { accessToken: 'expired-access', refreshToken: 'refresh-a' }
    let expiredRequests = 0
    let resolveLateResponse!: (response: Response) => void
    const lateResponse = new Promise<Response>((resolve) => {
      resolveLateResponse = resolve
    })
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const accessToken = new Headers(init?.headers).get('x-kod-access-token')
      if (accessToken === 'fresh-access') return Promise.resolve(new Response('{}', { status: 200 }))
      expiredRequests += 1
      return expiredRequests === 1 ? Promise.resolve(new Response('{}', { status: 401 })) : lateResponse
    })
    vi.stubGlobal('fetch', fetchMock)
    const refreshTokens = vi.fn(async () => {
      tokens = { accessToken: 'fresh-access', refreshToken: 'refresh-b' }
      return tokens
    })
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => 0,
      refreshTokens,
      clearTokens: () => Promise.resolve(),
    })

    const first = afetch('https://kod.kai.com/api/account')
    const second = afetch('https://kod.kai.com/api/account')
    await expect(first).resolves.toMatchObject({ status: 200 })
    resolveLateResponse(new Response('{}', { status: 401 }))
    await expect(second).resolves.toMatchObject({ status: 200 })

    expect(refreshTokens).toHaveBeenCalledTimes(1)
  })

  it('does not retry an old request with a newly switched account', async () => {
    let sessionVersion = 1
    let tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' }
    let resolveOldResponse!: (response: Response) => void
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOldResponse = resolve
    })
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const accessToken = new Headers(init?.headers).get('x-kod-access-token')
      return accessToken === 'new-access' ? Promise.resolve(new Response('{}', { status: 200 })) : oldResponse
    })
    vi.stubGlobal('fetch', fetchMock)
    const refreshTokens = vi.fn(() => Promise.resolve(tokens))
    const clearTokens = vi.fn(() => Promise.resolve())
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => sessionVersion,
      refreshTokens,
      clearTokens,
    })

    const oldRequest = afetch('https://kod.kai.com/api/account')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    sessionVersion = 2
    tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' }
    resolveOldResponse(new Response('{}', { status: 401 }))

    await expect(oldRequest).rejects.toThrow(/session changed/i)
    expect(refreshTokens).not.toHaveBeenCalled()
    expect(clearTokens).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('rejects a successful old-account response that arrives after an account switch', async () => {
    let sessionVersion = 1
    let tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' }
    let resolveOldResponse!: (response: Response) => void
    const oldResponse = new Promise<Response>((resolve) => {
      resolveOldResponse = resolve
    })
    const fetchMock = vi.fn(() => oldResponse)
    vi.stubGlobal('fetch', fetchMock)
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => sessionVersion,
      refreshTokens: () => Promise.resolve(tokens),
      clearTokens: () => Promise.resolve(),
    })

    const request = afetch('https://kod.kai.com/api/account')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    sessionVersion = 2
    tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' }
    resolveOldResponse(new Response('{"owner":"old"}', { status: 200 }))

    await expect(request).rejects.toThrow(/session changed/i)
  })

  it('rejects a successful refreshed response if the account switches while retrying', async () => {
    let sessionVersion = 1
    let tokens = { accessToken: 'expired-access', refreshToken: 'old-refresh' }
    let resolveRetry!: (response: Response) => void
    const pendingRetry = new Promise<Response>((resolve) => {
      resolveRetry = resolve
    })
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response('{}', { status: 401 }))
      .mockReturnValueOnce(pendingRetry)
    vi.stubGlobal('fetch', fetchMock)
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => sessionVersion,
      refreshTokens: () => {
        tokens = { accessToken: 'fresh-old-access', refreshToken: 'fresh-old-refresh' }
        return Promise.resolve(tokens)
      },
      clearTokens: () => Promise.resolve(),
    })

    const request = afetch('https://kod.kai.com/api/account')
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    sessionVersion = 2
    tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' }
    resolveRetry(new Response('{"owner":"old"}', { status: 200 }))

    await expect(request).rejects.toThrow(/session changed/i)
  })

  it('does not clear a newly switched account when an old refresh rejects', async () => {
    let sessionVersion = 1
    let tokens = { accessToken: 'old-access', refreshToken: 'old-refresh' }
    let rejectRefresh!: (reason?: unknown) => void
    const pendingRefresh = new Promise<typeof tokens>((_resolve, reject) => {
      rejectRefresh = reject
    })
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })))
    )
    const refreshTokens = vi.fn(() => pendingRefresh)
    const clearTokens = vi.fn(() => Promise.resolve())
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => sessionVersion,
      refreshTokens,
      clearTokens,
    })

    const oldRequest = afetch('https://kod.kai.com/api/account')
    await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledOnce())
    sessionVersion = 2
    tokens = { accessToken: 'new-access', refreshToken: 'new-refresh' }
    rejectRefresh(new Error('old refresh rejected'))

    await expect(oldRequest).rejects.toMatchObject({ name: 'AuthenticatedRequestSessionChangedError' })
    expect(clearTokens).not.toHaveBeenCalled()
  })

  it('logs the current account out when the retried request is still unauthorized', async () => {
    let tokens = { accessToken: 'expired-access', refreshToken: 'refresh-a' }
    vi.stubGlobal(
      'fetch',
      vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })))
    )
    const clearTokens = vi.fn(() => Promise.resolve())
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => 1,
      refreshTokens: async () => {
        tokens = { accessToken: 'fresh-access', refreshToken: 'refresh-b' }
        return tokens
      },
      clearTokens,
    })

    await expect(afetch('https://kod.kai.com/api/account')).rejects.toMatchObject({
      name: 'AuthenticatedRequestSessionChangedError',
    })
    expect(clearTokens).toHaveBeenCalledOnce()
  })

  it('does not continue retrying with an old token after the current account is logged out', async () => {
    let sessionVersion = 1
    let tokens: { accessToken: string; refreshToken: string } | null = {
      accessToken: 'expired-access',
      refreshToken: 'refresh-a',
    }
    const fetchMock = vi.fn(() => Promise.resolve(new Response('{}', { status: 401 })))
    vi.stubGlobal('fetch', fetchMock)
    const clearTokens = vi.fn(() => {
      tokens = null
      sessionVersion += 1
      return Promise.resolve()
    })
    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: () => Promise.resolve(tokens),
      getSessionVersion: () => sessionVersion,
      refreshTokens: () => Promise.resolve({ accessToken: 'fresh-old-access', refreshToken: 'fresh-old-refresh' }),
      clearTokens,
    })

    await expect(afetch('https://kod.kai.com/api/account', undefined, { retry: 1 })).rejects.toMatchObject({
      name: 'AuthenticatedRequestSessionChangedError',
    })
    expect(clearTokens).toHaveBeenCalledOnce()
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })
})
