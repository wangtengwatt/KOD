// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'
import { getSuanbaoAccountKey, sanitizeSuanbaoPreferences, suanbaoStore } from './suanbaoStore'

describe('Suanbao preference store', () => {
  beforeEach(() => {
    localStorage.clear()
    suanbaoStore.getState().switchAccount(null)
    suanbaoStore.getState().restore()
  })

  it('uses quiet disabled defaults for new users', () => {
    expect(sanitizeSuanbaoPreferences()).toMatchObject({
      schemaVersion: 2,
      enabled: false,
      hidden: false,
      activeMode: false,
      soundEnabled: false,
      position: { x: 0.9, y: 0.78 },
      animation: 'full',
      locked: false,
    })
  })

  it('persists independently for each account key', () => {
    suanbaoStore.getState().switchAccount('first@example.com')
    suanbaoStore.getState().setPreferences({ enabled: true, hidden: true, animation: 'off' })
    suanbaoStore.getState().switchAccount('second@example.com')
    expect(suanbaoStore.getState().hidden).toBe(false)
    expect(suanbaoStore.getState().enabled).toBe(false)
    suanbaoStore.getState().switchAccount('first@example.com')
    expect(suanbaoStore.getState().hidden).toBe(true)
    expect(suanbaoStore.getState().enabled).toBe(true)
    expect(getSuanbaoAccountKey('first@example.com')).not.toBe(getSuanbaoAccountKey('second@example.com'))
  })

  it('restores quiet defaults and position', () => {
    suanbaoStore.getState().setPreferences({
      enabled: true,
      hidden: true,
      activeMode: true,
      soundEnabled: true,
      position: { x: 0, y: 0 },
      animation: 'off',
      locked: true,
    })
    suanbaoStore.getState().restore()
    expect(suanbaoStore.getState()).toMatchObject({
      enabled: false,
      hidden: false,
      activeMode: false,
      soundEnabled: false,
      position: { x: 0.9, y: 0.78 },
      animation: 'full',
      locked: false,
    })
  })
})
