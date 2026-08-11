import type { SuanbaoAnimation, SuanbaoPosition, SuanbaoPreferences } from '@shared/types/suanbao'
import { createStore, useStore } from 'zustand'
import { deriveAccountKey } from '@/storage/accountKey'
import { authInfoStore } from '@/stores/authInfoStore'
import { clampNormalizedPosition, DEFAULT_SUANBAO_POSITION } from './suanbaoUtils'

export type { SuanbaoAnimation, SuanbaoPreferences }

interface StoredSuanbaoPreferences extends SuanbaoPreferences {
  position: SuanbaoPosition
}

const DEFAULT_PREFERENCES: StoredSuanbaoPreferences = {
  schemaVersion: 2,
  enabled: false,
  hidden: false,
  activeMode: false,
  soundEnabled: false,
  animation: 'full',
  locked: false,
  desktopOverlayEnabled: true,
  notificationsEnabled: false,
  locationMode: 'off',
  calendarEnabled: false,
  position: DEFAULT_SUANBAO_POSITION,
}
const STORAGE_PREFIX = 'suanbao-preferences-v1'

export function getSuanbaoAccountKey(email?: string | null): string {
  return email ? deriveAccountKey(email) : 'guest'
}

export function sanitizeSuanbaoPreferences(
  value?: Partial<StoredSuanbaoPreferences> | null
): StoredSuanbaoPreferences {
  return {
    schemaVersion: 2,
    enabled: value?.enabled ?? false,
    hidden: value?.hidden ?? false,
    activeMode: value?.activeMode ?? false,
    soundEnabled: value?.soundEnabled ?? false,
    position: clampNormalizedPosition(value?.position ?? DEFAULT_SUANBAO_POSITION),
    animation: ['full', 'reduced', 'off'].includes(value?.animation || '')
      ? (value?.animation as SuanbaoAnimation)
      : 'full',
    locked: value?.locked ?? false,
    desktopOverlayEnabled: value?.desktopOverlayEnabled ?? true,
    notificationsEnabled: value?.notificationsEnabled ?? false,
    locationMode: ['permission', 'manual', 'off'].includes(value?.locationMode || '')
      ? (value?.locationMode as StoredSuanbaoPreferences['locationMode'])
      : 'off',
    calendarEnabled: value?.calendarEnabled ?? false,
    doNotDisturb: value?.doNotDisturb,
  }
}

const storageKey = (accountKey: string) => `${STORAGE_PREFIX}:${accountKey}`

function getLocalStorage(): Storage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage
  } catch {
    return null
  }
}

function persist(accountKey: string, preferences: StoredSuanbaoPreferences): void {
  try {
    getLocalStorage()?.setItem(storageKey(accountKey), JSON.stringify(preferences))
  } catch {
    // Preferences remain active in memory when storage is unavailable.
  }
}

function load(accountKey: string): StoredSuanbaoPreferences {
  try {
    const raw = getLocalStorage()?.getItem(storageKey(accountKey))
    if (!raw) return { ...DEFAULT_PREFERENCES, position: { ...DEFAULT_PREFERENCES.position } }
    const parsed = JSON.parse(raw) as Partial<StoredSuanbaoPreferences>
    // A stored V1 value is an explicit user choice, so preserve its enabled flag.
    return sanitizeSuanbaoPreferences(parsed)
  } catch {
    return { ...DEFAULT_PREFERENCES, position: { ...DEFAULT_PREFERENCES.position } }
  }
}

interface SuanbaoState extends StoredSuanbaoPreferences {
  accountKey: string
  setPreferences: (preferences: Partial<StoredSuanbaoPreferences>) => void
  restore: () => void
  switchAccount: (email?: string | null) => void
}

const initialAccountKey = getSuanbaoAccountKey(authInfoStore.getState().loginEmail)
export const suanbaoStore = createStore<SuanbaoState>((set, get) => ({
  accountKey: initialAccountKey,
  ...load(initialAccountKey),
  setPreferences: (preferences) => {
    const next = sanitizeSuanbaoPreferences({ ...get(), ...preferences })
    persist(get().accountKey, next)
    set(next)
  },
  restore: () => {
    const next = { ...DEFAULT_PREFERENCES, position: { ...DEFAULT_PREFERENCES.position } }
    persist(get().accountKey, next)
    set(next)
  },
  switchAccount: (email) => {
    const accountKey = getSuanbaoAccountKey(email)
    set({ accountKey, ...load(accountKey) })
  },
}))

authInfoStore.subscribe(
  (state) => state.loginEmail,
  (email) => suanbaoStore.getState().switchAccount(email)
)

export function useSuanbaoStore<U>(selector: Parameters<typeof useStore<typeof suanbaoStore, U>>[1]) {
  return useStore<typeof suanbaoStore, U>(suanbaoStore, selector)
}
