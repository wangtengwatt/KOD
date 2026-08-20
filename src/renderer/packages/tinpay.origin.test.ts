import { beforeEach, describe, expect, it, vi } from 'vitest'

const authenticatedFetch = vi.hoisted(() => vi.fn())

vi.mock('@/variables', () => ({
  KOD_API_ORIGIN: 'https://kod.kai.com',
  NODE_ENV: 'development',
  USE_LOCAL_API: 'true',
}))

vi.mock('./remote', () => ({
  getAuthenticatedAfetch: vi.fn(async () => authenticatedFetch),
}))

import { createTinpaySession, getTinpaySession } from './tinpay'

const sessionId = 'tp_demo_0123456789abcdef0123'
const session = {
  sessionId,
  checkoutUrl: 'https://tinpay.kai.com/demo',
  expiresAt: '2026-08-20T12:00:00+08:00',
  demoOnly: true,
  status: 'CREATED',
}

beforeEach(() => {
  authenticatedFetch.mockReset()
})

describe('Tinpay KOD backend origin', () => {
  it('uses the explicitly selected local KOD backend for authenticated create requests', async () => {
    authenticatedFetch.mockResolvedValue(
      new Response(JSON.stringify(session), { status: 200, headers: { 'Content-Type': 'application/json' } })
    )

    await createTinpaySession({
      product: 'demo',
      scene: 'settings',
      electron: { platform: 'windows', container: 'electron', hostAppId: 'kod-electron', appVersion: '0.0.1' },
    })

    expect(authenticatedFetch.mock.calls[0][0]).toBe('http://localhost:8080/api/tinpay/demo-sessions')
  })

  it('uses the same selected KOD backend for authenticated status requests', async () => {
    authenticatedFetch.mockResolvedValue(
      new Response(
        JSON.stringify({
          sessionId: session.sessionId,
          expiresAt: session.expiresAt,
          demoOnly: session.demoOnly,
          status: session.status,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    )

    await getTinpaySession(sessionId)

    expect(authenticatedFetch.mock.calls[0][0]).toBe(`http://localhost:8080/api/tinpay/demo-sessions/${sessionId}`)
  })
})
