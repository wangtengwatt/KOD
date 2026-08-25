export type WalletIdentity = string

export function getWalletIdentity(
  accountId: string | null,
  loginEmail: string | null,
  accessToken: string | null,
  refreshToken: string | null
) {
  if (!accessToken || !refreshToken) return null
  const normalizedAccountId = accountId?.trim()
  if (normalizedAccountId) return `account:${normalizedAccountId}`
  const normalizedEmail = loginEmail?.trim().toLowerCase()
  return normalizedEmail ? `email:${normalizedEmail}` : null
}
