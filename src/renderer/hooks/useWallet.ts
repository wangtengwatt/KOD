import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { walletApi } from '@/api/wallet'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import platform from '@/platform'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'

export type WalletIdentity = string

export function getWalletIdentity(loginEmail: string | null, accessToken: string | null, refreshToken: string | null) {
  if (!loginEmail || !accessToken || !refreshToken) return null
  return loginEmail.trim().toLowerCase()
}

export const walletKeys = {
  all: ['wallet'] as const,
  account: (identity: WalletIdentity) => ['wallet', identity] as const,
  info: (identity: WalletIdentity) => ['wallet', identity, 'topup-info'] as const,
  balance: (identity: WalletIdentity) => ['wallet', identity, 'balance'] as const,
  cardTimeAccount: (identity: WalletIdentity) => ['wallet', identity, 'card-time-account'] as const,
  rewardedAdStatus: (identity: WalletIdentity) => ['wallet', identity, 'rewarded-ad-status'] as const,
  historyRoot: (identity: WalletIdentity) => ['wallet', identity, 'history'] as const,
  history: (identity: WalletIdentity, page: number, pageSize: number) =>
    ['wallet', identity, 'history', page, pageSize] as const,
}

export async function clearWalletCache() {
  const { queryClient } = await import('@/stores/queryClient')
  await queryClient.cancelQueries({ queryKey: walletKeys.all })
  queryClient.removeQueries({ queryKey: walletKeys.all })
}

authInfoStore.subscribe(
  (state) => [state.loginEmail, state.accessToken, state.refreshToken] as const,
  (identity, previous) => {
    if (identity.some((value, index) => value !== previous[index])) void clearWalletCache()
  }
)

export function useWallet(page: number, pageSize: number) {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)
  const loginEmail = useAuthInfoStore((state) => state.loginEmail)
  const identity = getWalletIdentity(loginEmail, accessToken, refreshToken)
  const enabled = identity !== null
  const queryClient = useQueryClient()
  const info = useQuery({
    queryKey: walletKeys.info(identity ?? 'signed-out'),
    queryFn: walletApi.getTopupInfo,
    enabled,
    retry: 1,
  })
  const balance = useQuery({
    queryKey: walletKeys.balance(identity ?? 'signed-out'),
    queryFn: walletApi.getWallet,
    enabled,
    retry: 1,
  })
  const cardTimeAccount = useQuery({
    queryKey: walletKeys.cardTimeAccount(identity ?? 'signed-out'),
    queryFn: walletApi.getCardTimeAccount,
    enabled,
    retry: false,
    refetchOnWindowFocus: false,
  })
  const history = useQuery({
    queryKey: walletKeys.history(identity ?? 'signed-out', page, pageSize),
    queryFn: () => walletApi.getTopupHistory(page, pageSize),
    enabled,
    retry: 1,
  })
  const refresh = useCallback(
    () =>
      identity
        ? Promise.all([
            queryClient.invalidateQueries({ queryKey: walletKeys.balance(identity) }),
            queryClient.invalidateQueries({ queryKey: walletKeys.cardTimeAccount(identity) }),
            queryClient.invalidateQueries({ queryKey: walletKeys.rewardedAdStatus(identity) }),
            queryClient.invalidateQueries({ queryKey: walletKeys.historyRoot(identity) }),
          ])
        : Promise.resolve([]),
    [identity, queryClient]
  )
  useEffect(() => {
    if (!enabled) return
    let last = 0
    return platform.onWindowFocused(() => {
      const now = Date.now()
      if (now - last >= 5000) {
        last = now
        void refresh()
      }
    })
  }, [enabled, refresh])
  const amount = useMutation({ mutationFn: walletApi.calculateAmount })
  const pay = useMutation({
    mutationFn: ({ amount, paymentMethod }: { amount: number; paymentMethod: string }) =>
      walletApi.pay(amount, paymentMethod),
  })
  return {
    identity,
    apiHost: new URL(getKodApiOrigin()).host,
    info,
    balance,
    cardTimeAccount,
    history,
    amount,
    pay,
    refresh,
  }
}
