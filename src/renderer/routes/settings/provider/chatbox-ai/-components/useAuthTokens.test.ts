import { readFileSync } from 'node:fs'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  logout: vi.fn(),
  login: vi.fn(),
  switchAccount: vi.fn(),
}))

vi.mock('@/packages/session/accountSession', () => ({
  accountSessionService: {
    logout: mocks.logout,
    login: mocks.login,
    switchAccount: mocks.switchAccount,
  },
  useAccountSessionSnapshot: () => ({ authenticated: true, account: null }),
}))

import { clearKodAuthSession } from './useAuthTokens'

describe('KOD logout', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('delegates session termination to the canonical account service immediately', () => {
    clearKodAuthSession()

    expect(mocks.logout).toHaveBeenCalledOnce()
  })

  it('does not maintain a page-local authenticated flag or token cleanup path', () => {
    const source = readFileSync(new URL('./useAuthTokens.ts', import.meta.url), 'utf8')

    expect(source).toContain('useAccountSessionSnapshot')
    expect(source).not.toContain('useAuthInfoStore')
    expect(source).not.toContain('clearTokens()')
  })
})
