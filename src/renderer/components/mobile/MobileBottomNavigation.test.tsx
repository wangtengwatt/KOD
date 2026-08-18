// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()
const shellState = vi.hoisted(() => ({ pathname: '/', platformType: 'mobile' as 'mobile' | 'desktop' }))

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useLocation: () => ({ pathname: shellState.pathname }),
    useNavigate: () => navigate,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'zh-Hans' } }),
}))

vi.mock('@/platform', () => ({
  default: {
    get type() {
      return shellState.platformType
    },
  },
}))

describe('MobileBottomNavigation', () => {
  beforeAll(() => {
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
      })),
    })
  })

  beforeEach(() => {
    navigate.mockClear()
    shellState.pathname = '/'
    shellState.platformType = 'mobile'
  })

  afterEach(() => document.body.replaceChildren())

  it('exposes the five mobile top-level entries in product order', async () => {
    const mobileNavigation = await vi
      .importActual<Record<string, unknown>>('./MobileBottomNavigation')
      .catch(() => null)

    expect(mobileNavigation, 'the mobile bottom navigation module must exist').not.toBeNull()
    if (!mobileNavigation) return

    const MobileBottomNavigation = mobileNavigation.MobileBottomNavigation as React.ComponentType
    render(
      <MantineProvider>
        <MobileBottomNavigation />
      </MantineProvider>
    )

    const entries = [
      ['对话', '/'],
      ['生图', '/image-creator'],
      ['视频', '/video-creator'],
      ['算力', '/compute-center'],
      ['我的', '/mobile-my'],
    ] as const

    expect(screen.getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(
      entries.map(([label]) => label)
    )

    for (const [label, to] of entries) {
      fireEvent.click(screen.getByRole('button', { name: label }))
      expect(navigate).toHaveBeenLastCalledWith({ to })
    }
  })

  it.each([
    ['/', '对话'],
    ['/session/active-session', '对话'],
    ['/image-creator', '生图'],
    ['/video-creator', '视频'],
    ['/compute-center', '算力'],
    ['/mobile-my', '我的'],
    ['/settings', '我的'],
  ])('marks only %s destination active', async (pathname, activeLabel) => {
    shellState.pathname = pathname
    const { MobileBottomNavigation } = await import('./MobileBottomNavigation')

    render(
      <MantineProvider>
        <MobileBottomNavigation />
      </MantineProvider>
    )

    const activeEntries = screen
      .getAllByRole('button')
      .filter((button) => button.getAttribute('aria-current') === 'page')
    expect(activeEntries).toHaveLength(1)
    expect(activeEntries[0]?.getAttribute('aria-label')).toBe(activeLabel)
  })

  it('suppresses the navigation on non-mobile platforms', async () => {
    shellState.platformType = 'desktop'
    const { MobileBottomNavigation } = await import('./MobileBottomNavigation')

    render(
      <MantineProvider>
        <MobileBottomNavigation />
      </MantineProvider>
    )

    expect(screen.queryByRole('navigation')).toBeNull()
  })
})
