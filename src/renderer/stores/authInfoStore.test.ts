import { afterEach, describe, expect, it } from 'vitest'
import { authInfoStore } from './authInfoStore'

afterEach(() => authInfoStore.getState().clearTokens())

describe('authInfoStore', () => {
  it('normalizes and stores the login email', () => {
    authInfoStore.getState().setTokens({ accessToken: 'a', refreshToken: 'r', email: ' User@Example.COM ' })
    expect(authInfoStore.getState().loginEmail).toBe('user@example.com')
  })
  it('does not retain an old email when a new token set omits it', () => {
    authInfoStore.getState().setTokens({ accessToken: 'old', refreshToken: 'old', email: 'old@example.com' })
    authInfoStore.getState().setTokens({ accessToken: 'new', refreshToken: 'new' })
    expect(authInfoStore.getState()).toMatchObject({ accessToken: 'new', refreshToken: 'new', loginEmail: null })
  })
  it('preserves the login email during token refresh', () => {
    authInfoStore.getState().setTokens({ accessToken: 'old', refreshToken: 'old', email: 'user@example.com' })
    authInfoStore.getState().setTokens({ accessToken: 'new', refreshToken: 'new' }, { preserveEmail: true })
    expect(authInfoStore.getState()).toMatchObject({
      accessToken: 'new',
      refreshToken: 'new',
      loginEmail: 'user@example.com',
    })
  })
})
