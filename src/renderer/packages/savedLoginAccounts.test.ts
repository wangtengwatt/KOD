import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { deleteSavedLoginAccount, listSavedLoginAccounts, saveLoginAccount } from './savedLoginAccounts'

function createStorage(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (key) => data.get(key) ?? null,
    key: (index) => [...data.keys()][index] ?? null,
    removeItem: (key) => data.delete(key),
    setItem: (key, value) => data.set(key, value),
  }
}

describe('saved login accounts', () => {
  beforeEach(() => {
    vi.stubGlobal('window', { localStorage: createStorage() })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('stores multiple web emails without storing passwords', async () => {
    await saveLoginAccount('First@Example.com ', 'secret-one')
    await saveLoginAccount('second@example.com', 'secret-two')
    await saveLoginAccount('first@example.com', 'new-secret')

    const result = await listSavedLoginAccounts()
    expect(result.passwordStorageAvailable).toBe(false)
    expect(result.accounts.map((item) => item.email)).toEqual(['first@example.com', 'second@example.com'])
    expect(result.accounts.every((item) => item.password === undefined)).toBe(true)
    expect(window.localStorage.getItem('kod-saved-login-emails-v1')).not.toContain('secret')
  })

  it('deletes one web account without affecting the others', async () => {
    await saveLoginAccount('first@example.com', 'one')
    await saveLoginAccount('second@example.com', 'two')

    const result = await deleteSavedLoginAccount('second@example.com')
    expect(result.accounts.map((item) => item.email)).toEqual(['first@example.com'])
  })

  it('delegates desktop password storage to the main process', async () => {
    const invoke = vi.fn().mockResolvedValue({
      accounts: [{ email: 'desktop@example.com', password: 'decrypted', updatedAt: 1 }],
      passwordStorageAvailable: true,
    })
    vi.stubGlobal('window', { electronAPI: { invoke }, localStorage: createStorage() })

    await saveLoginAccount('desktop@example.com', 'encrypted-by-main')
    await listSavedLoginAccounts()
    await deleteSavedLoginAccount('desktop@example.com')

    expect(invoke).toHaveBeenNthCalledWith(1, 'kod-login:save-account', 'desktop@example.com', 'encrypted-by-main')
    expect(invoke).toHaveBeenNthCalledWith(2, 'kod-login:list-saved-accounts')
    expect(invoke).toHaveBeenNthCalledWith(3, 'kod-login:delete-account', 'desktop@example.com')
    expect(window.localStorage.length).toBe(0)
  })
})
