export interface AccountSnapshot {
  userId: number
  email: string
  roles: string[]
  accessTokenExpiresAt: number
}

export interface SessionTokens {
  accessToken: string
  refreshToken: string
  email?: string
}

export interface AccountSessionSnapshot {
  authenticated: boolean
  account: AccountSnapshot | null
}

export interface AccountSessionServiceDependencies {
  readTokens: () => SessionTokens | null
  persistTokens: (tokens: SessionTokens) => void | Promise<void>
  clearTokens: () => void
  refreshTokens: (refreshToken: string) => Promise<SessionTokens>
  clearAccountCaches: (accessToken: string | null, account: AccountSnapshot | null) => void
  now?: () => number
}

type AccountIdentity = Omit<AccountSnapshot, 'accessTokenExpiresAt'> &
  Partial<Pick<AccountSnapshot, 'accessTokenExpiresAt'>>

function normalizeEmail(email?: string | null) {
  return email?.trim().toLowerCase() ?? ''
}

function decodeAccessTokenExpiry(accessToken: string, fallback: number) {
  try {
    const encoded = accessToken.split('.')[1]
    if (!encoded) return fallback
    const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/')
    const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '=')
    const payload = JSON.parse(atob(padded)) as { exp?: unknown }
    return typeof payload.exp === 'number' && Number.isFinite(payload.exp) ? payload.exp * 1000 : fallback
  } catch {
    return fallback
  }
}

export class AccountSessionChangedError extends Error {
  constructor() {
    super('Account session changed while an authenticated request was in flight')
    this.name = 'AccountSessionChangedError'
  }
}

export class AccountSessionService {
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number
  private state: AccountSessionSnapshot
  private refreshPromise: Promise<SessionTokens> | null = null
  private lastRefresh: { revision: number; replacedRefreshToken: string; currentRefreshToken: string } | null = null
  private accountRevision = 0

  constructor(private readonly dependencies: AccountSessionServiceDependencies) {
    this.now = dependencies.now ?? Date.now
    const tokens = dependencies.readTokens()
    this.state = {
      authenticated: tokens !== null,
      account: tokens?.email ? this.provisionalAccount(tokens) : null,
    }
  }

  getSnapshot = (): AccountSessionSnapshot => this.state

  getTokens = () => this.dependencies.readTokens()

  getSessionVersion = () => this.accountRevision

  synchronizeFromPersistence() {
    const tokens = this.dependencies.readTokens()
    if (!tokens) {
      if (this.state.authenticated) this.logout()
      return this.state
    }

    const email = normalizeEmail(tokens.email)
    const previousAccount = this.state.account
    const account =
      previousAccount && previousAccount.email === email
        ? Object.freeze({
            ...previousAccount,
            accessTokenExpiresAt: decodeAccessTokenExpiry(tokens.accessToken, this.now() + 60 * 60 * 1000),
          })
        : email
          ? this.provisionalAccount({ ...tokens, email })
          : null
    this.accountRevision += 1
    this.publish({ authenticated: true, account })
    return this.state
  }

  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  async login(tokens: SessionTokens) {
    const normalized = { ...tokens, email: normalizeEmail(tokens.email) || undefined }
    await this.dependencies.persistTokens(normalized)
    this.accountRevision += 1
    this.publish({ authenticated: true, account: normalized.email ? this.provisionalAccount(normalized) : null })
    return this.state
  }

  async switchAccount(tokens: SessionTokens) {
    await this.logout()
    return this.login(tokens)
  }

  logout() {
    const tokens = this.dependencies.readTokens()
    if (!tokens && !this.state.authenticated && !this.state.account) return
    const accessToken = tokens?.accessToken ?? null
    const account = this.state.account
    this.accountRevision += 1
    this.dependencies.clearTokens()
    this.publish({ authenticated: false, account: null })
    this.dependencies.clearAccountCaches(accessToken, account)
  }

  updateIdentity(identity: AccountIdentity) {
    const tokens = this.dependencies.readTokens()
    if (!tokens) return null
    const account: AccountSnapshot = Object.freeze({
      userId: identity.userId,
      email: normalizeEmail(identity.email),
      roles: Object.freeze([...new Set(identity.roles)]) as unknown as string[],
      accessTokenExpiresAt:
        identity.accessTokenExpiresAt ?? decodeAccessTokenExpiry(tokens.accessToken, this.now() + 60 * 60 * 1000),
    })
    this.publish({ authenticated: true, account })
    return account
  }

