import { useSyncExternalStore } from 'react'
import { authInfoStore } from '@/stores/authInfoStore'
import queryClient from '@/stores/queryClient'
import { KOD_API_ORIGIN } from '@/variables'
import { AccountSessionService } from './AccountSessionService'

function reportCleanupFailure(task: string, error: unknown) {
  console.warn(`[KOD logout] ${task} failed`, error)
}

function clearAccountCaches(accessToken: string | null, account: { email: string } | null) {
  // Account, role, wallet and compute queries must disappear before a switched
  // account is persisted. Slower per-account databases are cleaned in the
  // background so a blocked IndexedDB close cannot keep the old user signed in.
  queryClient.clear()
  void clearSecondaryAccountData(accessToken, account?.email).catch((error) =>
    reportCleanupFailure('secondary cleanup', error)
  )
}

async function clearSecondaryAccountData(accessToken: string | null, accountEmail?: string) {
  const [types, relayState, relay, chat, images, premium, settingsModule, tasks] = await Promise.all([
    import('@shared/types'),
    import('@/hooks/useKodRelay'),
    import('@/packages/kodRelay'),
    import('@/stores/chatStore'),
    import('@/stores/imageGenerationStore'),
    import('@/stores/premiumActions'),
    import('@/stores/settingsStore'),
    import('@/stores/taskSessionStore'),
  ])
  const settings = settingsModule.settingsStore.getState()
  const accountCleanup = chat.purgeCurrentAccountData(accountEmail)
  const licenseCleanup = settings.licenseActivationMethod === 'login' ? premium.deactivate(false) : Promise.resolve()

  try {
    relayState.clearKodRelayLocalState()
  } catch (error) {
    reportCleanupFailure('clear relay state', error)
  }

  try {
    settingsModule.settingsStore.setState((state) => ({
      hasExpiredLicense: false,
      providers: {
        ...(state.providers || {}),
        [types.ModelProviderEnum.ChatboxAI]: {
          ...(state.providers?.[types.ModelProviderEnum.ChatboxAI] || {}),
          apiHost: undefined,
          apiKey: undefined,
          models: [],
          excludedModels: [],
        },
      },
    }))
  } catch (error) {
    reportCleanupFailure('clear provider state', error)
  }

  chat.resetMetaStorage()
  tasks.resetTaskSessionStorage()
  images.resetImageGenerationStorage()

  if (accessToken) {
    void relay
      .releaseKodRelayKey(KOD_API_ORIGIN, accessToken)
      .catch((error) => reportCleanupFailure('release relay key', error))
  }
  void accountCleanup.catch((error) => reportCleanupFailure('purge local account data', error))
  void licenseCleanup.catch((error) => reportCleanupFailure('deactivate login license', error))
}

export const accountSessionService = new AccountSessionService({
  readTokens: () => {
    const state = authInfoStore.getState()
    const tokens = state.getTokens()
    return tokens ? { ...tokens, email: state.loginEmail ?? undefined } : null
  },
  persistTokens: (tokens) => {
    authInfoStore.getState().setTokens(tokens, { preserveEmail: !tokens.email })
  },
  clearTokens: () => authInfoStore.getState().clearTokens(),
  refreshTokens: async (refreshToken) => {
    const { refreshAccessToken } = await import('@/packages/remote')
    return refreshAccessToken({ refreshToken })
  },
  clearAccountCaches,
})

const authPersistence = authInfoStore.persist as typeof authInfoStore.persist | undefined
if (authPersistence) {
  authPersistence.onFinishHydration(() => {
    accountSessionService.synchronizeFromPersistence()
  })
  if (!authPersistence.hasHydrated()) {
    void authPersistence.rehydrate()
  }
}

export function useAccountSessionSnapshot() {
  return useSyncExternalStore(
    accountSessionService.subscribe,
    accountSessionService.getSnapshot,
    accountSessionService.getSnapshot
  )
}
