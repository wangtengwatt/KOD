import { afterEach, describe, expect, it } from 'vitest'
import { authInfoStore } from './authInfoStore'

afterEach(() => authInfoStore.getState().clearTokens())

describe('authInfoStore', () => {
  it('normalizes and stores the login email', () => {
    authInfoStore.getState().setTokens({
      accessToken: 'a',
      refreshToken: 'r',
      accountId: '2084099947250954241',
      email: ' User@Example.COM ',
    })
    expect(authInfoStore.getState()).toMatchObject({
      accountId: '2084099947250954241',
      loginEmail: 'user@example.com',
    })
  })
  it('does not retain an old email when a new token set omits it', () => {
    authInfoStore.getState().setTokens({ accessToken: 'old', refreshToken: 'old', email: 'old@example.com' })
    authInfoStore.getState().setTokens({ accessToken: 'new', refreshToken: 'new' })
    expect(authInfoStore.getState()).toMatchObject({ accessToken: 'new', refreshToken: 'new', loginEmail: null })
  })
  it('preserves the login email during token refresh', () => {
    authInfoStore.getState().setTokens({
      accessToken: 'old',
      refreshToken: 'old',
      accountId: '2084099947250954241',
      email: 'user@example.com',
    })
    authInfoStore
      .getState()
      .setTokens({ accessToken: 'new', refreshToken: 'new', accountId: '2084099947250954241' }, { preserveEmail: true })
    expect(authInfoStore.getState()).toMatchObject({
      accessToken: 'new',
      refreshToken: 'new',
      accountId: '2084099947250954241',
      loginEmail: 'user@example.com',
    })
  })

  it('preserves the account identity when a generic refresh omits it', () => {
    authInfoStore.getState().setTokens({
      accessToken: 'old',
      refreshToken: 'old-refresh',
      accountId: '2084099947250954241',
      email: 'user@example.com',
    })

    authInfoStore
      .getState()
      .setTokens({ accessToken: 'new', refreshToken: 'new-refresh' }, { preserveEmail: true, preserveAccountId: true })

    expect(authInfoStore.getState()).toMatchObject({
      accessToken: 'new',
      refreshToken: 'new-refresh',
      accountId: '2084099947250954241',
      loginEmail: 'user@example.com',
    })
  })
})
