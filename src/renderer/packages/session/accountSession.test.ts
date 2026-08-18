import { describe, expect, it, vi } from 'vitest'

const { authHarness, cleanupMocks, queryClientMocks } = vi.hoisted(() => {
  type Tokens = { accessToken: string; refreshToken: string; email?: string }
  let finishHydration: (() => void) | null = null
  const state = {
    current: {
      accessToken: null as string | null,
      refreshToken: null as string | null,
      loginEmail: null as string | null,
      getTokens() {
        if (!state.current.accessToken || !state.current.refreshToken) return null
        return { accessToken: state.current.accessToken, refreshToken: state.current.refreshToken }
      },
      setTokens(tokens: Tokens) {
        state.current.accessToken = tokens.accessToken
        state.current.refreshToken = tokens.refreshToken
        state.current.loginEmail = tokens.email ?? null
      },
      clearTokens() {
        state.current.accessToken = null
        state.current.refreshToken = null
        state.current.loginEmail = null
      },
    },
  }
  return {
    authHarness: {
      state,
      hasHydrated: vi.fn(() => false),
      rehydrate: vi.fn(() => Promise.resolve()),
      onFinishHydration: vi.fn((listener: () => void) => {
        finishHydration = listener
        return vi.fn()
      }),
      restore(tokens: Tokens) {
        state.current.setTokens(tokens)
        finishHydration?.()
      },
    },
    cleanupMocks: {
      clearRelay: vi.fn(),
      releaseRelay: vi.fn(() => Promise.resolve()),
      purgeAccountData: vi.fn(() => Promise.resolve({ sessionCount: 0 })),
      resetMetaStorage: vi.fn(),
      resetImages: vi.fn(),
      deactivate: vi.fn(() => Promise.resolve()),
      resetTasks: vi.fn(),
    },
    queryClientMocks: { clear: vi.fn() },
  }
})

vi.mock('@/stores/authInfoStore', () => ({
  authInfoStore: {
    getState: () => authHarness.state.current,
    persist: {
      hasHydrated: authHarness.hasHydrated,
      rehydrate: authHarness.rehydrate,
      onFinishHydration: authHarness.onFinishHydration,
    },
  },
}))
vi.mock('@/stores/queryClient', () => ({ default: queryClientMocks }))
vi.mock('@/variables', () => ({ KOD_API_ORIGIN: 'https://kod.kai.com' }))
vi.mock('@shared/types', () => ({ ModelProviderEnum: { ChatboxAI: 'chatbox-ai' } }))
vi.mock('@/hooks/useKodRelay', () => ({ clearKodRelayLocalState: cleanupMocks.clearRelay }))
vi.mock('@/packages/kodRelay', () => ({ releaseKodRelayKey: cleanupMocks.releaseRelay }))
vi.mock('@/stores/chatStore', () => ({
  purgeCurrentAccountData: cleanupMocks.purgeAccountData,
  resetMetaStorage: cleanupMocks.resetMetaStorage,
}))
vi.mock('@/stores/imageGenerationStore', () => ({ resetImageGenerationStorage: cleanupMocks.resetImages }))
vi.mock('@/stores/premiumActions', () => ({ deactivate: cleanupMocks.deactivate }))
vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({ licenseActivationMethod: undefined, providers: {} }),
    setState: vi.fn(),
  },
}))
vi.mock('@/stores/taskSessionStore', () => ({ resetTaskSessionStorage: cleanupMocks.resetTasks }))

describe('canonical account session persistence adapter', () => {
  it('updates the shared snapshot when delayed auth-store hydration completes', async () => {
    const { accountSessionService } = await import('./accountSession')
    expect(accountSessionService.getSnapshot().authenticated).toBe(false)
    expect(authHarness.onFinishHydration).toHaveBeenCalledOnce()
    expect(authHarness.rehydrate).toHaveBeenCalledOnce()

    authHarness.restore({
      accessToken: 'persisted-access',
      refreshToken: 'persisted-refresh',
      email: 'Persisted@Kod.Test ',
    })

    expect(accountSessionService.getSnapshot()).toMatchObject({
      authenticated: true,
      account: { email: 'persisted@kod.test', roles: [] },
    })

    accountSessionService.logout()
    await vi.waitFor(() => expect(cleanupMocks.purgeAccountData).toHaveBeenCalledWith('persisted@kod.test'))
  })
})
