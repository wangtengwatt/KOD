import { afterEach, describe, expect, it, vi } from 'vitest'
import { loginWithKod, sendKodEmailCode } from './remote'

const KOD_ORIGIN = 'https://kod.kai.com'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function readBody(init: RequestInit | undefined) {
  if (typeof init?.body === 'string') return JSON.parse(init.body)
  return init?.body
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('loginWithKod', () => {
  it('sends email, password, inviteCode and emailCode to /api/auth/login', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 0, message: '', data: { token: 'tok-1', newUser: true } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loginWithKod({
      email: 'a@b.com',
      password: 'pw',
      inviteCode: 'inv',
      emailCode: '123456',
    })

    expect(result).toEqual({ accessToken: 'tok-1', refreshToken: 'tok-1', newUser: true })

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${KOD_ORIGIN}/api/auth/login`)
    expect(init.method).toBe('POST')
    expect(readBody(init)).toEqual({
      email: 'a@b.com',
      password: 'pw',
      inviteCode: 'inv',
      emailCode: '123456',
    })
  })

  it('omits inviteCode and emailCode when not provided (ordinary login)', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ code: 0, message: '', data: { token: 'tok-2', newUser: false } }))
    vi.stubGlobal('fetch', fetchMock)

    const result = await loginWithKod({ email: 'user@example.com ', password: 'pw' })

    expect(result).toEqual({ accessToken: 'tok-2', refreshToken: 'tok-2', newUser: false })
    const [, init] = fetchMock.mock.calls[0]
    const body = readBody(init)
    expect(body).toEqual({ email: 'user@example.com ', password: 'pw' })
    expect(body).not.toHaveProperty('inviteCode')
    expect(body).not.toHaveProperty('emailCode')
  })

  it('throws on nonzero KOD envelope code with server message', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 1001, message: 'invalid credentials' })))
    await expect(loginWithKod({ email: 'a@b.com', password: 'pw' })).rejects.toThrow('invalid credentials')
  })

  it('throws when data is missing despite code 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 0, message: 'no data' })))
    await expect(loginWithKod({ email: 'a@b.com', password: 'pw' })).rejects.toThrow()
  })
})

describe('sendKodEmailCode', () => {
  it('posts email to /api/auth/send-code', async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ code: 0, message: '', data: null }))
    vi.stubGlobal('fetch', fetchMock)

    await sendKodEmailCode('a@b.com')

    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${KOD_ORIGIN}/api/auth/send-code`)
    expect(init.method).toBe('POST')
    expect(readBody(init)).toEqual({ email: 'a@b.com' })
  })

  it('resolves when code is 0', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 0, message: '', data: null })))
    await expect(sendKodEmailCode('a@b.com')).resolves.toBeUndefined()
  })

  it('throws with server message on nonzero code', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 1002, message: 'rate limited' })))
    await expect(sendKodEmailCode('a@b.com')).rejects.toThrow('rate limited')
  })

  it('throws default message when server message is empty', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(jsonResponse({ code: 1003, message: '' })))
    await expect(sendKodEmailCode('a@b.com')).rejects.toThrow('发送验证码失败')
  })
})
