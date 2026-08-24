// @vitest-environment jsdom

import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const testState = vi.hoisted(() => ({
  language: 'zh-Hans',
  languageInited: undefined as boolean | undefined,
}))

const testPlatform = vi.hoisted(() => ({
  type: 'mobile',
  locale: 'en',
}))

vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    getState: () => testState,
    setState: (nextState: Partial<typeof testState>) => Object.assign(testState, nextState),
  },
}))

vi.mock('@/platform', () => ({
  default: {
    get type() {
      return testPlatform.type
    },
    getLocale: vi.fn(async () => testPlatform.locale),
  },
}))

import { useSystemLanguageWhenInit } from './useDefaultSystemLanguage'

async function finishDeferredInitialization() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(2000)
  })
}

describe('useSystemLanguageWhenInit', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    testState.language = 'zh-Hans'
    testState.languageInited = undefined
    testPlatform.type = 'mobile'
    testPlatform.locale = 'en'
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('keeps Simplified Chinese on a fresh mobile installation', async () => {
    renderHook(() => useSystemLanguageWhenInit())

    await finishDeferredInitialization()

    expect(testState).toMatchObject({ language: 'zh-Hans', languageInited: true })
  })

  it('does not overwrite a language already chosen by the user', async () => {
    testState.language = 'en'
    testState.languageInited = true
    renderHook(() => useSystemLanguageWhenInit())

    await finishDeferredInitialization()

    expect(testState).toMatchObject({ language: 'en', languageInited: true })
  })
})
