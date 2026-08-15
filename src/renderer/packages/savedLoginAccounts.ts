export interface SavedLoginAccount {
  email: string
  password?: string
  updatedAt: number
}

export interface SavedLoginAccountsResult {
  accounts: SavedLoginAccount[]
  passwordStorageAvailable: boolean
}

const WEB_STORAGE_KEY = 'kod-saved-login-emails-v1'
const MAX_ACCOUNTS = 10

function normalizeEmail(email: string) {
  return email.trim().toLowerCase()
}

function getWebStorage(): Storage | undefined {
  try {
    return typeof window !== 'undefined' ? window.localStorage : undefined
  } catch {
    return undefined
  }
}

function readWebAccounts(): SavedLoginAccount[] {
  const storage = getWebStorage()
  if (!storage) return []
  try {
    const parsed: unknown = JSON.parse(storage.getItem(WEB_STORAGE_KEY) || '[]')
    if (!Array.isArray(parsed)) return []
    return parsed
      .filter((item): item is { email: string; updatedAt?: number } => Boolean(item && typeof item.email === 'string'))
      .map((item) => ({ email: normalizeEmail(item.email), updatedAt: Number(item.updatedAt) || 0 }))
      .filter((item) => item.email)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, MAX_ACCOUNTS)
  } catch {
    return []
  }
}

function writeWebAccounts(accounts: SavedLoginAccount[]) {
  const storage = getWebStorage()
  if (!storage) return
  try {
    storage.setItem(
      WEB_STORAGE_KEY,
      JSON.stringify(accounts.map(({ email, updatedAt }) => ({ email, updatedAt })).slice(0, MAX_ACCOUNTS))
    )
  } catch {
    // 浏览器禁止持久化时不阻断登录。
  }
}

function isDesktop() {
  return typeof window !== 'undefined' && Boolean(window.electronAPI)
}

export function listSavedLoginAccounts(): Promise<SavedLoginAccountsResult> {
  if (isDesktop()) {
    return window.electronAPI.invoke('kod-login:list-saved-accounts')
  }
  return Promise.resolve({ accounts: readWebAccounts(), passwordStorageAvailable: false })
}

export function saveLoginAccount(email: string, password: string): Promise<SavedLoginAccountsResult> {
  const normalized = normalizeEmail(email)
  if (!normalized) return listSavedLoginAccounts()
  if (isDesktop()) {
    return window.electronAPI.invoke('kod-login:save-account', normalized, password)
  }
  const next = [
    { email: normalized, updatedAt: Date.now() },
    ...readWebAccounts().filter((item) => item.email !== normalized),
  ].slice(0, MAX_ACCOUNTS)
  writeWebAccounts(next)
  return Promise.resolve({ accounts: next, passwordStorageAvailable: false })
}

export function deleteSavedLoginAccount(email: string): Promise<SavedLoginAccountsResult> {
  const normalized = normalizeEmail(email)
  if (isDesktop()) {
    return window.electronAPI.invoke('kod-login:delete-account', normalized)
  }
  const next = readWebAccounts().filter((item) => item.email !== normalized)
  writeWebAccounts(next)
  return Promise.resolve({ accounts: next, passwordStorageAvailable: false })
}
