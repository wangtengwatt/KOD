// @vitest-environment jsdom

import { MantineProvider } from '@mantine/core'
import { fireEvent, render, screen } from '@testing-library/react'
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

const navigate = vi.fn()

vi.mock('@tanstack/react-router', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-router')>()
  return {
    ...actual,
    useLocation: () => ({ pathname: '/' }),
    useNavigate: () => navigate,
  }
})

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { resolvedLanguage: 'zh-Hans' } }),
}))

vi.mock('@/platform', () => ({
  default: { type: 'mobile' },
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

  beforeEach(() => navigate.mockClear())

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
})
