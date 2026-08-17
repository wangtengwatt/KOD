import { beforeEach, describe, expect, it, vi } from 'vitest'

type PersistedSettings = Record<string, unknown> | null

async function loadSettingsStoreModule(
  persistedSettings: PersistedSettings = null,
  platformType: 'desktop' | 'mobile' = 'desktop'
) {
  vi.resetModules()

  const mockStorage = {
    getItem: vi.fn(async (key: string, initialValue: unknown) => {
      if (key === 'settings') {
        return persistedSettings
      }
      return initialValue
    }),
    setItem: vi.fn(async () => undefined),
    removeItem: vi.fn(async () => undefined),
  }

  vi.doMock('@/platform', () => ({
    default: {
      type: platformType,
      ensureShortcutConfig: vi.fn(),
      ensureProxyConfig: vi.fn(),
      ensureAutoLaunch: vi.fn(),
      appLog: vi.fn(async () => undefined),
    },
  }))

  vi.doMock('@/storage', () => ({
    default: mockStorage,
  }))

  const settingsStoreModule = await import('./settingsStore')
  const providerSettingsModule = await import('./providerSettings')

  return {
    ...settingsStoreModule,
    ...providerSettingsModule,
    mockStorage,
  }
}

async function waitForPersistCall(assertion: () => void, attempts = 10) {
  let lastError: unknown

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      assertion()
      return
    } catch (error) {
      lastError = error
      await new Promise((resolve) => setTimeout(resolve, 0))
    }
  }

  throw lastError
}

describe('settingsStore persistence', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.clearAllMocks()
    vi.unmock('@/platform')
    vi.unmock('@/storage')
  })

  it('rehydrates persisted provider and custom provider settings', async () => {
    const persistedSettings = {
      providers: {
        openai: {
          apiKey: 'sk-openai',
          models: [{ modelId: 'gpt-5' }],
        },
      },
      customProviders: [
        {
          id: 'custom-openai',
          name: 'Custom OpenAI',
          type: 'openai',
          isCustom: true,
        },
      ],
      __version: 6,
    }

    const { initSettingsStore, settingsStore } = await loadSettingsStoreModule(persistedSettings)

    const hydrated = await initSettingsStore()

    expect(hydrated.providers?.openai?.apiKey).toBe('sk-openai')
    expect(hydrated.providers?.openai?.models).toEqual([{ modelId: 'gpt-5' }])
    expect(hydrated.customProviders).toEqual([
      {
        id: 'custom-openai',
        name: 'Custom OpenAI',
        type: 'openai',
        isCustom: true,
      },
    ])
    expect(settingsStore.getState().providers?.openai?.apiKey).toBe('sk-openai')
  })

  it('persists merged provider settings without dropping sibling providers', async () => {
    const persistedSettings = {
      providers: {
        claude: {
          apiKey: 'sk-claude',
        },
      },
      __version: 5,
    }

    const { initSettingsStore, settingsStore, mergeProviderSettings, mockStorage } =
      await loadSettingsStoreModule(persistedSettings)

    await initSettingsStore()

    settingsStore.setState((currentSettings) =>
      mergeProviderSettings(currentSettings, 'openai', {
        apiKey: 'sk-openai',
        apiHost: 'https://api.openai.com',
      })
    )

    await waitForPersistCall(() => {
      expect(mockStorage.setItem).toHaveBeenCalled()
    })

    const lastPersistCall = mockStorage.setItem.mock.calls.at(-1)
    expect(lastPersistCall).toBeDefined()
    if (!lastPersistCall) {
      throw new Error('Expected settings persistence call to exist')
    }

    const [storageKey, persistedValue] = lastPersistCall as unknown as [string, Record<string, unknown>]

    expect(storageKey).toBe('settings')
    expect(persistedValue).toMatchObject({
      providers: {
        claude: {
          apiKey: 'sk-claude',
        },
        openai: {
          apiKey: 'sk-openai',
          apiHost: 'https://api.openai.com',
        },
      },
      __version: 6,
    })
  })

  it.each([
    { name: 'missing settings', persisted: null, expected: 'zh-Hans' },
    { name: 'missing language', persisted: { __version: 4 }, expected: 'zh-Hans' },
    { name: 'invalid language', persisted: { language: 'invalid', __version: 4 }, expected: 'zh-Hans' },
    { name: 'explicit English', persisted: { language: 'en', __version: 4 }, expected: 'en' },
    { name: 'explicit Traditional Chinese', persisted: { language: 'zh-Hant', __version: 4 }, expected: 'zh-Hant' },
    { name: 'explicit language without init marker', persisted: { language: 'ja', __version: 4 }, expected: 'ja' },
  ])('uses the correct language for $name', async ({ persisted, expected }) => {
    const { initSettingsStore } = await loadSettingsStoreModule(persisted)

    const hydrated = await initSettingsStore()

    expect(hydrated.language).toBe(expected)
  })

  it('migrates an existing mobile installation to Simplified Chinese once', async () => {
    const { initSettingsStore } = await loadSettingsStoreModule(
      { language: 'en', languageInited: true, __version: 5 },
      'mobile'
    )

    const hydrated = await initSettingsStore()

    expect(hydrated.language).toBe('zh-Hans')
    expect(hydrated.languageInited).toBe(true)
  })

  it('backfills suanbao preferences when missing from persisted settings', async () => {
    // 旧用户（persist 版本 4）无 suanbao 字段：经 deepmerge(defaults.settings()) 回填默认偏好
    const persistedSettings = { __version: 4 }
    const { initSettingsStore } = await loadSettingsStoreModule(persistedSettings)

    const hydrated = await initSettingsStore()

    expect(hydrated.suanbao).toBeDefined()
    expect(hydrated.suanbao).toMatchObject({
      schemaVersion: 2,
      enabled: false,
      hidden: false,
      activeMode: false,
      soundEnabled: false,
      animation: 'full',
      locked: false,
      desktopOverlayEnabled: false,
      notificationsEnabled: false,
      locationMode: 'off',
      calendarEnabled: false,
    })
  })

  it('preserves explicit suanbao preferences from persisted settings', async () => {
    // 已有 suanbao 偏好的用户（persist 版本 5）：用户值保留，缺失子字段由 schema 回退
    const persistedSettings = {
      __version: 5,
      suanbao: {
        schemaVersion: 2,
        enabled: true,
        hidden: true,
        activeMode: true,
        soundEnabled: true,
        animation: 'reduced',
        locked: true,
        desktopOverlayEnabled: true,
        notificationsEnabled: true,
        locationMode: 'manual',
        calendarEnabled: true,
      },
    }
    const { initSettingsStore } = await loadSettingsStoreModule(persistedSettings)

    const hydrated = await initSettingsStore()

    expect(hydrated.suanbao).toMatchObject({
      enabled: true,
      animation: 'reduced',
      locked: true,
      locationMode: 'manual',
      calendarEnabled: true,
    })
  })
})
