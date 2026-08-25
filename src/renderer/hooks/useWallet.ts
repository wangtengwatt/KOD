import type { QueryClient } from '@tanstack/react-query'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useCallback, useEffect } from 'react'
import { walletApi } from '@/api/wallet'
import { getKodApiOrigin } from '@/packages/kodApiOrigin'
import { getWalletIdentity, type WalletIdentity } from '@/packages/walletIdentity'
import platform from '@/platform'
import { authInfoStore, useAuthInfoStore } from '@/stores/authInfoStore'
import { queryClient as accountQueryClient } from '@/stores/queryClient'

export { getWalletIdentity }
export type { WalletIdentity }

export function useWalletIdentity() {
  const accessToken = useAuthInfoStore((state) => state.accessToken)
  const refreshToken = useAuthInfoStore((state) => state.refreshToken)
  const accountId = useAuthInfoStore((state) => state.accountId)
  const loginEmail = useAuthInfoStore((state) => state.loginEmail)
  return getWalletIdentity(accountId, loginEmail, accessToken, refreshToken)
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

export const computeKeys = {
  all: ['compute'] as const,
  legacyAccount: ['compute', 'account'] as const,
  legacyAssetHistory: ['compute', 'ledger'] as const,
  account: (identity: WalletIdentity) => ['compute', identity, 'account'] as const,
  assetHistory: (identity: WalletIdentity) => ['compute', identity, 'ledger'] as const,
  notifications: (identity: WalletIdentity) => ['compute', identity, 'notifications'] as const,
  referralProfile: (identity: WalletIdentity) => ['compute', identity, 'referrals', 'me'] as const,
  emailInvites: (identity: WalletIdentity, days: number) =>
    ['compute', identity, 'referrals', 'email-invites', days] as const,
  platformLeases: (identity: WalletIdentity) => ['compute', identity, 'platform-hosting', 'leases'] as const,
}

export function useComputeQueryKey() {
  const identity = useWalletIdentity()
  return useCallback((...parts: unknown[]) => ['compute', identity ?? 'signed-out', ...parts] as const, [identity])
}

export function invalidateRewardReceipt(queryClient: QueryClient, identity: WalletIdentity) {
  return Promise.all([
    queryClient.invalidateQueries({ queryKey: walletKeys.cardTimeAccount(identity) }),
    queryClient.invalidateQueries({ queryKey: walletKeys.rewardedAdStatus(identity) }),
    queryClient.invalidateQueries({ queryKey: computeKeys.account(identity) }),
    queryClient.invalidateQueries({ queryKey: computeKeys.assetHistory(identity) }),
    queryClient.invalidateQueries({ queryKey: computeKeys.legacyAccount }),
    queryClient.invalidateQueries({ queryKey: computeKeys.legacyAssetHistory }),
  ])
}

export async function clearWalletCache() {
  const cancellations = Promise.all([
    accountQueryClient.cancelQueries({ queryKey: walletKeys.all }),
    accountQueryClient.cancelQueries({ queryKey: computeKeys.all }),
  ])
  accountQueryClient.removeQueries({ queryKey: walletKeys.all })
  accountQueryClient.removeQueries({ queryKey: computeKeys.all })
  await cancellations
}

authInfoStore.subscribe(
  (state) => [state.accountId, state.loginEmail, state.accessToken, state.refreshToken] as const,
  (identity, previous) => {
    if (identity.some((value, index) => value !== previous[index])) void clearWalletCache()
  }
)

export function useWallet(page: number, pageSize: number) {
  const identity = useWalletIdentity()
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
            queryClient.invalidateQueries({ queryKey: computeKeys.account(identity) }),
            queryClient.invalidateQueries({ queryKey: computeKeys.assetHistory(identity) }),
            queryClient.invalidateQueries({ queryKey: computeKeys.legacyAccount }),
            queryClient.invalidateQueries({ queryKey: computeKeys.legacyAssetHistory }),
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
