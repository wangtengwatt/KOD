import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import {
  AccountSessionService,
  type AccountSessionServiceDependencies,
  type AccountSnapshot,
  type SessionTokens,
} from './AccountSessionService'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise
    reject = rejectPromise
  })
  return { promise, resolve, reject }
}

function createHarness(initialTokens: SessionTokens | null = null) {
  let tokens = initialTokens
  const events: string[] = []
  const refreshTokens = vi.fn<NonNullable<AccountSessionServiceDependencies['refreshTokens']>>()
  const clearAccountCaches = vi.fn(() => {
    events.push('clear-caches')
  })
  const dependencies: AccountSessionServiceDependencies = {
    readTokens: () => tokens,
    persistTokens: (next) => {
      events.push(`persist:${next.email ?? ''}`)
      tokens = next
    },
    clearTokens: () => {
      events.push('clear-tokens')
      tokens = null
    },
    refreshTokens,
    clearAccountCaches,
    now: () => 1_700_000_000_000,
  }
  return {
    service: new AccountSessionService(dependencies),
    dependencies,
    events,
    getTokens: () => tokens,
    setPersistedTokens: (next: SessionTokens | null) => {
      tokens = next
    },
  }
}

function identity(overrides: Partial<AccountSnapshot> = {}): AccountSnapshot {
  return {
    userId: 17,
    email: 'member@kod.test',
    roles: ['BUYER', 'SUPPLIER'],
    accessTokenExpiresAt: 1_800_000_000_000,
    ...overrides,
  }
}

