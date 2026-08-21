import { QueryClient } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { authInfoStore } from '@/stores/authInfoStore'
import { clearWalletCache, getWalletIdentity, walletKeys } from './useWallet'

vi.mock('@/stores/queryClient', () => ({ queryClient: new QueryClient() }))

afterEach(() => {
  authInfoStore.getState().clearTokens()
})

describe('wallet cache identity', () => {
  it('normalizes login email without exposing tokens in query keys', () => {
    const identity = getWalletIdentity('  User@Example.COM ', 'access-secret', 'refresh-secret')
    expect(identity).toBe('user@example.com')
    expect(JSON.stringify(walletKeys.history(identity ?? '', 1, 10))).not.toContain('secret')
  })

  it('requires the complete Portal login state', () => {
    expect(getWalletIdentity('user@example.com', 'access', null)).toBeNull()
    expect(getWalletIdentity(null, 'access', 'refresh')).toBeNull()
  })

  it('cancels and removes all account-scoped wallet and compute caches', async () => {
    const { queryClient } = await import('@/stores/queryClient')
    queryClient.setQueryData(walletKeys.balance('old@example.com'), { balance: 1 })
    queryClient.setQueryData(['compute', 'old@example.com', 'account'], { userId: 1 })
    queryClient.setQueryData(['compute', 'account'], { userId: 1 })
    queryClient.setQueryData(['other'], 'kept')
    await clearWalletCache()
    expect(queryClient.getQueryData(walletKeys.balance('old@example.com'))).toBeUndefined()
    expect(queryClient.getQueryData(['compute', 'old@example.com', 'account'])).toBeUndefined()
    expect(queryClient.getQueryData(['compute', 'account'])).toBeUndefined()
    expect(queryClient.getQueryData(['other'])).toBe('kept')
  })

  it('evicts the previous account before a direct account switch can reuse it', async () => {
    const { queryClient } = await import('@/stores/queryClient')
    authInfoStore.setState({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      loginEmail: 'old@example.com',
    })
    queryClient.setQueryData(['compute', 'old@example.com', 'account'], { userId: 1 })

    authInfoStore.setState({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      loginEmail: 'new@example.com',
    })

    expect(queryClient.getQueryData(['compute', 'old@example.com', 'account'])).toBeUndefined()
  })
})
