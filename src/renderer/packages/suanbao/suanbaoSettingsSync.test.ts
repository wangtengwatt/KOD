// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SuanbaoPreferences } from '@shared/types/suanbao'

const mocks = vi.hoisted(() => ({
  setState: vi.fn(),
  hasHydrated: vi.fn(() => false),
  onFinishHydration: vi.fn(),
}))

vi.mock('@/stores/settingsStore', () => ({
  settingsStore: {
    setState: mocks.setState,
    persist: {
      hasHydrated: mocks.hasHydrated,
      onFinishHydration: mocks.onFinishHydration,
    },
  },
}))

// eslint-disable-next-line import/first
import { suanbaoStore } from '@/components/suanbao/suanbaoStore'
// eslint-disable-next-line import/first
import { migrateSuanbaoV1PrefsToSettings } from './suanbaoSettingsSync'

describe('migrateSuanbaoV1PrefsToSettings (§10.5 V1 迁移)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorage.clear()
    suanbaoStore.getState().switchAccount(null)
    suanbaoStore.getState().restore()
    mocks.hasHydrated.mockReturnValue(true)
  })

  it('把当前 V1 偏好（去 position）写到 settingsStore.suanbao + 记迁移标记', () => {
    suanbaoStore.getState().setPreferences({ enabled: true, animation: 'off', locked: true })

    migrateSuanbaoV1PrefsToSettings()

    expect(mocks.setState).toHaveBeenCalledOnce()
    const arg = mocks.setState.mock.calls[0][0] as { suanbao: SuanbaoPreferences }
    expect(arg.suanbao).toMatchObject({ enabled: true, animation: 'off', locked: true })
    // position 是设备态（arch §10.1），不进 Settings.suanbao
    expect(arg.suanbao).not.toHaveProperty('position')
    expect(arg.suanbao).not.toHaveProperty('accountKey')
    expect(localStorage.getItem('suanbao-v1-migrated')).toBe('1')
  })

  it('幂等：已迁移标记后不再写', () => {
    suanbaoStore.getState().setPreferences({ enabled: true })
    migrateSuanbaoV1PrefsToSettings()
    mocks.setState.mockClear()

    migrateSuanbaoV1PrefsToSettings()

    expect(mocks.setState).not.toHaveBeenCalled()
  })

  it('hydration 未完成时不迁移', () => {
    mocks.hasHydrated.mockReturnValue(false)
    suanbaoStore.getState().setPreferences({ enabled: true })

    migrateSuanbaoV1PrefsToSettings()

    expect(mocks.setState).not.toHaveBeenCalled()
    expect(localStorage.getItem('suanbao-v1-migrated')).toBeNull()
  })
})
