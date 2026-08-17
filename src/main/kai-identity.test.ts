import { describe, expect, it, vi } from 'vitest'
import type { KaiIdentityConfig } from '../shared/kai-identity'

vi.mock('electron', () => ({
  ipcMain: { handle: vi.fn() },
  shell: { openExternal: vi.fn() },
}))

vi.mock('electron-log/main', () => ({
  default: { error: vi.fn(), info: vi.fn() },
}))

import { buildKaiIdentityAuthorizationUrl } from './kai-identity'

describe('KAI Identity PKCE authorization URL', () => {
  it('uses the registered public client, loopback redirect, state and S256 challenge', () => {
    const config: KaiIdentityConfig = {
      enabled: true,
      clientId: 'kod-desktop',
      issuer: 'https://auth.kai.com/api/auth',
      authorizationEndpoint: 'https://auth.kai.com/api/auth/oauth2/authorize',
      tokenEndpoint: 'https://auth.kai.com/api/auth/oauth2/token',
      redirectUri: 'http://127.0.0.1:1456/auth/callback',
      scope: 'openid profile email',
    }
    const url = new URL(buildKaiIdentityAuthorizationUrl(config, 'state-1', 'challenge-1'))

    expect(url.origin + url.pathname).toBe(config.authorizationEndpoint)
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('client_id')).toBe('kod-desktop')
    expect(url.searchParams.get('redirect_uri')).toBe(config.redirectUri)
    expect(url.searchParams.get('scope')).toBe(config.scope)
    expect(url.searchParams.get('state')).toBe('state-1')
    expect(url.searchParams.get('code_challenge')).toBe('challenge-1')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
  })
})
