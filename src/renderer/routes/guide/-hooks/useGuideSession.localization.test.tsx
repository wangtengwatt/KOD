// @vitest-environment jsdom

import { renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import i18n from '@/i18n'
import { useGuideSession } from './useGuideSession'

const settings = vi.hoisted(() => ({
  language: 'zh-Hans',
  languageInited: false,
}))

vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => ({
      licenseKey: '',
      providers: {},
      setSettings: vi.fn(),
    }),
  },
  useSettingsStore: (selector: (state: typeof settings) => unknown) => selector(settings),
}))

vi.mock('@/stores/onboardingStore', () => ({
  onboardingStore: {
    getState: () => ({ markCompleted: vi.fn(), reset: vi.fn() }),
  },
  useOnboardingStore: (selector: (state: { completed: boolean }) => unknown) => selector({ completed: false }),
}))

vi.mock('@/packages/session/accountSession', () => ({
  accountSessionService: { logout: vi.fn() },
  useAccountSessionSnapshot: () => ({ authenticated: false, account: null }),
}))

describe('useGuideSession language detection hint', () => {
  beforeEach(async () => {
    settings.language = 'zh-Hans'
    settings.languageInited = false
    await i18n.changeLanguage('zh-Hans')
  })

  afterEach(async () => {
    await i18n.changeLanguage('zh-Hans')
  })

  it('shows the real Simplified Chinese copy while the default mobile language is initializing', async () => {
    const { result } = renderHook(() => useGuideSession())

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('正在检测你的语言…')
    })
  })

  it('keeps the explicit English copy when English is selected', async () => {
    settings.language = 'en'
    await i18n.changeLanguage('en')

    const { result } = renderHook(() => useGuideSession())

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('Detecting your language...')
    })
  })

  it('updates the temporary hint when persisted settings restore English after mount', async () => {
    const { result, rerender } = renderHook(() => useGuideSession())

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('正在检测你的语言…')
    })

    settings.language = 'en'
    await i18n.changeLanguage('en')
    rerender()

    await waitFor(() => {
      expect(result.current.messages[0]?.content).toBe('Detecting your language...')
    })
  })
})
