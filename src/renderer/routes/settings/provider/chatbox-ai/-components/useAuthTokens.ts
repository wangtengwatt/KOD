import { useCallback } from 'react'
import { accountSessionService, useAccountSessionSnapshot } from '@/packages/session/accountSession'
import type { AuthTokens } from './types'

/**
 * End the local authenticated session immediately. Remote release and local
 * account-data cleanup are best-effort follow-up work and must never keep the
 * user signed in.
 */
export function clearKodAuthSession() {
  void accountSessionService.logout()
}

export function useAuthTokens() {
  const session = useAccountSessionSnapshot()

  const saveAuthTokens = useCallback(async (tokens: AuthTokens) => {
    await accountSessionService.login(tokens)
  }, [])

  const clearAuthTokens = useCallback(() => {
    clearKodAuthSession()
  }, [])

  const switchAccount = useCallback(async (tokens: AuthTokens) => {
    await accountSessionService.switchAccount(tokens)
  }, [])

  return {
    isLoggedIn: session.authenticated,
    clearAuthTokens,
    saveAuthTokens,
    switchAccount,
  }
}
