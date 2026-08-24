import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApiError, ChatboxAIAPIError } from '../models/errors'
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

describe('createAuthenticatedAfetch account isolation', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not refresh or replay a rejected account-a request after switching to account b', async () => {
    let tokens = { accessToken: 'account-a-access', refreshToken: 'account-a-refresh', accountId: 'account-a' }
    let resolveFirstResponse!: (response: Response) => void
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((resolve) => {
            resolveFirstResponse = resolve
          })
      )
      .mockResolvedValue(new Response(null, { status: 200 }))
    const refreshTokens = vi.fn().mockResolvedValue({
      accessToken: 'account-b-fresh',
      refreshToken: 'account-b-refresh-next',
      accountId: 'account-b',
    })
    vi.stubGlobal('fetch', fetchMock)

    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: async () => tokens,
      refreshTokens,
    })
    const request = afetch('https://kod.example/api/profile', undefined, { retry: 2 })
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())

    tokens = { accessToken: 'account-b-access', refreshToken: 'account-b-refresh', accountId: 'account-b' }
    resolveFirstResponse(new Response(null, { status: 401 }))

    await expect(request).rejects.toThrow('Authentication session changed')
    expect(refreshTokens).not.toHaveBeenCalled()
    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('does not let an account-b request join account-a in-flight refresh', async () => {
    type Tokens = { accessToken: string; refreshToken: string; accountId?: string }
    let tokens: Tokens = {
      accessToken: 'account-a-access',
      refreshToken: 'account-a-refresh',
      accountId: 'account-a',
    }
    let resolveAccountARefresh!: (tokens: Tokens) => void
    const accountARefresh = new Promise<Tokens>((resolve) => {
      resolveAccountARefresh = resolve
    })
    const refreshTokens = vi.fn(async (rejected: Tokens) => {
      const fresh =
        rejected.accountId === 'account-a'
          ? await accountARefresh
          : {
              accessToken: 'account-b-fresh',
              refreshToken: 'account-b-refresh-next',
              accountId: 'account-b',
            }
      if (tokens.accessToken === rejected.accessToken && tokens.accountId === rejected.accountId) tokens = fresh
      return fresh
    })
    const fetchMock = vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
      const accessToken = new Headers(init?.headers).get('x-kod-access-token')
      return new Response(null, { status: accessToken?.includes('fresh') ? 200 : 401 })
    })
    vi.stubGlobal('fetch', fetchMock)

    const afetch = createAuthenticatedAfetch({
      platformInfo,
      getTokens: async () => tokens,
      refreshTokens,
    })
    const accountARequest = afetch('https://kod.example/api/profile', undefined, { retry: 2 })
    await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledOnce())

    tokens = { accessToken: 'account-b-access', refreshToken: 'account-b-refresh', accountId: 'account-b' }
    const accountBRequest = afetch('https://kod.example/api/profile', undefined, { retry: 2 })

    await vi.waitFor(() => expect(refreshTokens).toHaveBeenCalledTimes(2))
    await expect(accountBRequest).resolves.toMatchObject({ status: 200 })
    resolveAccountARefresh({
      accessToken: 'account-a-fresh',
      refreshToken: 'account-a-refresh-next',
      accountId: 'account-a',
    })
    await expect(accountARequest).rejects.toThrow('Authentication session changed')
    expect(tokens).toEqual({
      accessToken: 'account-b-fresh',
      refreshToken: 'account-b-refresh-next',
      accountId: 'account-b',
    })
  })
})