  async refreshIdentity<T extends AccountIdentity>(loader: () => Promise<T>) {
    const revision = this.accountRevision
    const identity = await loader()
    if (revision === this.accountRevision) {
      this.updateIdentity(identity)
    }
    return identity
  }

  refreshAccessToken(expectedRefreshToken?: string) {
    if (this.refreshPromise) return this.refreshPromise

    const currentTokens = this.dependencies.readTokens()
    if (!currentTokens) throw new Error('No refresh token available')
    if (expectedRefreshToken && expectedRefreshToken !== currentTokens.refreshToken) {
      const completed = this.lastRefresh
      if (
        completed?.revision === this.accountRevision &&
        completed.replacedRefreshToken === expectedRefreshToken &&
        completed.currentRefreshToken === currentTokens.refreshToken
      ) {
        return Promise.resolve(currentTokens)
      }
      return Promise.reject(new AccountSessionChangedError())
    }
    const revision = this.accountRevision
    const refreshToken = currentTokens.refreshToken
    const isCurrentAccount = () =>
      revision === this.accountRevision && this.dependencies.readTokens()?.refreshToken === refreshToken

    this.refreshPromise = this.dependencies
      .refreshTokens(refreshToken)
      .then(async (refreshed) => {
        if (!isCurrentAccount()) throw new AccountSessionChangedError()
        const next = {
          ...refreshed,
          email: normalizeEmail(refreshed.email ?? currentTokens.email) || undefined,
        }
        await this.dependencies.persistTokens(next)
        this.lastRefresh = {
          revision,
          replacedRefreshToken: refreshToken,
          currentRefreshToken: next.refreshToken,
        }
        const previousAccount = this.state.account
        this.publish({
          authenticated: true,
          account: previousAccount
            ? Object.freeze({
                ...previousAccount,
                accessTokenExpiresAt: decodeAccessTokenExpiry(next.accessToken, this.now() + 60 * 60 * 1000),
              })
            : next.email
              ? this.provisionalAccount(next)
              : null,
        })
        return next
      })
      .catch((error: unknown) => {
        if (!(error instanceof AccountSessionChangedError) && isCurrentAccount()) {
          this.logout()
        }
        throw error
      })
      .finally(() => {
        this.refreshPromise = null
      })

    return this.refreshPromise
  }

  async executeAuthenticated<T>(execute: (accessToken: string) => Promise<T>, isUnauthorized: (result: T) => boolean) {
    const currentTokens = this.dependencies.readTokens()
    if (!currentTokens) throw new Error('No authentication tokens available')
    const revision = this.accountRevision
    const assertCurrentAccount = () => {
      if (revision !== this.accountRevision) throw new AccountSessionChangedError()
    }

    let initial: T
    try {
      initial = await execute(currentTokens.accessToken)
    } catch (error) {
      assertCurrentAccount()
      throw error
    }
    assertCurrentAccount()
    if (!isUnauthorized(initial)) return initial

    const latestTokens = this.dependencies.readTokens()
    if (!latestTokens) throw new AccountSessionChangedError()
    const retryTokens =
      latestTokens.accessToken === currentTokens.accessToken ? await this.refreshAccessToken() : latestTokens
    assertCurrentAccount()
    let retried: T
    try {
      retried = await execute(retryTokens.accessToken)
    } catch (error) {
      assertCurrentAccount()
      throw error
    }
    assertCurrentAccount()
    if (!isUnauthorized(retried)) return retried

    this.logout()
    throw new Error('Authentication failed after token refresh')
  }

  private provisionalAccount(tokens: SessionTokens): AccountSnapshot {
    return Object.freeze({
      userId: 0,
      email: normalizeEmail(tokens.email),
      roles: Object.freeze([]) as unknown as string[],
      accessTokenExpiresAt: decodeAccessTokenExpiry(tokens.accessToken, this.now() + 60 * 60 * 1000),
    })
  }

  private publish(next: AccountSessionSnapshot) {
    if (
      this.state.authenticated === next.authenticated &&
      this.state.account?.userId === next.account?.userId &&
      this.state.account?.email === next.account?.email &&
      this.state.account?.accessTokenExpiresAt === next.account?.accessTokenExpiresAt &&
      this.state.account?.roles.join('\u0000') === next.account?.roles.join('\u0000')
    ) {
      return
    }
    this.state = Object.freeze(next)
    for (const listener of this.listeners) listener()
  }
}
