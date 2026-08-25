import { createStore, useStore } from 'zustand'
import { persist, subscribeWithSelector } from 'zustand/middleware'
import { immer } from 'zustand/middleware/immer'
import type { AuthTokens } from '../routes/settings/provider/chatbox-ai/-components/types'

interface AuthTokensState {
  accessToken: string | null
  refreshToken: string | null
  accountId: string | null
  loginEmail: string | null
}

interface AuthTokensActions {
  setTokens: (tokens: AuthTokens, options?: { preserveEmail?: boolean; preserveAccountId?: boolean }) => void
  setAccessOnlySession: (session: { accessToken: string; accountId: string }) => void
  clearTokens: () => void
  getTokens: () => AuthTokens | null
}

const initialState: AuthTokensState = {
  accessToken: null,
  refreshToken: null,
  accountId: null,
  loginEmail: null,
}

export const authInfoStore = createStore<AuthTokensState & AuthTokensActions>()(
  subscribeWithSelector(
    persist(
      immer((set, get) => ({
        ...initialState,

        setTokens: (tokens: AuthTokens & { email?: string }, options) => {
          set((state) => {
            state.accessToken = tokens.accessToken
            state.refreshToken = tokens.refreshToken
            if (!options?.preserveAccountId || tokens.accountId) {
              state.accountId = tokens.accountId ?? null
            }
            if (!options?.preserveEmail || tokens.email) {
              state.loginEmail = tokens.email ? tokens.email.trim().toLowerCase() : null
            }
          })
        },

        setAccessOnlySession: (session) => {
          set((state) => {
            state.accessToken = session.accessToken
            state.refreshToken = null
            state.accountId = session.accountId
            state.loginEmail = null
          })
        },

        clearTokens: () => {
          set((state) => {
            state.accessToken = null
            state.refreshToken = null
            state.accountId = null
            state.loginEmail = null
          })
        },

        getTokens: () => {
          const state = get()
          if (state.accessToken && state.refreshToken) {
            return {
              accessToken: state.accessToken,
              refreshToken: state.refreshToken,
              accountId: state.accountId ?? undefined,
            }
          }
          return null
        },
      })),
      {
        name: 'chatbox-ai-auth-info',
        version: 0,
        partialize: (state) => ({
          accessToken: state.accessToken,
          refreshToken: state.refreshToken,
          accountId: state.accountId,
          loginEmail: state.loginEmail,
        }),
      }
    )
  )
)

export function useAuthInfoStore<U>(selector: Parameters<typeof useStore<typeof authInfoStore, U>>[1]) {
  return useStore<typeof authInfoStore, U>(authInfoStore, selector)
}

export const useAuthTokens = () => {
  return useAuthInfoStore((state) => ({
    accessToken: state.accessToken,
    refreshToken: state.refreshToken,
    accountId: state.accountId,
    setTokens: state.setTokens,
    setAccessOnlySession: state.setAccessOnlySession,
    clearTokens: state.clearTokens,
    getTokens: state.getTokens,
  }))
}
