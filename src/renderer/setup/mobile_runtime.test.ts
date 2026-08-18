// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const safeArea = vi.hoisted(() => ({
  addListener: vi.fn(),
  getSafeAreaInsets: vi.fn(),
  getStatusBarHeight: vi.fn(),
}))
const keyboard = vi.hoisted(() => ({ addListener: vi.fn() }))

vi.mock('capacitor-plugin-safe-area', () => ({ SafeArea: safeArea }))
vi.mock('@capacitor/keyboard', () => ({ Keyboard: keyboard }))

describe('mobile runtime startup', () => {
  beforeEach(() => {
    vi.resetModules()
    safeArea.getSafeAreaInsets.mockResolvedValue({ insets: { top: 24, right: 0, bottom: 18, left: 0 } })
    safeArea.getStatusBarHeight.mockResolvedValue({ statusBarHeight: 24 })
    safeArea.addListener.mockResolvedValue({ remove: vi.fn() })
    keyboard.addListener.mockResolvedValue({ remove: vi.fn() })
  })

  afterEach(() => {
    vi.clearAllMocks()
    for (const edge of ['top', 'right', 'bottom', 'left']) {
      document.documentElement.style.removeProperty(`--mobile-safe-area-inset-${edge}`)
    }
  })

  it.each(['android', 'ios'] as const)('loads safe-area startup for %s mobile builds', async (platform) => {
    const runtime = await vi.importActual<Record<string, unknown>>('./mobile_runtime').catch(() => null)
    expect(runtime, 'the mobile runtime initializer must exist').not.toBeNull()
    if (!runtime) return

    const loadSafeArea = vi.fn().mockResolvedValue({ initializeMobileSafeArea: vi.fn() })
    const initialize = runtime.initializeMobileRuntime as (
      target: string,
      platform: string,
      loader: typeof loadSafeArea
    ) => Promise<void>
    await initialize('mobile_app', platform, loadSafeArea)

    expect(loadSafeArea).toHaveBeenCalledTimes(1)
  })

  it('does not load native safe-area startup for desktop builds', async () => {
    const runtime = await vi.importActual<Record<string, unknown>>('./mobile_runtime').catch(() => null)
    expect(runtime, 'the mobile runtime initializer must exist').not.toBeNull()
    if (!runtime) return

    const loadSafeArea = vi.fn()
    const initialize = runtime.initializeMobileRuntime as (
      target: string,
      platform: string,
      loader: typeof loadSafeArea
    ) => Promise<void>
    await initialize('unknown', 'windows', loadSafeArea)

    expect(loadSafeArea).not.toHaveBeenCalled()
  })

  it('initializes the safe-area CSS variables from the native plugin', async () => {
    const safeAreaModule = await vi.importActual<Record<string, unknown>>('./mobile_safe_area')
    expect(typeof safeAreaModule.initializeMobileSafeArea).toBe('function')
    if (typeof safeAreaModule.initializeMobileSafeArea !== 'function') return

    await safeAreaModule.initializeMobileSafeArea()

    expect(document.documentElement.style.getPropertyValue('--mobile-safe-area-inset-top')).toBe('24px')
    expect(document.documentElement.style.getPropertyValue('--mobile-safe-area-inset-bottom')).toBe('18px')
  })
})
