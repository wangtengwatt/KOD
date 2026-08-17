import { ModelProviderEnum } from '@shared/types'
import { useCallback, useMemo } from 'react'
import { clearKodRelayLocalState } from '@/hooks/useKodRelay'
import { releaseKodRelayKey } from '@/packages/kodRelay'
import { getKodApiOrigin } from '@/packages/remote'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import * as premiumActions from '@/stores/premiumActions'
import queryClient from '@/stores/queryClient'
import { settingsStore } from '@/stores/settingsStore'
import type { AuthTokens } from './types'

interface ClearAuthTokensOptions {
  preserveAccountData?: boolean
}

export function useAuthTokens() {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)

  const isLoggedIn = useMemo(() => {
    return !!accessToken && !!refreshToken
  }, [accessToken, refreshToken])

  const saveAuthTokens = useCallback(async (tokens: AuthTokens) => {
    try {
      await authInfoStore.getState().setTokens({
        ...tokens,
        email: tokens.email,
      })
    } catch (error) {
      console.error('❌ Failed to save tokens:', error)
      throw error
    }
  }, [])

  const clearAuthTokens = useCallback(async (options?: ClearAuthTokensOptions) => {
    try {
      const relayToken = authInfoStore.getState().accessToken
      if (relayToken) {
        try {
          await releaseKodRelayKey(getKodApiOrigin(), relayToken)
        } catch (error) {
          console.warn('[Kod relay] failed to release key during logout', error)
        }
      }
      clearKodRelayLocalState()

      if (!options?.preserveAccountData) {
        // Purge local data for the current account BEFORE clearing tokens
        // (needs loginEmail to identify the correct account database)
        try {
          const { purgeCurrentAccountData } = await import('@/stores/chatStore')
          await purgeCurrentAccountData()
        } catch (e) {
          console.error('Failed to purge account data on logout:', e)
          // Continue with logout even if purge fails
        }
      }

      const settings = settingsStore.getState()
      if (settings.licenseActivationMethod === 'login') {
        await premiumActions.deactivate()
      }

      settingsStore.setState((state) => ({
        hasExpiredLicense: false,
        providers: {
          ...(state.providers || {}),
          [ModelProviderEnum.ChatboxAI]: {
            ...(state.providers?.[ModelProviderEnum.ChatboxAI] || {}),
            apiHost: undefined,
            apiKey: undefined,
            models: [],
            excludedModels: [],
          },
        },
      }))

      authInfoStore.getState().clearTokens()

      // Reset all account-isolated storage singletons so next login uses fresh DB instances
      const { resetMetaStorage } = await import('@/stores/chatStore')
      resetMetaStorage()

      const { resetTaskSessionStorage } = await import('@/stores/taskSessionStore')
      resetTaskSessionStorage()

      const { resetImageGenerationStorage } = await import('@/stores/imageGenerationStore')
      resetImageGenerationStorage()

      queryClient.clear()

      queryClient.removeQueries({ queryKey: ['userProfile'] })
      queryClient.removeQueries({ queryKey: ['userLicenses'] })
      queryClient.removeQueries({ queryKey: ['licenseDetail'] })
      queryClient.removeQueries({ queryKey: ['license-detail'] })
    } catch (error) {
      console.error('Failed to clear auth tokens:', error)
    }
  }, [])

  return {
    isLoggedIn,
    clearAuthTokens,
    saveAuthTokens,
  }
}