describe('AccountSessionService', () => {
  it('keeps route-level login and logout mutations behind the canonical service', () => {
    const routeFiles = [
      'src/renderer/routes/settings/provider/chatbox-ai/-components/useAuthTokens.ts',
      'src/renderer/routes/guide/-components/ActionButton.tsx',
      'src/renderer/routes/guide/-hooks/useGuideSession.ts',
      'src/renderer/routes/settings/provider/chatbox-ai/-components/accountDeletion.ts',
      'src/renderer/routes/compute-center.tsx',
      'src/renderer/routes/mobile-my.tsx',
    ]

    for (const file of routeFiles) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/authInfoStore\.getState\(\)\.(?:setTokens|clearTokens)/)
      expect(source, file).not.toMatch(/useAuthInfoStore\([^)]*=>[^)]*(?:accessToken|refreshToken)/s)
    }
  })

  it('publishes one immutable email and role snapshot to every consumer', async () => {
    const { service } = createHarness()
    const mobileSnapshots: Array<AccountSnapshot | null> = []
    const computeSnapshots: Array<AccountSnapshot | null> = []
    service.subscribe(() => mobileSnapshots.push(service.getSnapshot().account))
    service.subscribe(() => computeSnapshots.push(service.getSnapshot().account))

    await service.login({ accessToken: 'access-a', refreshToken: 'refresh-a', email: 'MEMBER@KOD.TEST ' })
    await service.refreshIdentity(async () => identity())

    expect(service.getSnapshot()).toMatchObject({ authenticated: true, account: identity() })
    expect(mobileSnapshots.at(-1)).toBe(computeSnapshots.at(-1))
    expect(mobileSnapshots.at(-1)).toEqual(identity())
  })

  it('performs one refresh for concurrent 401 responses and retries both requests', async () => {
    const { service, dependencies } = createHarness({
      accessToken: 'expired-access',
      refreshToken: 'refresh-a',
      email: 'member@kod.test',
    })
    const pendingRefresh = deferred<SessionTokens>()
    vi.mocked(dependencies.refreshTokens).mockReturnValue(pendingRefresh.promise)
    const calls: string[] = []
    const request = vi.fn((accessToken: string) => {
      calls.push(accessToken)
      return Promise.resolve({ status: accessToken === 'expired-access' ? 401 : 200 })
    })

    const first = service.executeAuthenticated(request, (result) => result.status === 401)
    const second = service.executeAuthenticated(request, (result) => result.status === 401)
    await vi.waitFor(() => expect(dependencies.refreshTokens).toHaveBeenCalledTimes(1))
    pendingRefresh.resolve({ accessToken: 'fresh-access', refreshToken: 'refresh-b', email: 'member@kod.test' })

    await expect(Promise.all([first, second])).resolves.toEqual([{ status: 200 }, { status: 200 }])
    expect(dependencies.refreshTokens).toHaveBeenCalledTimes(1)
    expect(calls.filter((token) => token === 'fresh-access')).toHaveLength(2)
  })

  it('reuses a completed concurrent refresh when another original 401 arrives late', async () => {
    const { service, dependencies } = createHarness({
      accessToken: 'expired-access',
      refreshToken: 'refresh-a',
      email: 'member@kod.test',
    })
    vi.mocked(dependencies.refreshTokens).mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'refresh-b',
      email: 'member@kod.test',
    })
    const lateInitialResponse = deferred<{ status: number }>()
    let expiredCalls = 0
    const request = vi.fn((accessToken: string) => {
      if (accessToken !== 'expired-access') return Promise.resolve({ status: 200 })
      expiredCalls += 1
      return expiredCalls === 1 ? Promise.resolve({ status: 401 }) : lateInitialResponse.promise
    })

    const first = service.executeAuthenticated(request, (result) => result.status === 401)
    const second = service.executeAuthenticated(request, (result) => result.status === 401)
    await expect(first).resolves.toEqual({ status: 200 })
    lateInitialResponse.resolve({ status: 401 })
    await expect(second).resolves.toEqual({ status: 200 })

    expect(dependencies.refreshTokens).toHaveBeenCalledTimes(1)
  })

  it('reuses the completed refresh for a late remote 401 carrying the replaced refresh token', async () => {
    const { service, dependencies } = createHarness({
      accessToken: 'expired-access',
      refreshToken: 'refresh-a',
      email: 'member@kod.test',
    })
    vi.mocked(dependencies.refreshTokens).mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'refresh-b',
      email: 'member@kod.test',
    })

    await expect(service.refreshAccessToken('refresh-a')).resolves.toMatchObject({ accessToken: 'fresh-access' })
    await expect(service.refreshAccessToken('refresh-a')).resolves.toMatchObject({ accessToken: 'fresh-access' })

    expect(dependencies.refreshTokens).toHaveBeenCalledTimes(1)
  })

  it('keeps the canonical account snapshot deeply immutable after a token refresh', async () => {
    const { service, dependencies } = createHarness({
      accessToken: 'expired-access',
      refreshToken: 'refresh-a',
      email: 'member@kod.test',
    })
    service.updateIdentity(identity())
    vi.mocked(dependencies.refreshTokens).mockResolvedValue({
      accessToken: 'fresh-access',
      refreshToken: 'refresh-b',
      email: 'member@kod.test',
    })

    await service.refreshAccessToken()

    const account = service.getSnapshot().account
    expect(Object.isFrozen(account)).toBe(true)
    expect(Object.isFrozen(account?.roles)).toBe(true)
  })

  it('atomically signs every consumer out when the shared refresh fails', async () => {
    const { service, dependencies, getTokens } = createHarness({
      accessToken: 'expired-access',
      refreshToken: 'refresh-a',
      email: 'member@kod.test',
    })
    service.updateIdentity(identity())
    vi.mocked(dependencies.refreshTokens).mockRejectedValue(new Error('refresh rejected'))
    const mobileStates: boolean[] = []
    const computeStates: boolean[] = []
    service.subscribe(() => mobileStates.push(service.getSnapshot().authenticated))
    service.subscribe(() => computeStates.push(service.getSnapshot().authenticated))

    const attempt = service.executeAuthenticated(
      async () => ({ status: 401 }),
      (result) => result.status === 401
    )

    await expect(attempt).rejects.toThrow('refresh rejected')
    expect(getTokens()).toBeNull()
    expect(service.getSnapshot()).toMatchObject({ authenticated: false, account: null })
    expect(mobileStates.at(-1)).toBe(false)
    expect(computeStates.at(-1)).toBe(false)
    expect(dependencies.clearAccountCaches).toHaveBeenCalledTimes(1)
  })

  it('makes repeated logout calls idempotent so fallback handlers cannot purge anonymous data', () => {
    const { service, dependencies } = createHarness({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      email: 'member@kod.test',
    })

    service.logout()
    service.logout()

    expect(dependencies.clearAccountCaches).toHaveBeenCalledTimes(1)
  })

  it('clears old credentials, identity and account caches before persisting a switched account', async () => {
    const { service, events } = createHarness({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      email: 'old@kod.test',
    })
    service.updateIdentity(identity({ userId: 1, email: 'old@kod.test', roles: ['ADMIN'] }))

    await service.switchAccount({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })

    expect(events).toEqual(['clear-tokens', 'clear-caches', 'persist:new@kod.test'])
    expect(service.getSnapshot().account).toMatchObject({ userId: 0, email: 'new@kod.test', roles: [] })
  })

  it('keeps email and roles synchronized when the authoritative identity is refreshed', async () => {
    const { service } = createHarness({
      accessToken: 'access-a',
      refreshToken: 'refresh-a',
      email: 'stale@kod.test',
    })
    const refreshed = identity({ userId: 44, email: 'fresh@kod.test', roles: ['ADMIN', 'BUYER'] })

    await service.refreshIdentity(async () => refreshed)

    expect(service.getSnapshot().account).toEqual(refreshed)
  })

  it('does not let an old account identity response overwrite a switched account', async () => {
    const { service } = createHarness({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      email: 'old@kod.test',
    })
    const pendingIdentity = deferred<AccountSnapshot>()
    const oldRefresh = service.refreshIdentity(() => pendingIdentity.promise)

    await service.switchAccount({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    pendingIdentity.resolve(identity({ userId: 1, email: 'old@kod.test', roles: ['ADMIN'] }))
    await oldRefresh

    expect(service.getSnapshot().account).toMatchObject({ userId: 0, email: 'new@kod.test', roles: [] })
  })

  it('does not let an old account token refresh overwrite a switched account', async () => {
    const { service, dependencies, getTokens } = createHarness({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      email: 'old@kod.test',
    })
    const pendingRefresh = deferred<SessionTokens>()
    vi.mocked(dependencies.refreshTokens).mockReturnValue(pendingRefresh.promise)
    const oldRefresh = service.refreshAccessToken()

    await service.switchAccount({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    pendingRefresh.resolve({
      accessToken: 'refreshed-old-access',
      refreshToken: 'refreshed-old-refresh',
      email: 'old@kod.test',
    })

    await expect(oldRefresh).rejects.toThrow(/session changed/i)
    expect(getTokens()).toEqual({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    expect(service.getSnapshot()).toMatchObject({
      authenticated: true,
      account: { email: 'new@kod.test', roles: [] },
    })
  })

  it('rejects a successful old-account response that arrives after an account switch', async () => {
    const { service } = createHarness({
      accessToken: 'old-access',
      refreshToken: 'old-refresh',
      email: 'old@kod.test',
    })
    const pendingResponse = deferred<{ status: number; owner: string }>()
    const oldRequest = service.executeAuthenticated(
      () => pendingResponse.promise,
      (response) => response.status === 401
    )

    await service.switchAccount({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    pendingResponse.resolve({ status: 200, owner: 'old@kod.test' })

    await expect(oldRequest).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
  })

  it('rejects a successful refreshed response if the account switches while retrying', async () => {
    const { service, dependencies } = createHarness({
      accessToken: 'expired-access',
      refreshToken: 'old-refresh',
      email: 'old@kod.test',
    })
    vi.mocked(dependencies.refreshTokens).mockResolvedValue({
      accessToken: 'fresh-old-access',
      refreshToken: 'fresh-old-refresh',
      email: 'old@kod.test',
    })
    const pendingRetry = deferred<{ status: number; owner: string }>()
    const execute = vi.fn((accessToken: string) =>
      accessToken === 'expired-access' ? Promise.resolve({ status: 401, owner: 'old@kod.test' }) : pendingRetry.promise
    )
    const oldRequest = service.executeAuthenticated(execute, (response) => response.status === 401)
    await vi.waitFor(() => expect(execute).toHaveBeenCalledWith('fresh-old-access'))

    await service.switchAccount({
      accessToken: 'new-access',
      refreshToken: 'new-refresh',
      email: 'new@kod.test',
    })
    pendingRetry.resolve({ status: 200, owner: 'old@kod.test' })

    await expect(oldRequest).rejects.toMatchObject({ name: 'AccountSessionChangedError' })
  })

  it('adopts credentials restored after delayed persisted-store hydration', () => {
    const { service, setPersistedTokens } = createHarness()
    setPersistedTokens({
      accessToken: 'hydrated-access',
      refreshToken: 'hydrated-refresh',
      email: 'Hydrated@Kod.Test ',
    })

    service.synchronizeFromPersistence()

    expect(service.getSnapshot()).toMatchObject({
      authenticated: true,
      account: { userId: 0, email: 'hydrated@kod.test', roles: [] },
    })
  })
})
